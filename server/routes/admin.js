const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

// ============================================
// GET /api/admin/dashboard  –  Business Overview
// ============================================
router.get('/dashboard', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [
            totalUsers,
            totalProducts,
            totalOrders,
            totalSellers,
            pendingSellers,
            revenueAgg,
            recentOrders,
            ordersByStatus,
            topProducts,
            monthlySales
        ] = await Promise.all([
            User.countDocuments({ role: 'customer' }),
            Product.countDocuments({ status: 'active' }),
            Order.countDocuments(),
            User.countDocuments({ role: 'seller' }),
            User.countDocuments({ role: 'seller', 'seller.status': 'pending' }),
            Order.aggregate([
                { $match: { 'payment.status': 'completed' } },
                { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
            ]),
            Order.find()
                .sort({ createdAt: -1 })
                .limit(10)
                .populate('userId', 'name email')
                .lean(),
            Order.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            Product.find({ status: 'active' })
                .sort({ sales: -1 })
                .limit(5)
                .select('name price sales rating category')
                .lean(),
            // Monthly revenue for last 6 months
            Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
                        'payment.status': 'completed'
                    }
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' }
                        },
                        revenue: { $sum: '$total' },
                        orders: { $sum: 1 }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ])
        ]);

        const revenue = revenueAgg[0]?.total || 0;
        const completedOrders = revenueAgg[0]?.count || 0;

        // Build order status map
        const statusMap = {};
        ordersByStatus.forEach(s => { statusMap[s._id] = s.count; });

        res.json({
            success: true,
            data: {
                overview: {
                    totalUsers,
                    totalProducts,
                    totalOrders,
                    totalSellers,
                    pendingSellers,
                    totalRevenue: revenue,
                    completedOrders,
                    averageOrderValue: completedOrders > 0 ? Math.round(revenue / completedOrders) : 0
                },
                ordersByStatus: statusMap,
                recentOrders,
                topProducts,
                monthlySales
            }
        });
    } catch (error) {
        console.error('❌ Dashboard error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
    }
});

// ============================================
// GET /api/admin/sales  –  Sales Analytics
// ============================================
router.get('/sales', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { period = '30' } = req.query;
        const days = parseInt(period, 10) || 30;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const [dailySales, categoryRevenue, paymentMethodBreakdown] = await Promise.all([
            Order.aggregate([
                { $match: { createdAt: { $gte: since }, 'payment.status': 'completed' } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        revenue: { $sum: '$total' },
                        orders: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            Order.aggregate([
                { $match: { createdAt: { $gte: since }, 'payment.status': 'completed' } },
                { $unwind: '$items' },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'items.productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: '$product.category',
                        revenue: { $sum: '$items.total' },
                        units: { $sum: '$items.quantity' }
                    }
                },
                { $sort: { revenue: -1 } }
            ]),
            Order.aggregate([
                { $match: { createdAt: { $gte: since } } },
                { $group: { _id: '$payment.method', count: { $sum: 1 }, total: { $sum: '$total' } } }
            ])
        ]);

        res.json({
            success: true,
            data: { dailySales, categoryRevenue, paymentMethodBreakdown }
        });
    } catch (error) {
        console.error('❌ Sales analytics error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sales data' });
    }
});

// ============================================
// GET /api/admin/orders  –  All Orders (paginated)
// ============================================
router.get('/orders', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status, page = 1, limit = 20, search } = req.query;
        const parsedPage = Math.max(1, parseInt(page, 10) || 1);
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const skip = (parsedPage - 1) * parsedLimit;

        const query = {};
        if (status) query.status = status;
        if (search) {
            const safeSearch = escapeRegex(search);
            query.$or = [
                { orderId: { $regex: safeSearch, $options: 'i' } },
                { customerName: { $regex: safeSearch, $options: 'i' } },
                { customerEmail: { $regex: safeSearch, $options: 'i' } }
            ];
        }

        const [orders, total] = await Promise.all([
            Order.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parsedLimit)
                .populate('userId', 'name email phone')
                .lean(),
            Order.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: orders,
            pagination: { total, page: parsedPage, limit: parsedLimit, pages: Math.ceil(total / parsedLimit) }
        });
    } catch (error) {
        console.error('❌ Admin orders error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch orders' });
    }
});

