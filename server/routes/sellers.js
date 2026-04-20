// ============================================
// SELLERS ROUTES
// ============================================
const express        = require('express');
const router         = express.Router();
const db             = require('../utils/jsonDB');
const { verifyToken } = require('../middleware/auth');
const fraudDetection = require('../ai/skills/fraudDetection');
const eventQueue     = require('../services/eventQueue');

function safeUser(user) {
    const safe = { ...user };
    delete safe.passwordHash;
    return safe;
}

// POST /api/sellers/apply
router.post('/apply', verifyToken, (req, res) => {
    try {
        const userId = req.user.id;
        const { businessName, description, gstNumber, panNumber, category, bankAccount, phone, address } = req.body;

        if (!businessName || !gstNumber) {
            return res.status(400).json({ success: false, message: 'Business name and GST number are required' });
        }

        const user = db.findById('users', userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (user.seller && user.seller.status === 'approved') {
            return res.status(400).json({ success: false, message: 'Already a registered seller' });
        }

        const fraudCheck = fraudDetection.analyzeSellerOnboarding({ gstNumber, panNumber, phone });
        if (!fraudCheck.valid) {
            return res.status(400).json({ success: false, message: 'Validation failed: ' + fraudCheck.flags.join(', ') });
        }

        const sellerData = {
            businessName,
            description:  description || '',
            gstNumber,
            panNumber:    panNumber   || '',
            category:     category    || 'general',
            bankAccount:  bankAccount || null,
            phone:        phone       || user.phone,
            address:      address     || null,
            status:       'pending',
            verified:     false,
            appliedAt:    new Date().toISOString(),
            approvedAt:   null,
        };

        const updated = db.updateById('users', userId, { seller: sellerData, role: 'seller' });

        eventQueue.publish(eventQueue.TOPICS.SELLER_ONBOARDED, {
            userId, businessName, gstNumber, status: 'pending',
        });

        return res.status(201).json({ success: true, message: 'Application submitted for review', data: safeUser(updated) });
    } catch (err) {
        console.error('Seller apply error:', err);
        return res.status(500).json({ success: false, message: 'Failed to submit application' });
    }
});

// GET /api/sellers/dashboard
router.get('/dashboard', verifyToken, (req, res) => {
    try {
        const sellerId = req.user.id;
        const products = db.find('products', p => p.sellerId === sellerId);
        const orders   = db.find('orders', o => (o.items || []).some(i => i.sellerId === sellerId));

        const revenue = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => {
            const sellerItems = (o.items || []).filter(i => i.sellerId === sellerId);
            return s + sellerItems.reduce((t, i) => t + (i.total || i.price * i.quantity), 0);
        }, 0);

        const pendingOrders = orders.filter(o => o.status === 'pending').length;
        const lowStock      = products.filter(p => (p.stock || 0) < 10);

        return res.json({
            success: true,
            data: {
                totalProducts: products.length,
                totalOrders:   orders.length,
                revenue:       parseFloat(revenue.toFixed(2)),
                pendingOrders,
                lowStockCount: lowStock.length,
                lowStockItems: lowStock.map(p => ({ id: p.id, name: p.name, stock: p.stock })),
            },
        });
    } catch (err) {
        console.error('Seller dashboard error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load dashboard' });
    }
});

// GET /api/sellers/orders
router.get('/orders', verifyToken, (req, res) => {
    try {
        const sellerId = req.user.id;
        const { status, page = 1, limit = 20 } = req.query;

        let orders = db.find('orders', o => (o.items || []).some(i => i.sellerId === sellerId));
        if (status) orders = orders.filter(o => o.status === status);
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const parsedPage  = Math.max(1, parseInt(page, 10));
        const parsedLimit = Math.min(100, parseInt(limit, 10) || 20);
        const total       = orders.length;
        const paged       = orders.slice((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit);

        return res.json({ success: true, data: paged, total, page: parsedPage, limit: parsedLimit });
    } catch (err) {
        console.error('Seller orders error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load orders' });
    }
});

// PUT /api/sellers/orders/:id/status
router.put('/orders/:id/status', verifyToken, (req, res) => {
    try {
        const sellerId = req.user.id;
        const { status } = req.body;
        const VALID = ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

        if (!status || !VALID.includes(status)) {
            return res.status(400).json({ success: false, message: 'Status must be one of: ' + VALID.join(', ') });
        }

        const order = db.findById('orders', req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const isSeller = (order.items || []).some(i => i.sellerId === sellerId);
        if (!isSeller) return res.status(403).json({ success: false, message: 'Not authorized' });

        const updated = db.updateById('orders', order.id, { status });
        return res.json({ success: true, message: 'Order status updated', data: updated });
    } catch (err) {
        console.error('Update order status error:', err);
        return res.status(500).json({ success: false, message: 'Failed to update status' });
    }
});

// GET /api/sellers — public approved sellers list
router.get('/', (req, res) => {
    try {
        const sellers = db.find('users', u => u.seller && u.seller.status === 'approved')
            .map(u => ({
                id:           u.id,
                businessName: u.seller.businessName,
                description:  u.seller.description,
                category:     u.seller.category,
                verified:     u.seller.verified,
            }));
        return res.json({ success: true, data: sellers });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to list sellers' });
    }
});

// GET /api/sellers/:id
router.get('/:id', (req, res) => {
    try {
        const user = db.findById('users', req.params.id);
        if (!user || !user.seller) return res.status(404).json({ success: false, message: 'Seller not found' });
        return res.json({
            success: true,
            data: {
                id:           user.id,
                name:         user.name,
                businessName: user.seller.businessName,
                description:  user.seller.description,
                category:     user.seller.category,
                verified:     user.seller.verified,
            },
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to get seller' });
    }
});

// GET /api/sellers/:id/products
router.get('/:id/products', (req, res) => {
    try {
        const products = db.find('products', p => p.sellerId === req.params.id && p.status === 'active');
        return res.json({ success: true, data: products });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to get products' });
    }
});

module.exports = router;
