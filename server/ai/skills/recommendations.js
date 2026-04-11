// ============================================
// PRODUCT RECOMMENDATIONS ENGINE
// ============================================
const db = require('../../utils/jsonDB');

// ── Collaborative filtering ───────────────────────────────────────────────────
function getRecommendations(userId, limit = 10) {
    // Find products purchased by users who also bought what this user bought
    const userOrders = db.find('orders', o => o.userId === userId);
    const userProductIds = new Set();
    for (const order of userOrders) {
        for (const item of (order.items || [])) {
            userProductIds.add(item.productId);
        }
    }

    // Find other users who bought the same products
    const similarUserIds = new Set();
    if (userProductIds.size > 0) {
        const allOrders = db.find('orders', o => o.userId !== userId);
        for (const order of allOrders) {
            for (const item of (order.items || [])) {
                if (userProductIds.has(item.productId)) {
                    similarUserIds.add(order.userId);
                }
            }
        }
    }

    // Find products bought by similar users but not by this user
    const candidateScores = {};
    const similarOrders = db.find('orders', o => similarUserIds.has(o.userId));
    for (const order of similarOrders) {
        for (const item of (order.items || [])) {
            if (!userProductIds.has(item.productId)) {
                candidateScores[item.productId] = (candidateScores[item.productId] || 0) + 1;
            }
        }
    }

    const sorted = Object.entries(candidateScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([productId]) => productId);

    // Fallback: top-selling products if no collaborative data
    if (sorted.length === 0) {
        const products = db.find('products', p => p.status === 'active');
        products.sort((a, b) => (b.sales || 0) - (a.sales || 0));
        return products.slice(0, limit);
    }

    return sorted.map(id => db.findById('products', id)).filter(Boolean);
}

// ── Content-based filtering ───────────────────────────────────────────────────
function getSimilarProducts(productId, limit = 8) {
    const product = db.findById('products', productId);
    if (!product) return [];

    const products = db.find('products', p =>
        p.id !== productId &&
        p.status === 'active',
    );

    const scored = products.map(p => {
        let score = 0;
        // Same category: high score
        if (p.category === product.category) score += 5;
        // Price range within 30%
        const priceDiff = Math.abs(p.price - product.price) / (product.price || 1);
        if (priceDiff <= 0.3) score += 3;
        else if (priceDiff <= 0.6) score += 1;
        // Same seller
        if (p.sellerId === product.sellerId) score += 1;
        // Similar rating
        const ratingDiff = Math.abs((p.rating?.average || 0) - (product.rating?.average || 0));
        if (ratingDiff <= 0.5) score += 2;
        return { product: p, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.product);
}

// ── Trending products ─────────────────────────────────────────────────────────
function getTrendingProducts(category = null, limit = 10) {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // last 7 days

    const recentOrders = db.find('orders', o =>
        new Date(o.createdAt).getTime() >= cutoff,
    );

    const productVelocity = {};
    for (const order of recentOrders) {
        for (const item of (order.items || [])) {
            productVelocity[item.productId] = (productVelocity[item.productId] || 0) + item.quantity;
        }
    }

    let products = db.find('products', p => p.status === 'active');

    if (category) {
        products = products.filter(p => p.category === category);
    }

    const scored = products.map(p => ({
        ...p,
        salesVelocity: productVelocity[p.id] || 0,
    }));

    scored.sort((a, b) => b.salesVelocity - a.salesVelocity || (b.sales || 0) - (a.sales || 0));
    return scored.slice(0, limit);
}

// ── Personalised feed ─────────────────────────────────────────────────────────
function getPersonalizedFeed(userId, limit = 20) {
    const collaborative = getRecommendations(userId, Math.ceil(limit / 2));
    const collabIds     = new Set(collaborative.map(p => p.id));

    // Fill remaining with trending
    const trending = getTrendingProducts(null, limit)
        .filter(p => !collabIds.has(p.id))
        .slice(0, limit - collaborative.length);

    const combined = [...collaborative, ...trending];

    // Deduplicate
    const seen = new Set();
    return combined.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
    }).slice(0, limit);
}

module.exports = {
    getRecommendations,
    getSimilarProducts,
    getTrendingProducts,
    getPersonalizedFeed,
};