// ============================================
// PUT /api/admin/orders/:id/status  –  Update Order Status
// ============================================
router.put('/orders/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status, trackingNumber, carrier, trackingUrl, internalNotes } = req.body;
        const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const update = { status };
        if (trackingNumber) {
            update['tracking.number'] = trackingNumber;
            update['tracking.carrier'] = carrier || '';
            update['tracking.url'] = trackingUrl || '';
        }
        if (internalNotes) update.internalNotes = internalNotes;

        const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true })
            .populate('userId', 'name email');

        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        res.json({ success: true, message: 'Order status updated', data: order });
    } catch (error) {
        console.error('❌ Update order status error:', error);
        res.status(500).json({ success: false, message: 'Failed to update order' });
    }
});

// ============================================
// GET /api/admin/users  –  CRM: All Users (paginated)
// ============================================
router.get('/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { role, status, search, page = 1, limit = 20 } = req.query;
        const parsedPage = Math.max(1, parseInt(page, 10) || 1);
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const skip = (parsedPage - 1) * parsedLimit;

        const query = {};
        if (role) query.role = role;
        if (status) query.status = status;
        if (search) {
            const safeSearch = escapeRegex(search);
            query.$or = [
                { name: { $regex: safeSearch, $options: 'i' } },
                { email: { $regex: safeSearch, $options: 'i' } },
                { phone: { $regex: safeSearch, $options: 'i' } }
            ];
        }

        const [users, total] = await Promise.all([
            User.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parsedLimit)
                .select('-password -safeKeyHash')
                .lean(),
            User.countDocuments(query)
        ]);

        // Attach order counts per user
        const userIds = users.map(u => u._id);
        const orderCounts = await Order.aggregate([
            { $match: { userId: { $in: userIds } } },
            { $group: { _id: '$userId', count: { $sum: 1 }, spent: { $sum: '$total' } } }
        ]);
        const orderMap = {};
        orderCounts.forEach(o => { orderMap[String(o._id)] = { count: o.count, spent: o.spent }; });
        const enrichedUsers = users.map(u => ({
            ...u,
            orderCount: orderMap[String(u._id)]?.count || 0,
            totalSpent: orderMap[String(u._id)]?.spent || 0
        }));

        res.json({
            success: true,
            data: enrichedUsers,
            pagination: { total, page: parsedPage, limit: parsedLimit, pages: Math.ceil(total / parsedLimit) }
        });
    } catch (error) {
        console.error('❌ Admin users error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});

// ============================================
// PUT /api/admin/users/:id/status  –  Update User Status
// ============================================
router.put('/users/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'inactive', 'suspended'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true })
            .select('-password -safeKeyHash');

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        res.json({ success: true, message: 'User status updated', data: user });
    } catch (error) {
        console.error('❌ Update user status error:', error);
        res.status(500).json({ success: false, message: 'Failed to update user' });
    }
});

// ============================================
// GET /api/admin/sellers/pending  –  SRM: Pending Applications
// ============================================
router.get('/sellers/pending', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const sellers = await User.find({
            role: 'seller',
            'seller.status': 'pending'
        }).select('-password -safeKeyHash').lean();

        res.json({ success: true, data: sellers });
    } catch (error) {
        console.error('❌ Get pending sellers error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sellers' });
    }
});

