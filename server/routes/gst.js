// ============================================
// GST ROUTES
// ============================================
const express    = require('express');
const router     = express.Router();
const gstEngine  = require('../services/gstEngine');
const invoiceService = require('../services/invoiceService');
const { verifyToken } = require('../middleware/auth');

// GET /api/gst/rate/:hsnCode — public
router.get('/rate/:hsnCode', (req, res) => {
    try {
        const rate = gstEngine.getRate(req.params.hsnCode);
        return res.json({ success: true, data: { hsnCode: req.params.hsnCode, rate } });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to get GST rate' });
    }
});

// POST /api/gst/calculate — public
router.post('/calculate', (req, res) => {
    try {
        const { amount, hsnCode, sellerState, buyerState } = req.body;
        if (!amount || isNaN(amount)) {
            return res.status(400).json({ success: false, message: 'Valid amount is required' });
        }
        const result = gstEngine.calculateGST(parseFloat(amount), hsnCode, sellerState, buyerState);
        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to calculate GST' });
    }
});

// GET /api/gst/return/:sellerId/:month/:year — auth required
router.get('/return/:sellerId/:month/:year', verifyToken, (req, res) => {
    try {
        const { sellerId, month, year } = req.params;
        // Allow seller to access only their own data, admin can access any
        if (req.user.id !== sellerId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        const gstReturn = gstEngine.generateGSTReturn(sellerId, parseInt(month, 10), parseInt(year, 10));
        return res.json({ success: true, data: gstReturn });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to generate GST return' });
    }
});

// GET /api/gst/invoices/:sellerId — auth required
router.get('/invoices/:sellerId', verifyToken, (req, res) => {
    try {
        const { sellerId } = req.params;
        if (req.user.id !== sellerId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        const { fromDate, toDate, status } = req.query;
        const invoices = invoiceService.listInvoices(sellerId, { fromDate, toDate, status });
        return res.json({ success: true, data: invoices });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to list invoices' });
    }
});

// GET /api/gst/liability/:sellerId — auth required
router.get('/liability/:sellerId', verifyToken, (req, res) => {
    try {
        const { sellerId } = req.params;
        if (req.user.id !== sellerId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        const today = new Date();
        const gstReturn = gstEngine.generateGSTReturn(sellerId, today.getMonth() + 1, today.getFullYear());
        return res.json({
            success: true,
            data: {
                sellerId,
                month:           today.getMonth() + 1,
                year:            today.getFullYear(),
                totalTaxable:    gstReturn.totalTaxableAmt,
                totalLiability:  gstReturn.totalTax,
                invoices:        gstReturn.totalInvoices,
            },
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to get GST liability' });
    }
});

module.exports = router;
