const express = require('express');
const router  = express.Router();
const db      = require('../utils/jsonDB');
const { verifyToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// ============================================
// POST /api/orders (Create order)
// ============================================
router.post('/', verifyToken, (req, res) => {
    try {
        const { items, deliveryAddress, payment, notes } = req.body;
        const userId = req.user.id;

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }
        if (!deliveryAddress || !deliveryAddress.street) {
            return res.status(400).json({ success: false, message: 'Delivery address is required' });
        }

        const user = db.findById('users', userId);

        let subtotal = 0;
        const processedItems = [];

        for (const item of items) {
            const product = db.findById('products', item.productId);
            if (!product) {
                return res.status(404).json({ success: false, message: `Product not found: ${item.productId}` });
            }
            if (product.stock < item.quantity) {
                return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
            }

            const itemTotal = product.price * item.quantity;
            subtotal += itemTotal;

            processedItems.push({
                productId: product.id,
                sellerId:  product.sellerId,
                name:      product.name,
                price:     product.price,
                quantity:  item.quantity,
                image:     product.thumbnail || '',
                total:     itemTotal,
            });

            // Deduct stock
            db.updateById('products', product.id, {
                stock: product.stock - item.quantity,
                sales: (product.sales || 0) + item.quantity,
            });
        }

        const shipping = subtotal > 1000 ? 0 : 50;
        const discount = subtotal > 1000 ? Math.floor(subtotal * 0.05) : 0;
        const total    = subtotal + shipping - discount;
        const orderId  = 'ORD' + uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();

        const order = db.create('orders', {
            orderId,
            userId,
            customerName:    user.name,
            customerEmail:   user.email,
            customerPhone:   user.phone,
            items:           processedItems,
            subtotal,
            shipping,
            discount,
            total,
            deliveryAddress,
            payment: {
                method: (payment && payment.method) ? payment.method : 'COD',
                status: 'pending',
            },
            status: 'pending',
            notes:  notes || '',
        });

        // Add order ref to user
        const userOrders = user.orders || [];
        db.updateById('users', userId, { orders: [...userOrders, order.id] });

        return res.status(201).json({ success: true, message: 'Order created successfully', data: order });
    } catch (err) {
        console.error('❌ Create order error:', err);
        return res.status(500).json({ success: false, message: 'Failed to create order' });
    }
});

// ============================================
// GET /api/orders (User orders)
// ============================================
router.get('/', verifyToken, (req, res) => {
    try {
        const { status } = req.query;
        const userId = req.user.id;

        let orders = db.find('orders', o => o.userId === userId);
        if (status) orders = orders.filter(o => o.status === status);
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return res.json({ success: true, data: orders });
    } catch (err) {
        console.error('❌ Get orders error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch orders' });
    }
});

// ============================================
// GET /api/orders/:id
// ============================================
router.get('/:id', verifyToken, (req, res) => {
    try {
        const order = db.findById('orders', req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (order.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        return res.json({ success: true, data: order });
    } catch (err) {
        console.error('❌ Get order error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch order' });
    }
});

// ============================================
// PUT /api/orders/:id/cancel
// ============================================
router.put('/:id/cancel', verifyToken, (req, res) => {
    try {
        const order = db.findById('orders', req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (order.userId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }
        if (!['pending', 'confirmed'].includes(order.status)) {
            return res.status(400).json({ success: false, message: 'Cannot cancel this order' });
        }

        // Restore stock
        for (const item of order.items) {
            const product = db.findById('products', item.productId);
            if (product) {
                db.updateById('products', item.productId, {
                    stock: (product.stock || 0) + item.quantity,
                    sales: Math.max(0, (product.sales || 0) - item.quantity),
                });
            }
        }

        const updated = db.updateById('orders', req.params.id, { status: 'cancelled' });
        return res.json({ success: true, message: 'Order cancelled', data: updated });
    } catch (err) {
        console.error('❌ Cancel order error:', err);
        return res.status(500).json({ success: false, message: 'Failed to cancel order' });
    }
});

module.exports = router;