// ============================================
// GET /api/admin/sellers  –  SRM: All Sellers with Stats
// ============================================
router.get('/sellers', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const parsedPage = Math.max(1, parseInt(page, 10) || 1);
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const skip = (parsedPage - 1) * parsedLimit;

        const query = { role: 'seller' };
        if (status) query['seller.status'] = status;

        const [sellers, total] = await Promise.all([
            User.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parsedLimit)
                .select('-password -safeKeyHash')
                .lean(),
            User.countDocuments(query)
        ]);

        // Attach product + order counts per seller
        const sellerIds = sellers.map(s => s._id);
        const [productCounts, orderCounts] = await Promise.all([
            Product.aggregate([
                { $match: { sellerId: { $in: sellerIds } } },
                { $group: { _id: '$sellerId', count: { $sum: 1 } } }
            ]),
            Order.aggregate([
                { $unwind: '$items' },
                { $match: { 'items.sellerId': { $in: sellerIds } } },
                { $group: { _id: '$items.sellerId', orders: { $sum: 1 }, revenue: { $sum: '$items.total' } } }
            ])
        ]);

        const prodMap = {};
        productCounts.forEach(p => { prodMap[String(p._id)] = p.count; });
        const ordMap = {};
        orderCounts.forEach(o => { ordMap[String(o._id)] = { orders: o.orders, revenue: o.revenue }; });

        const enriched = sellers.map(s => ({
            ...s,
            productCount: prodMap[String(s._id)] || 0,
            orderCount: ordMap[String(s._id)]?.orders || 0,
            revenue: ordMap[String(s._id)]?.revenue || 0
        }));

        res.json({
            success: true,
            data: enriched,
            pagination: { total, page: parsedPage, limit: parsedLimit, pages: Math.ceil(total / parsedLimit) }
        });
    } catch (error) {
        console.error('❌ Admin sellers error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sellers' });
    }
});

// ============================================
// PUT /api/admin/sellers/:id/approve
// ============================================
router.put('/sellers/:id/approve', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { 'seller.status': 'approved', 'seller.verified': true },
            { new: true }
        ).select('-password -safeKeyHash');

        if (!user) return res.status(404).json({ success: false, message: 'Seller not found' });

        res.json({ success: true, message: 'Seller approved successfully', data: user });
    } catch (error) {
        console.error('❌ Approve seller error:', error);
        res.status(500).json({ success: false, message: 'Failed to approve seller' });
    }
});

// ============================================
// PUT /api/admin/sellers/:id/reject
// ============================================
router.put('/sellers/:id/reject', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid seller ID' });
        }
        const reason = String(req.body.reason || '').slice(0, 500);
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { 'seller.status': 'rejected', 'seller.rejectionReason': reason },
            { new: true }
        ).select('-password -safeKeyHash');

        if (!user) return res.status(404).json({ success: false, message: 'Seller not found' });

        res.json({ success: true, message: 'Seller application rejected', data: user });
    } catch (error) {
        console.error('❌ Reject seller error:', error);
        res.status(500).json({ success: false, message: 'Failed to reject seller' });
    }
});

// ============================================
// PUT /api/admin/sellers/:id/suspend
// ============================================
router.put('/sellers/:id/suspend', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { 'seller.status': 'suspended', status: 'suspended' },
            { new: true }
        ).select('-password -safeKeyHash');

        if (!user) return res.status(404).json({ success: false, message: 'Seller not found' });

        res.json({ success: true, message: 'Seller suspended', data: user });
    } catch (error) {
        console.error('❌ Suspend seller error:', error);
        res.status(500).json({ success: false, message: 'Failed to suspend seller' });
    }
});

// ============================================
// GET /api/admin/products  –  All Products Management
// ============================================
router.get('/products', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status, category, page = 1, limit = 20, search } = req.query;
        const parsedPage = Math.max(1, parseInt(page, 10) || 1);
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const skip = (parsedPage - 1) * parsedLimit;

        const query = {};
        if (status) query.status = status;
        if (category) query.category = category;
        if (search) {
            const safeSearch = escapeRegex(search);
            query.$or = [
                { name: { $regex: safeSearch, $options: 'i' } },
                { description: { $regex: safeSearch, $options: 'i' } }
            ];
        }

        const [products, total] = await Promise.all([
            Product.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parsedLimit)
                .populate('sellerId', 'name seller.businessName')
                .lean(),
            Product.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: products,
            pagination: { total, page: parsedPage, limit: parsedLimit, pages: Math.ceil(total / parsedLimit) }
        });
    } catch (error) {
        console.error('❌ Admin products error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch products' });
    }
});

