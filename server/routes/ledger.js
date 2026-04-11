// ============================================
// LEDGER ROUTES
// ============================================
const express    = require('express');
const router     = express.Router();
const db         = require('../utils/jsonDB');
const ledger     = require('../services/ledgerService');
const settlement = require('../services/settlementService');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

// GET /api/ledger/statement/:accountId
router.get('/statement/:accountId', verifyToken, (req, res) => {
    try {
        const { accountId } = req.params;
        // Allow user to access own account, admin can access any
        if (req.user.id !== accountId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        const { fromDate, toDate } = req.query;
        const entries = ledger.getStatement(accountId, fromDate, toDate);
        return res.json({ success: true, data: entries });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to get statement' });
    }
});

// GET /api/ledger/balance/:accountId
router.get('/balance/:accountId', verifyToken, (req, res) => {
    try {
        const { accountId } = req.params;
        if (req.user.id !== accountId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        const balance = ledger.getBalance(accountId);
        return res.json({ success: true, data: { accountId, balance } });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to get balance' });
    }
});

// GET /api/ledger/entries — admin only
router.get('/entries', verifyToken, verifyAdmin, (req, res) => {
    try {
        const entries = db.find('ledger');
        entries.sort((a, b) => new Date(b.date) - new Date(a.date));
        return res.json({ success: true, data: entries });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to get entries' });
    }
});

// POST /api/ledger/settlement/:sellerId
router.post('/settlement/:sellerId', verifyToken, (req, res) => {
    try {
        const { sellerId } = req.params;
        if (req.user.id !== sellerId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        const { fromDate, toDate } = req.body;
        const result = settlement.processSettlement(sellerId, fromDate, toDate);
        return res.json({ success: true, message: 'Settlement processed', data: result });
    } catch (err) {
        console.error('Settlement error:', err);
        return res.status(500).json({ success: false, message: 'Failed to process settlement' });
    }
});

module.exports = router;
