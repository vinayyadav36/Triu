const express = require('express');
const router  = express.Router();
const db      = require('../utils/jsonDB');
const { verifyToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// ============================================
// GET /api/products
// ============================================
router.get('/', (req, res) => {
    try {
        const { category, search, sortBy, limit = 12, page = 1 } = req.query;
        const parsedPage  = Math.max(1, parseInt(page, 10)  || 1);
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 12));

        let products = db.find('products', p => p.status === 'active');

        // Category filter
        if (category && category !== 'all') {
            products = products.filter(p => p.category === category);
        }

        // Search filter
        if (search) {
            const q = String(search).toLowerCase().trim();
            products = products.filter(p =>
                (p.name  || '').toLowerCase().includes(q) ||
                (p.description || '').toLowerCase().includes(q) ||
                (p.category || '').toLowerCase().includes(q)
            );
        }

        // Sorting
        if (sortBy === 'price-low')  products.sort((a, b) => a.price - b.price);
        else if (sortBy === 'price-high') products.sort((a, b) => b.price - a.price);
        else if (sortBy === 'rating')     products.sort((a, b) => (b.rating?.average || 0) - (a.rating?.average || 0));
        else if (sortBy === 'newest')     products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        else                              products.sort((a, b) => (b.sales || 0) - (a.sales || 0));

        const total   = products.length;
        const skip    = (parsedPage - 1) * parsedLimit;
        const paged   = products.slice(skip, skip + parsedLimit);

        // Attach seller name
        const users = db.readAll('users');
        const withSeller = paged.map(p => {
            const seller = users.find(u => u.id === p.sellerId);
            return { ...p, sellerName: seller ? (seller.seller?.businessName || seller.name) : 'Triu Store' };
        });

        return res.json({
            success: true,
            data: withSeller,
            pagination: { total, page: parsedPage, limit: parsedLimit, pages: Math.ceil(total / parsedLimit) },
        });
    } catch (err) {
        console.error('❌ Get products error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch products' });
    }
});

// ============================================
// GET /api/products/:id
// ============================================
router.get('/:id', (req, res) => {
    try {
        const product = db.findById('products', req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        const users  = db.readAll('users');
        const seller = users.find(u => u.id === product.sellerId);
        return res.json({
            success: true,
            data: { ...product, sellerName: seller ? (seller.seller?.businessName || seller.name) : 'Triu Store' },
        });
    } catch (err) {
        console.error('❌ Get product error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch product' });
    }
});

// ============================================
// POST /api/products (Seller only)
// ============================================
router.post('/', verifyToken, (req, res) => {
    try {
        if (req.user.role !== 'seller' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Only sellers can add products' });
        }
        if (req.user.role === 'seller' && !req.user.seller?.verified) {
            return res.status(403).json({ success: false, message: 'Only verified sellers can add products' });
        }

        const { name, description, price, category, stock, images, hsnCode, countryOfOrigin, mrp, netQuantity } = req.body;

        if (!name || !description || price === undefined || !category || stock === undefined) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const product = db.create('products', {
            name:            String(name).trim(),
            description:     String(description).trim(),
            price:           Number(price),
            mrp:             Number(mrp || price),
            category:        String(category),
            stock:           Number(stock),
            images:          images || [],
            thumbnail:       (images && images[0]) || '',
            sellerId:        req.user.id,
            hsnCode:         hsnCode  || '',
            countryOfOrigin: countryOfOrigin || 'India',
            netQuantity:     netQuantity || '',
            status:          'active',
            sales:           0,
            rating:          { average: 0, count: 0 },
            reviews:         [],
        });

        return res.status(201).json({ success: true, message: 'Product created successfully', data: product });
    } catch (err) {
        console.error('❌ Create product error:', err);
        return res.status(500).json({ success: false, message: 'Failed to create product' });
    }
});

// ============================================
// PUT /api/products/:id (Seller only)
// ============================================
router.put('/:id', verifyToken, (req, res) => {
    try {
        const product = db.findById('products', req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        if (product.sellerId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const allowed = ['name', 'description', 'price', 'category', 'stock', 'images', 'status',
                         'hsnCode', 'countryOfOrigin', 'mrp', 'netQuantity', 'thumbnail'];
        const updates = {};
        allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

        const updated = db.updateById('products', req.params.id, updates);
        return res.json({ success: true, message: 'Product updated successfully', data: updated });
    } catch (err) {
        console.error('❌ Update product error:', err);
        return res.status(500).json({ success: false, message: 'Failed to update product' });
    }
});

// ============================================
// DELETE /api/products/:id (Seller only)
// ============================================
router.delete('/:id', verifyToken, (req, res) => {
    try {
        const product = db.findById('products', req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        if (product.sellerId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        db.deleteById('products', req.params.id);
        return res.json({ success: true, message: 'Product deleted successfully' });
    } catch (err) {
        console.error('❌ Delete product error:', err);
        return res.status(500).json({ success: false, message: 'Failed to delete product' });
    }
});

// ============================================
// POST /api/products/:id/reviews
// ============================================
router.post('/:id/reviews', verifyToken, (req, res) => {
    try {
        const { rating, comment } = req.body;
        const userId = req.user.id;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
        }

        const product = db.findById('products', req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        if (product.reviews.find(r => r.userId === userId)) {
            return res.status(400).json({ success: false, message: 'You have already reviewed this product' });
        }

        const reviews = [...product.reviews, {
            id: uuidv4(), userId, rating: Number(rating), comment: comment || '',
            verified: false, createdAt: new Date().toISOString()
        }];
        const total   = reviews.reduce((s, r) => s + r.rating, 0);
        const avgRating = { average: Math.round((total / reviews.length) * 10) / 10, count: reviews.length };

        const updated = db.updateById('products', req.params.id, { reviews, rating: avgRating });
        return res.status(201).json({ success: true, message: 'Review added', data: { rating: updated.rating, reviews: updated.reviews } });
    } catch (err) {
        console.error('❌ Review error:', err);
        return res.status(500).json({ success: false, message: 'Failed to add review' });
    }
});

module.exports = router;