// ============================================
// PUT /api/admin/products/:id/status  –  Activate/Deactivate Product
// ============================================
router.put('/products/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'inactive', 'archived'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const product = await Product.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        res.json({ success: true, message: 'Product status updated', data: product });
    } catch (error) {
        console.error('❌ Admin product status error:', error);
        res.status(500).json({ success: false, message: 'Failed to update product' });
    }
});

// ============================================
// GET /api/admin/reports/refunds  –  Refund Management
// ============================================
router.get('/reports/refunds', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const refunds = await Order.find({ 'refund.status': { $ne: 'none' } })
            .sort({ updatedAt: -1 })
            .populate('userId', 'name email phone')
            .lean();

        res.json({ success: true, data: refunds });
    } catch (error) {
        console.error('❌ Refunds report error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch refunds' });
    }
});

// ============================================
// PUT /api/admin/orders/:id/refund  –  Process Refund
// ============================================
router.put('/orders/:id/refund', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status, amount, reason } = req.body;
        if (!['approved', 'processed'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid refund status' });
        }

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            {
                'refund.status': status,
                'refund.amount': amount,
                'refund.reason': reason,
                'refund.processedAt': status === 'processed' ? new Date() : undefined
            },
            { new: true }
        ).populate('userId', 'name email');

        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        res.json({ success: true, message: 'Refund updated', data: order });
    } catch (error) {
        console.error('❌ Process refund error:', error);
        res.status(500).json({ success: false, message: 'Failed to process refund' });
    }
});

// ============================================
// Finance helper — safe date parsing
// Rejects non-ISO-8601 strings to prevent NoSQL operator injection
// ============================================
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]{0,29})?$/;
function parseSafeDate(str, fallback) {
  if (!str) return fallback;
  if (!ISO_DATE_RE.test(String(str))) return fallback;
  const d = new Date(str);
  return isNaN(d.getTime()) ? fallback : d;
}

// ============================================
// GET /api/admin/finance/gst-summary
// ============================================
router.get('/finance/gst-summary', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const start = parseSafeDate(req.query.from, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
    const end   = parseSafeDate(req.query.to,   new Date());

    const orders = await Order.find({
      createdAt: { $gte: start, $lte: end },
      'payment.status': 'completed'
    }).lean();

    const totalTaxable = orders.reduce((s, o) => s + (o.subtotal || 0), 0);
    const totalGst = orders.reduce((s, o) => s + (o.tax || 0), 0);
    const cgst = +(totalGst / 2).toFixed(2);
    const sgst = +(totalGst / 2).toFixed(2);
    const igst = 0;

    res.json({ success: true, data: {
      period: { from: start, to: end },
      totalTaxable: +totalTaxable.toFixed(2),
      totalGst: +totalGst.toFixed(2),
      cgst, sgst, igst,
      orderCount: orders.length
    }});
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch GST summary' });
  }
});

