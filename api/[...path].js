// ============================================
// VERCEL SERVERLESS CATCH-ALL FOR /api/*
// ============================================
// Vercel routes every /api/* request here.
// On cold start we copy seed JSON files from
// the bundled server/db/ into /tmp/db/ so that
// jsonDB has a writable path (Vercel's deployed
// filesystem is read-only; /tmp is ephemeral
// but writable within the same function instance).
// ============================================

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Bootstrap /tmp/db from bundled seed data ─────────────────────────────────
const TMP_DB  = '/tmp/db';
const SEED_DB = path.join(__dirname, '..', 'server', 'db');

if (!fs.existsSync(TMP_DB)) {
    fs.mkdirSync(TMP_DB, { recursive: true });
    try {
        const files = fs.readdirSync(SEED_DB).filter(f => f.endsWith('.json'));
        for (const file of files) {
            fs.copyFileSync(path.join(SEED_DB, file), path.join(TMP_DB, file));
        }
        console.log('[serverless] Initialized /tmp/db from seed data');
    } catch (err) {
        console.warn('[serverless] Could not copy seed DB:', err.message);
    }
}

// Tell jsonDB to use /tmp/db (must be set before any route module is require'd)
process.env.TRIU_DB_DIR = TMP_DB;

// ── Build a lightweight Express app with all API routes ───────────────────────
const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const dotenv     = require('dotenv');

// Load env from server/.env if present (development); in production env vars
// come from Vercel's environment settings.
dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const app = express();

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
    origin: (origin, callback) => {
        const allowed = (process.env.CLIENT_URL || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        if (!origin || allowed.length === 0 || allowed.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials:    true,
    methods:        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      200,
    message:  { success: false, message: 'Too many requests, please try again later' },
});
app.use(limiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date(), mode: 'serverless' });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('../server/routes/auth'));
app.use('/api/products', require('../server/routes/products'));
app.use('/api/orders',   require('../server/routes/orders'));
app.use('/api/sellers',  require('../server/routes/sellers'));
app.use('/api/users',    require('../server/routes/users'));
app.use('/api/admin',    require('../server/routes/admin'));
app.use('/api/payments', require('../server/routes/payments'));
app.use('/api/gst',      require('../server/routes/gst'));
app.use('/api/ledger',   require('../server/routes/ledger'));
app.use('/api/billing',  require('../server/routes/billing'));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    console.error('[serverless] Error:', err.message);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
    });
});

module.exports = app;
