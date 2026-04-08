const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// ============================================
// POST /api/orders (Create order)
// ============================================
router.post('/', verifyToken, async (req, res) => {
    try {
        const { items, deliveryAddress, payment, notes } = req.body;
        const userId = req.user.id;

        // Validation
        if (!items || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        if (!deliveryAddress || !deliveryAddress.street || !deliveryAddress.city) {
            return res.status(400).json({
                success: false,
                message: 'Delivery address is required'
            });
        }

        // Get user
        const user = await User.findById(userId);

        // Process items and calculate totals
        let subtotal = 0;
        const processedItems = [];

        for (const item of items) {
            const product = await Product.findById(item.productId);
            
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `Product ${item.productId} not found`
                });
            }

            // Check stock
            if (product.stock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.name}`
                });
            }

            const itemTotal = product.price * item.quantity;
            subtotal += itemTotal;

            processedItems.push({
                productId: product._id,
                sellerId: product.sellerId,
                name: product.name,
                price: product.price,
                quantity: item.quantity,
                image: product.thumbnail,
                total: itemTotal
            });

            // Update product stock and sales
            product.stock -= item.quantity;
            product.sales += item.quantity;
            await product.save();
        }

        // Calculate totals
        const shipping = subtotal > 1000 ? 0 : 50;
        const discount = subtotal > 1000 ? Math.floor(subtotal * 0.05) : 0;
        const total = subtotal + shipping - discount;

        // Generate a collision-resistant order ID using UUID (crypto-strong)
        const orderId = 'ORD' + uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();

        // Create order
        const order = await Order.create({
            orderId,
            userId,
            customerName: user.name,
            customerEmail: user.email,
            customerPhone: user.phone,
            items: processedItems,
            subtotal,
            shipping,
            discount,
            total,
            deliveryAddress,
            payment: {
                method: payment.method || 'COD',
                status: 'pending'
            },
            status: 'pending',
            notes
        });

        // Add order to user
        user.orders.push(order._id);
        await user.save();

        // Send order confirmation email (mock)
        console.log(`✅ Order ${orderId} created successfully`);

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: order
        });
    } catch (error) {
        console.error('❌ Create order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order'
        });
    }
});

// ============================================
// GET /api/orders (User orders)
// ============================================
router.get('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { status } = req.query;

        let query = { userId };
        if (status) {
            query.status = status;
        }

        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .populate('items.sellerId', 'seller name')
            .populate('items.productId', 'name');

        res.json({
            success: true,
            data: orders
        });
    } catch (error) {
        console.error('❌ Get orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders'
        });
    }
});

// ============================================
// GET /api/orders/:id
// ============================================
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('items.sellerId', 'seller name')
            .populate('items.productId', 'name');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check authorization
        if (order.userId.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        res.json({
            success: true,
            data: order
        });
    } catch (error) {
        console.error('❌ Get order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order'
        });
    }
});

// ============================================
// PUT /api/orders/:id/cancel (Cancel order)
// ============================================
router.put('/:id/cancel', verifyToken, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check authorization
        if (order.userId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        // Can only cancel pending/confirmed orders
        if (!['pending', 'confirmed'].includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel this order'
            });
        }

        // Restore stock
        for (const item of order.items) {
            await Product.findByIdAndUpdate(
                item.productId,
                { $inc: { stock: item.quantity, sales: -item.quantity } }
            );
        }

        order.status = 'cancelled';
        await order.save();

        res.json({
            success: true,
            message: 'Order cancelled successfully',
            data: order
        });
    } catch (error) {
        console.error('❌ Cancel order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order'
        });
    }
});

module.exports = router;