// ============================================
// GET /api/admin/finance/sales-register
// ============================================
router.get('/finance/sales-register', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const start = parseSafeDate(req.query.from, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const end   = parseSafeDate(req.query.to,   new Date());
    const parsedPage = Math.max(1, parseInt(req.query.page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (parsedPage - 1) * parsedLimit;

    const [orders, total] = await Promise.all([
      Order.find({ createdAt: { $gte: start, $lte: end }, 'payment.status': 'completed' })
        .sort({ createdAt: -1 }).skip(skip).limit(parsedLimit)
        .populate('userId', 'name email phone').lean(),
      Order.countDocuments({ createdAt: { $gte: start, $lte: end }, 'payment.status': 'completed' })
    ]);

    const register = orders.map(o => ({
      orderId: o.orderId,
      date: o.createdAt,
      customerName: o.customerName || o.userId?.name,
      customerEmail: o.customerEmail || o.userId?.email,
      taxableValue: o.subtotal || 0,
      gstAmount: o.tax || 0,
      cgst: +((o.tax || 0) / 2).toFixed(2),
      sgst: +((o.tax || 0) / 2).toFixed(2),
      igst: 0,
      total: o.total,
      paymentMethod: o.payment?.method,
      status: o.status
    }));

    res.json({ success: true, data: register, pagination: { total, page: parsedPage, limit: parsedLimit, pages: Math.ceil(total / parsedLimit) } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch sales register' });
  }
});

// ============================================
// Settlements
// ============================================
const Settlement = require('../models/Settlement');

// GET /api/admin/settlements
router.get('/settlements', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;
    const VALID_SETTLEMENT_STATUSES = ['pending', 'processing', 'paid', 'frozen', 'disputed'];
    const query = {};
    if (status) {
      if (!VALID_SETTLEMENT_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status value' });
      }
      query.status = status;
    }
    const [settlements, total] = await Promise.all([
      Settlement.find(query).sort({ createdAt: -1 }).skip(skip).limit(parsedLimit)
        .populate('sellerId', 'name email seller.businessName').lean(),
      Settlement.countDocuments(query)
    ]);
    res.json({ success: true, data: settlements, pagination: { total, page: parsedPage, limit: parsedLimit, pages: Math.ceil(total / parsedLimit) } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch settlements' });
  }
});

router.put('/settlements/:id/freeze', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const reason = String(req.body.reason || 'Admin freeze').slice(0, 500);
    const s = await Settlement.findByIdAndUpdate(
      req.params.id,
      { status: 'frozen', frozenReason: reason },
      { new: true }
    );
    if (!s) return res.status(404).json({ success: false, message: 'Settlement not found' });
    res.json({ success: true, message: 'Settlement frozen', data: s });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to freeze settlement' });
  }
});

router.put('/settlements/:id/release', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const s = await Settlement.findByIdAndUpdate(req.params.id, { status: 'pending', frozenReason: null }, { new: true });
    if (!s) return res.status(404).json({ success: false, message: 'Settlement not found' });
    res.json({ success: true, message: 'Settlement released', data: s });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to release settlement' });
  }
});

router.put('/settlements/:id/pay', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const VALID_PAYOUT_METHODS = ['bank_transfer', 'upi', 'cheque'];
    const payoutReference = String(req.body.payoutReference || '').slice(0, 100);
    const payoutMethod = VALID_PAYOUT_METHODS.includes(req.body.payoutMethod)
      ? req.body.payoutMethod
      : 'bank_transfer';
    const s = await Settlement.findByIdAndUpdate(req.params.id,
      { status: 'paid', payoutReference, payoutMethod, payoutDate: new Date() },
      { new: true }
    );
    if (!s) return res.status(404).json({ success: false, message: 'Settlement not found' });
    res.json({ success: true, message: 'Settlement marked as paid', data: s });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to process payout' });
  }
});

// ============================================
// Support Tickets
// ============================================
const SupportTicket = require('../models/SupportTicket');

// GET /api/admin/tickets
router.get('/tickets', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { status, priority, page = 1, limit = 20 } = req.query;
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;
    const VALID_TICKET_STATUSES = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'];
    const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
    const query = {};
    if (status) {
      if (!VALID_TICKET_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status value' });
      }
      query.status = status;
    }
    if (priority) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ success: false, message: 'Invalid priority value' });
      }
      query.priority = priority;
    }
    const [tickets, total] = await Promise.all([
      SupportTicket.find(query).sort({ createdAt: -1 }).skip(skip).limit(parsedLimit)
        .populate('userId', 'name email').populate('orderId', 'orderId total').lean(),
      SupportTicket.countDocuments(query)
    ]);
    res.json({ success: true, data: tickets, pagination: { total, page: parsedPage, limit: parsedLimit, pages: Math.ceil(total / parsedLimit) } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

router.post('/tickets', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { userId, orderId } = req.body;
    const subject     = String(req.body.subject     || '').slice(0, 300);
    const description = String(req.body.description || '').slice(0, 5000);
    const VALID_TICKET_CATEGORIES = ['order_issue', 'payment', 'refund', 'account', 'listing', 'other'];
    const VALID_TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
    const category = VALID_TICKET_CATEGORIES.includes(req.body.category) ? req.body.category : 'other';
    const priority = VALID_TICKET_PRIORITIES.includes(req.body.priority) ? req.body.priority : 'medium';
    if (!subject) return res.status(400).json({ success: false, message: 'Subject required' });
    const ticket = await SupportTicket.create({
      ticketId: 'TKT-' + Date.now(),
      userId, orderId, subject, description, category, priority,
      messages: [{ sender: 'admin', content: description || subject, sentAt: new Date(), adminId: req.user.id }]
    });
    res.status(201).json({ success: true, data: ticket });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to create ticket' });
  }
});

