// ============================================
// FRAUD DETECTION — Anomaly and risk scoring
// ============================================
const db         = require('../../utils/jsonDB');
const eventQueue = require('../../services/eventQueue');

// ── Order fraud scorer ────────────────────────────────────────────────────────
function analyzeOrder(order) {
    let score = 0;
    const flags = [];

    const userId = order.userId;
    const amount = order.pricing?.total || order.total || 0;

    // 1. High-value order check
    if (amount > 50000) { score += 20; flags.push('high_value_order'); }
    else if (amount > 20000) { score += 10; flags.push('elevated_value'); }

    // 2. Velocity check — many orders from same user in 24h
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    const recentOrders = db.find('orders', o =>
        o.userId === userId && new Date(o.createdAt).getTime() >= yesterday,
    );
    if (recentOrders.length > 5) { score += 25; flags.push('high_order_velocity'); }
    else if (recentOrders.length > 3) { score += 10; flags.push('elevated_order_velocity'); }

    // 3. Multiple delivery addresses from same user in short time
    const addresses = new Set(recentOrders.map(o =>
        o.deliveryAddress ? `${o.deliveryAddress.city}_${o.deliveryAddress.postalCode}` : 'unknown',
    ));
    if (addresses.size > 3) { score += 15; flags.push('multiple_delivery_addresses'); }

    // 4. New user placing large order
    const user = db.findById('users', userId);
    if (user) {
        const accountAgeDays = (Date.now() - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000);
        if (accountAgeDays < 1 && amount > 10000) { score += 30; flags.push('new_account_large_order'); }
        else if (accountAgeDays < 7 && amount > 20000) { score += 20; flags.push('recent_account_large_order'); }
    }

    // 5. COD order over limit
    if (order.payment?.method === 'COD' && amount > 10000) {
        score += 15;
        flags.push('cod_high_value');
    }

    // 6. Identical consecutive orders
    const identical = recentOrders.filter(o =>
        o.id !== order.id &&
        JSON.stringify((o.items || []).map(i => i.productId).sort()) ===
        JSON.stringify((order.items || []).map(i => i.productId).sort()),
    );
    if (identical.length > 0) { score += 20; flags.push('duplicate_order'); }

    const riskLevel = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

    if (riskLevel === 'high') {
        eventQueue.publish(eventQueue.TOPICS.FRAUD_DETECTED, {
            type:    'order_fraud',
            orderId: order.id,
            userId,
            score,
            flags,
        });
    }

    return { score: Math.min(100, score), riskLevel, flags, orderId: order.id };
}

// ── Refund spike detector ─────────────────────────────────────────────────────
function analyzeRefundSpike(sellerId) {
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const last7  = Date.now() -  7 * 24 * 60 * 60 * 1000;

    const allSellerOrders = db.find('orders', o =>
        (o.items || []).some(i => i.sellerId === sellerId) &&
        new Date(o.createdAt).getTime() >= last30,
    );
    const refundedLast30 = allSellerOrders.filter(o =>
        o.status === 'refunded' || o.status === 'cancelled',
    );
    const refundedLast7 = refundedLast30.filter(o =>
        new Date(o.createdAt).getTime() >= last7,
    );

    const refundRate30 = allSellerOrders.length > 0
        ? refundedLast30.length / allSellerOrders.length
        : 0;
    const refundRate7 = allSellerOrders.length > 0
        ? refundedLast7.length / allSellerOrders.length
        : 0;

    const spike = refundRate7 > refundRate30 * 2 && refundedLast7.length > 2;
    const flags = [];
    if (spike) flags.push('refund_spike_detected');
    if (refundRate30 > 0.15) flags.push('high_refund_rate_30d');
    if (refundRate7 > 0.20) flags.push('high_refund_rate_7d');

    if (spike) {
        eventQueue.publish(eventQueue.TOPICS.FRAUD_DETECTED, {
            type:     'refund_spike',
            sellerId,
            refundRate7,
            refundRate30,
            flags,
        });
    }

    return {
        sellerId,
        refundRate30: parseFloat((refundRate30 * 100).toFixed(1)),
        refundRate7:  parseFloat((refundRate7 * 100).toFixed(1)),
        spike,
        flags,
        totalOrders:  allSellerOrders.length,
        refunds30:    refundedLast30.length,
        refunds7:     refundedLast7.length,
    };
}

// Validation regex constants
const GST_REGEX   = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_REGEX   = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PHONE_REGEX = /^[6-9]\d{9}$/;

// ── Seller onboarding validator ───────────────────────────────────────────────
function analyzeSellerOnboarding(sellerData) {
    const flags  = [];
    let score    = 0;

    // GST validation (format: 22AAAAA0000A1Z5)
    if (sellerData.gstNumber && !GST_REGEX.test(sellerData.gstNumber)) {
        flags.push('invalid_gst_format');
        score += 30;
    }

    // PAN validation (format: ABCDE1234F)
    if (sellerData.panNumber && !PAN_REGEX.test(sellerData.panNumber)) {
        flags.push('invalid_pan_format');
        score += 30;
    }

    // Duplicate GST check
    if (sellerData.gstNumber) {
        const existingSeller = db.findOne('users', u =>
            u.seller?.gstNumber === sellerData.gstNumber,
        );
        if (existingSeller) {
            flags.push('duplicate_gst_number');
            score += 50;
        }
    }

    // Phone number validation
    if (sellerData.phone && !PHONE_REGEX.test(sellerData.phone.replace(/\D/g, ''))) {
        flags.push('invalid_phone_format');
        score += 10;
    }

    const riskLevel = score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low';

    return {
        valid:     score < 50,
        riskLevel,
        score:     Math.min(100, score),
        flags,
    };
}

// ── Get anomalies ─────────────────────────────────────────────────────────────
function getAnomalies(fromDate = null) {
    const from = fromDate ? new Date(fromDate).getTime() : 0;
    return db.find('events', e =>
        e.topic === eventQueue.TOPICS.FRAUD_DETECTED &&
        new Date(e.timestamp).getTime() >= from,
    );
}

module.exports = {
    analyzeOrder,
    analyzeRefundSpike,
    analyzeSellerOnboarding,
    getAnomalies,
};
