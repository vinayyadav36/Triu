'use strict';
const express = require('express');
const router  = express.Router();
const billing = require('../services/billingEngine');

// ── Auth middleware (reuse existing) ─────────────────────────────────────────
let authMiddleware;
try {
    const auth = require('../middleware/auth');
    authMiddleware = typeof auth === 'function' ? auth : auth.verifyToken;
    if (typeof authMiddleware !== 'function') {
        authMiddleware = (_req, _res, next) => next();
    }
} catch {
    // Fallback: no-op if middleware not found (for standalone testing)
    authMiddleware = (_req, _res, next) => next();
}

// ── Helper: wrap async route handlers ────────────────────────────────────────
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── POST /api/billing/session — create session ────────────────────────────────
router.post('/session', authMiddleware, wrap(async (req, res) => {
    const { sector, ...data } = req.body;
    if (!sector) return res.status(400).json({ success: false, message: 'sector is required' });
    data.cashierId = req.user?.userId || req.user?.id || null;
    const session = billing.createBillingSession(sector, data);
    res.status(201).json({ success: true, data: session });
}));

// ── GET /api/billing/session/:id — get session ────────────────────────────────
router.get('/session/:id', authMiddleware, wrap(async (req, res) => {
    const session = billing.getSession(req.params.id);
    res.json({ success: true, data: session });
}));

// ── POST /api/billing/session/:id/item — add item ─────────────────────────────
router.post('/session/:id/item', authMiddleware, wrap(async (req, res) => {
    const session = billing.addItem(req.params.id, req.body);
    res.status(201).json({ success: true, data: session });
}));

// ── POST /api/billing/session/:id/discount — apply discount ──────────────────
router.post('/session/:id/discount', authMiddleware, wrap(async (req, res) => {
    const session = billing.applyDiscount(req.params.id, req.body);
    res.json({ success: true, data: session });
}));

// ── GET /api/billing/session/:id/totals — calculate totals ───────────────────
router.get('/session/:id/totals', authMiddleware, wrap(async (req, res) => {
    const totals = billing.calculateTotals(req.params.id);
    res.json({ success: true, data: totals });
}));

// ── POST /api/billing/session/:id/checkout — checkout ────────────────────────
router.post('/session/:id/checkout', authMiddleware, wrap(async (req, res) => {
    const session = billing.checkout(req.params.id, req.body);
    res.json({ success: true, data: session });
}));

// ── GET /api/billing/session/:id/slip — get text receipt ─────────────────────
router.get('/session/:id/slip', authMiddleware, wrap(async (req, res) => {
    const slip = billing.generateSlip(req.params.id);
    if (req.query.format === 'json') {
        return res.json({ success: true, data: { slip } });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(slip);
}));

// ── POST /api/billing/session/:id/fuel — add fuel reading (petrol) ───────────
router.post('/session/:id/fuel', authMiddleware, wrap(async (req, res) => {
    const session = billing.addFuelReading(req.params.id, req.body);
    res.status(201).json({ success: true, data: session });
}));

// ── POST /api/billing/session/:id/room — add room charge (hotel) ─────────────
router.post('/session/:id/room', authMiddleware, wrap(async (req, res) => {
    const session = billing.addRoomCharge(req.params.id, req.body);
    res.status(201).json({ success: true, data: session });
}));

// ── POST /api/billing/session/:id/rider — add rider info (food) ──────────────
router.post('/session/:id/rider', authMiddleware, wrap(async (req, res) => {
    const session = billing.addRiderInfo(req.params.id, req.body);
    res.status(201).json({ success: true, data: session });
}));

// ── GET /api/billing/history — billing history ────────────────────────────────
router.get('/history', authMiddleware, wrap(async (req, res) => {
    const result = billing.getBillingHistory({
        sector: req.query.sector,
        status: req.query.status,
        limit:  req.query.limit,
        offset: req.query.offset,
    });
    res.json({ success: true, ...result });
}));

// ── Error handler for this router ─────────────────────────────────────────────
router.use((err, _req, res, _next) => {
    const status = err.status || 400;
    res.status(status).json({ success: false, message: err.message || 'Billing error' });
});

module.exports = router;