router.put('/tickets/:id/resolve', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const resolution = String(req.body.resolution || 'Resolved by admin').slice(0, 2000);
    const ticket = await SupportTicket.findByIdAndUpdate(req.params.id,
      { status: 'resolved', resolution, resolvedAt: new Date() },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    res.json({ success: true, message: 'Ticket resolved', data: ticket });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to resolve ticket' });
  }
});

router.post('/tickets/:id/message', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const content = String(req.body.content || '').slice(0, 5000);
    if (!content) return res.status(400).json({ success: false, message: 'Content required' });
    const ticket = await SupportTicket.findByIdAndUpdate(req.params.id,
      { $push: { messages: { sender: 'admin', content, sentAt: new Date(), adminId: req.user.id } }, status: 'in_progress' },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    res.json({ success: true, data: ticket });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to add message' });
  }
});

// ============================================
// Document Generation
// ============================================
const GeneratedDocument = require('../models/GeneratedDocument');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildDocumentHtml(type, data) {
  const now = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const docLabels = { invoice: 'Tax Invoice', receipt: 'Receipt', credit_note: 'Credit Note', debit_note: 'Debit Note', settlement_statement: 'Settlement Statement', payout_summary: 'Payout Summary', booking_confirmation: 'Booking Confirmation', order_confirmation: 'Order Confirmation', cancellation_receipt: 'Cancellation Receipt', refund_receipt: 'Refund Receipt', commission_statement: 'Commission Statement' };
  const label = escapeHtml(docLabels[type] || 'Document');
  const docId = escapeHtml(data.documentId || 'AUTO');
  const customerName = escapeHtml(data.customerName || '—');
  const referenceId = escapeHtml(data.referenceId || '—');
  const itemRows = (data.items || []).map(i => {
    const name = escapeHtml(i.name || '—');
    const qty = escapeHtml(i.quantity || 1);
    const price = Number(i.price || 0);
    const gstRate = escapeHtml(i.gstRate || 0);
    const amount = (price * Number(i.quantity || 1)).toLocaleString('en-IN');
    return `<tr><td>${name}</td><td>${qty}</td><td>${price.toLocaleString('en-IN')}</td><td>${gstRate}%</td><td>${amount}</td></tr>`;
  }).join('');
  const total = Number(data.total || 0).toLocaleString('en-IN');
  return [
    '<!DOCTYPE html><html><head><meta charset="UTF-8">',
    `<title>${label}</title>`,
    '<style>body{font-family:system-ui,sans-serif;margin:0;padding:32px;color:#111;background:#fff}',
    'h1{font-size:1.5rem;margin-bottom:4px}',
    '.badge{font-size:.7rem;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;padding:2px 8px;border-radius:999px;display:inline-block;margin-bottom:16px}',
    '.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:24px;font-size:.875rem}',
    '.meta span{color:#6b7280}.val{color:#111;font-weight:600}',
    'table{width:100%;border-collapse:collapse;font-size:.875rem}',
    'th{background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:8px 12px;text-align:left;font-weight:600}',
    'td{padding:8px 12px;border-bottom:1px solid #f3f4f6}',
    '.total-row td{font-weight:700;background:#f0fdf4}',
    '.footer{margin-top:32px;font-size:.75rem;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px}',
    '</style></head><body>',
    `<h1>${label}</h1>`,
    '<span class="badge">EmproiumVipani \u2022 Made in India</span>',
    '<div class="meta">',
    `<span>Document ID</span><span class="val">${docId}</span>`,
    `<span>Date</span><span class="val">${now}</span>`,
    `<span>Customer</span><span class="val">${customerName}</span>`,
    `<span>Reference</span><span class="val">${referenceId}</span>`,
    '</div>',
    '<table><thead><tr><th>Item / Description</th><th>Qty</th><th>Rate (\u20b9)</th><th>GST</th><th>Amount (\u20b9)</th></tr></thead>',
    `<tbody>${itemRows}<tr class="total-row"><td colspan="4">Total</td><td>\u20b9${total}</td></tr></tbody></table>`,
    '<div class="footer">This is a computer-generated document. EmproiumVipani Pvt. Ltd. \u2022 GSTIN: XXXXXXXXXXXX \u2022 support@emproiumvipani.com</div>',
    '</body></html>'
  ].join('');
}

