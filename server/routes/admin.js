// ============================================
// ADMIN ROUTES
// ============================================
const express    = require('express');
const router     = express.Router();
const db         = require('../utils/jsonDB');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const eventQueue = require('../services/eventQueue');
const settlementService = require('../services/settlementService');

// All admin routes require auth + admin role
router.use(verifyToken, verifyAdmin);

function safeUser(user) {
    const { passwordHash, ...rest } = user;
    return rest;
}

// GET /api/admin/dashboard
router.get('/dashboard', (req, res) => {
    try {
        const users           = db.find('users');
        const products        = db.find('products');
        const orders          = db.find('orders');
        const pendingSellers  = db.find('users', u => u.seller && u.seller.status === 'pending');
        const settlements     = db.find('settlements');
        const revenue         = orders.filter(o => o.status !== 'cancelled')
            .reduce((s, o) => s + (o.pricing?.total || o.total || 0), 0);

        return res.json({
            success: true,
            data: {
                totalUsers:      users.length,
                totalProducts:   products.length,
                totalOrders:     orders.length,
                revenue:         parseFloat(revenue.toFixed(2)),
                pendingSellers:  pendingSellers.length,
                totalSettlements: settlements.length,
                recentOrders:    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5),
            },
        });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load dashboard' });
    }
});

// GET /api/admin/sellers/pending
router.get('/sellers/pending', (req, res) => {
    try {
        const pending = db.find('users', u => u.seller && u.seller.status === 'pending').map(safeUser);
        return res.json({ success: true, data: pending });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to load pending sellers' });
    }
});

// PUT /api/admin/sellers/:id/approve
router.put('/sellers/:id/approve', (req, res) => {
    try {
        const user = db.findById('users', req.params.id);
        if (!user || !user.seller) return res.status(404).json({ success: false, message: 'Seller not found' });

        const sellerData = {
            ...user.seller,
            status:     'approved',
            verified:   true,
            approvedAt: new Date().toISOString(),
        };
        const updated = db.updateById('users', req.params.id, { seller: sellerData });

        eventQueue.publish(eventQueue.TOPICS.SELLER_ONBOARDED, {
            userId:       req.params.id,
            businessName: user.seller.businessName,
            status:       'approved',
        });

        return res.json({ success: true, message: 'Seller approved', data: safeUser(updated) });
    } catch (err) {
        console.error('Approve seller error:', err);
        return res.status(500).json({ success: false, message: 'Failed to approve seller' });
    }
});

// PUT /api/admin/sellers/:id/reject
router.put('/sellers/:id/reject', (req, res) => {
    try {
        const { reason } = req.body;
        const user = db.findById('users', req.params.id);
        if (!user || !user.seller) return res.status(404).json({ success: false, message: 'Seller not found' });

        const sellerData = {
            ...user.seller,
            status:       'rejected',
            rejectedAt:   new Date().toISOString(),
            rejectReason: reason || 'Application rejected',
        };
        const updated = db.updateById('users', req.params.id, { seller: sellerData });
        return res.json({ success: true, message: 'Seller application rejected', data: safeUser(updated) });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to reject seller' });
    }
});

// GET /api/admin/orders
router.get('/orders', (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        let orders = db.find('orders');
        if (status) orders = orders.filter(o => o.status === status);
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const parsedPage  = Math.max(1, parseInt(page, 10));
        const parsedLimit = Math.min(100, parseInt(limit, 10) || 20);
        const total       = orders.length;
        const paged       = orders.slice((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit);
        return res.json({ success: true, data: paged, total, page: parsedPage, limit: parsedLimit });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to load orders' });
    }
});

// PUT /api/admin/orders/:id/status
router.put('/orders/:id/status', (req, res) => {
    try {
        const { status } = req.body;
        const VALID = ['pending','confirmed','processing','shipped','delivered','cancelled','refunded'];
        if (!status || !VALID.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        const order = db.findById('orders', req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        const updated = db.updateById('orders', req.params.id, { status });
        return res.json({ success: true, message: 'Order status updated', data: updated });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to update order' });
    }
});

// POST /api/admin/orders/:id/refund
router.post('/orders/:id/refund', (req, res) => {
    try {
        const { reason } = req.body;
        const order = db.findById('orders', req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const updated = db.updateById('orders', req.params.id, {
            status:      'refunded',
            refundedAt:  new Date().toISOString(),
            refundReason: reason || 'Refund processed by admin',
        });

        // Restore stock
        for (const item of (order.items || [])) {
            const product = db.findById('products', item.productId);
            if (product) {
                db.updateById('products', product.id, { stock: (product.stock || 0) + item.quantity });
            }
        }

        return res.json({ success: true, message: 'Refund processed', data: updated });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to process refund' });
    }
});

// GET /api/admin/users
router.get('/users', (req, res) => {
    try {
        const { page = 1, limit = 20, role } = req.query;
        let users = db.find('users');
        if (role) users = users.filter(u => u.role === role);
        users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const parsedPage  = Math.max(1, parseInt(page, 10));
        const parsedLimit = Math.min(100, parseInt(limit, 10) || 20);
        const total       = users.length;
        const paged       = users.slice((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit).map(safeUser);
        return res.json({ success: true, data: paged, total, page: parsedPage, limit: parsedLimit });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to load users' });
    }
});

// PUT /api/admin/users/:id/block
router.put('/users/:id/block', (req, res) => {
    try {
        const user = db.findById('users', req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const newStatus = user.status === 'active' ? 'blocked' : 'active';
        const updated   = db.updateById('users', req.params.id, { status: newStatus });
        return res.json({ success: true, message: `User ${newStatus}`, data: safeUser(updated) });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to update user' });
    }
});

// GET /api/admin/settlements
router.get('/settlements', (req, res) => {
    try {
        const settlements = settlementService.getSettlements(null);
        return res.json({ success: true, data: settlements });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to load settlements' });
    }
});

module.exports = router;
