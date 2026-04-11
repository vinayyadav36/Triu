// ============================================
// JARVIS AI ROUTES
// ============================================
const express    = require('express');
const router     = express.Router();
const jarvis     = require('../ai/jarvis');
const recommendations = require('../ai/skills/recommendations');
const forecasting     = require('../ai/skills/forecasting');
const fraudDetection  = require('../ai/skills/fraudDetection');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

// All Jarvis routes require auth
router.use(verifyToken);

// POST /api/jarvis/ask
router.post('/ask', async (req, res) => {
    try {
        const { query, context = {} } = req.body;
        if (!query) return res.status(400).json({ success: false, message: 'Query is required' });

        const enrichedContext = {
            ...context,
            userId:   req.user.id,
            role:     req.user.role,
            sellerId: req.user.id,
        };

        const result = await jarvis.ask(query, enrichedContext);
        return res.json({ success: true, data: result });
    } catch (err) {
        console.error('Jarvis ask error:', err);
        return res.status(500).json({ success: false, message: 'Jarvis error' });
    }
});

// GET /api/jarvis/alerts
router.get('/alerts', async (req, res) => {
    try {
        const alerts = await jarvis.runAlert(req.user.id);
        return res.json({ success: true, data: alerts });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to get alerts' });
    }
});

// GET /api/jarvis/forecast/demand/:productId
router.get('/forecast/demand/:productId', (req, res) => {
    try {
        const days   = parseInt(req.query.days, 10) || 14;
        const result = forecasting.forecastDemand(req.params.productId, days);
        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to forecast demand' });
    }
});

// GET /api/jarvis/forecast/revenue/:sellerId
router.get('/forecast/revenue/:sellerId', (req, res) => {
    try {
        if (req.user.id !== req.params.sellerId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        const days   = parseInt(req.query.days, 10) || 30;
        const result = forecasting.forecastRevenue(req.params.sellerId, days);
        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to forecast revenue' });
    }
});

// GET /api/jarvis/recommendations/:userId
router.get('/recommendations/:userId', (req, res) => {
    try {
        if (req.user.id !== req.params.userId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        const limit = parseInt(req.query.limit, 10) || 10;
        const recs  = recommendations.getPersonalizedFeed(req.params.userId, limit);
        return res.json({ success: true, data: recs });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to get recommendations' });
    }
});

// GET /api/jarvis/trending
router.get('/trending', (req, res) => {
    try {
        const { category, limit = 10 } = req.query;
        const trending = recommendations.getTrendingProducts(category || null, parseInt(limit, 10));
        return res.json({ success: true, data: trending });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to get trending products' });
    }
});

// POST /api/jarvis/fraud/analyze — admin only
router.post('/fraud/analyze', verifyAdmin, (req, res) => {
    try {
        const { order } = req.body;
        if (!order) return res.status(400).json({ success: false, message: 'order data is required' });
        const result = fraudDetection.analyzeOrder(order);
        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to analyze fraud' });
    }
});

module.exports = router;