// POST /api/admin/documents/generate
router.post('/documents/generate', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { type, referenceType, referenceId, data } = req.body;
    const validTypes = ['invoice','receipt','credit_note','debit_note','settlement_statement','payout_summary','booking_confirmation','order_confirmation','cancellation_receipt','refund_receipt','commission_statement'];
    if (!validTypes.includes(type)) return res.status(400).json({ success: false, message: 'Invalid document type' });

    const htmlContent = buildDocumentHtml(type, data || {});

    const doc = await GeneratedDocument.create({
      documentId: 'DOC-' + Date.now() + '-' + type.toUpperCase().slice(0, 3),
      type, referenceType, referenceId,
      generatedBy: req.user.id,
      generatedFor: data?.userId,
      data: data || {},
      htmlContent,
      status: 'final'
    });

    res.status(201).json({ success: true, message: 'Document generated', data: doc });
  } catch (e) {
    console.error('Document generation error:', e);
    res.status(500).json({ success: false, message: 'Failed to generate document' });
  }
});

// GET /api/admin/documents
router.get('/documents', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;
    const VALID_DOC_TYPES = ['invoice','receipt','credit_note','debit_note','settlement_statement','payout_summary','booking_confirmation','order_confirmation','cancellation_receipt','refund_receipt','commission_statement'];
    const query = {};
    if (type) {
      if (!VALID_DOC_TYPES.includes(type)) {
        return res.status(400).json({ success: false, message: 'Invalid document type' });
      }
      query.type = type;
    }
    const [docs, total] = await Promise.all([
      GeneratedDocument.find(query).sort({ createdAt: -1 }).skip(skip).limit(parsedLimit)
        .populate('generatedFor', 'name email').populate('generatedBy', 'name').lean(),
      GeneratedDocument.countDocuments(query)
    ]);
    res.json({ success: true, data: docs, pagination: { total, page: parsedPage, limit: parsedLimit, pages: Math.ceil(total / parsedLimit) } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch documents' });
  }
});

// GET /api/admin/documents/:id/html — render document as HTML page
router.get('/documents/:id/html', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const doc = await GeneratedDocument.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    res.setHeader('Content-Type', 'text/html');
    res.send(doc.htmlContent || '<p>Document content not available</p>');
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to render document' });
  }
});

// ============================================
// Platform Settings (in-memory; replace with DB in production)
// ============================================
const platformSettings = {
  commissionRate: 5,
  gstRate: 18,
  freeShippingThreshold: 1000,
  defaultShipping: 50,
  otpExpiry: 600,
  maxOtpAttempts: 5,
  reviewModerationEnabled: false,
  listingModerationEnabled: false,
  maintenanceMode: false,
  allowGuestCheckout: false,
  platformName: 'EmproiumVipani',
  supportEmail: 'support@emproiumvipani.com'
};

router.get('/settings', verifyToken, verifyAdmin, (req, res) => {
  res.json({ success: true, data: platformSettings });
});

router.put('/settings', verifyToken, verifyAdmin, (req, res) => {
  const allowed = ['commissionRate','gstRate','freeShippingThreshold','defaultShipping','otpExpiry','maxOtpAttempts','reviewModerationEnabled','listingModerationEnabled','maintenanceMode','platformName','supportEmail'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) platformSettings[key] = req.body[key];
  }
  res.json({ success: true, message: 'Settings updated', data: platformSettings });
});

module.exports = router;
