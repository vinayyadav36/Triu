// ============================================
// PAYMENTS ROUTES
// ============================================
const express    = require('express');
const router     = express.Router();
const crypto     = require('crypto');
const db         = require('../utils/jsonDB');
const { verifyToken } = require('../middleware/auth');
const eventQueue = require('../services/eventQueue');

// POST /api/payments/razorpay/create
router.post('/razorpay/create', verifyToken, (req, res) => {
    try {
        const { orderId } = req.body;
        if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });

        const order = db.findById('orders', orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.userId !== req.user.id) return res.status(403).json({ success: false, message: 'Not authorized' });

        // Graceful fallback if Razorpay not configured
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            const mockRazorpayOrder = {
                id:       'order_mock_' + Date.now(),
                amount:   Math.round((order.pricing?.total || order.total || 0) * 100),
                currency: 'INR',
                orderId:  orderId,
                mock:     true,
            };
            return res.json({ success: true, data: mockRazorpayOrder });
        }

        const Razorpay = require('razorpay');
        const rzp = new Razorpay({
            key_id:     process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const amountPaise = Math.round((order.pricing?.total || order.total || 0) * 100);
        rzp.orders.create({ amount: amountPaise, currency: 'INR', receipt: orderId }, (err, rzpOrder) => {
            if (err) {
                console.error('Razorpay create error:', err);
                return res.status(500).json({ success: false, message: 'Failed to create payment' });
            }
            db.updateById('orders', orderId, { razorpayOrderId: rzpOrder.id });
            return res.json({ success: true, data: rzpOrder });
        });
    } catch (err) {
        console.error('Payment create error:', err);
        return res.status(500).json({ success: false, message: 'Failed to create payment' });
    }
});

// POST /api/payments/razorpay/verify
router.post('/razorpay/verify', verifyToken, (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

        if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });

        const order = db.findById('orders', orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // If no Razorpay credentials, accept mock payments
        if (!process.env.RAZORPAY_KEY_SECRET) {
            const updated = db.updateById('orders', orderId, {
                status:         'confirmed',
                payment:        { ...order.payment, status: 'paid', method: 'razorpay', paidAt: new Date().toISOString() },
                razorpayPaymentId: razorpay_payment_id || 'mock_payment',
            });
            eventQueue.publish(eventQueue.TOPICS.ORDER_PAID, { orderId, userId: order.userId });
            return res.json({ success: true, message: 'Payment verified (mock)', data: updated });
        }

        // Real signature verification
        const body     = razorpay_order_id + '|' + razorpay_payment_id;
        const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body).digest('hex');

        if (expected !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        const updated = db.updateById('orders', orderId, {
            status:            'confirmed',
            payment:           { ...order.payment, status: 'paid', method: 'razorpay', paidAt: new Date().toISOString() },
            razorpayOrderId:   razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
        });

        eventQueue.publish(eventQueue.TOPICS.ORDER_PAID, { orderId, userId: order.userId });
        return res.json({ success: true, message: 'Payment verified', data: updated });
    } catch (err) {
        console.error('Payment verify error:', err);
        return res.status(500).json({ success: false, message: 'Failed to verify payment' });
    }
});

// POST /api/payments/cod/confirm
router.post('/cod/confirm', verifyToken, (req, res) => {
    try {
        const { orderId } = req.body;
        if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });

        const order = db.findById('orders', orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.userId !== req.user.id) return res.status(403).json({ success: false, message: 'Not authorized' });

        if (order.payment?.method !== 'COD') {
            return res.status(400).json({ success: false, message: 'Order is not a COD order' });
        }

        const updated = db.updateById('orders', orderId, {
            status:  'confirmed',
            payment: { ...order.payment, status: 'pending_collection', confirmedAt: new Date().toISOString() },
        });

        eventQueue.publish(eventQueue.TOPICS.ORDER_PAID, { orderId, userId: order.userId, method: 'COD' });
        return res.json({ success: true, message: 'COD order confirmed', data: updated });
    } catch (err) {
        console.error('COD confirm error:', err);
        return res.status(500).json({ success: false, message: 'Failed to confirm COD order' });
    }
});

module.exports = router;
