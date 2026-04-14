// ============================================
// EMPORIUMVIPANI — BACKEND SERVER (Express.js)
// ============================================
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const dotenv    = require('dotenv');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();

// ── Sentry (graceful no-op if SENTRY_DSN not set) ────────────────────────────
let Sentry = null;
if (process.env.SENTRY_DSN) {
    try {
        Sentry = require('@sentry/node');
        Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
        app.use(Sentry.Handlers.requestHandler());
        console.log('✅ Sentry initialized');
    } catch {
        console.log('⚠️ Sentry not available');
    }
}

// ── Structured request logger ─────────────────────────────────────────────────
const IS_TEST = process.env.NODE_ENV === 'test';

app.use((req, res, next) => {
    const start  = Date.now();
    const reqId  = req.headers['x-request-id'] || require('crypto').randomBytes(6).toString('hex');

    // Attach request ID for tracing through the request lifecycle
    req.reqId = reqId;
    res.setHeader('X-Request-Id', reqId);

    res.on('finish', () => {
        const ms     = Date.now() - start;
        const status = res.statusCode;
        const level  = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
        // Skip noisy health/metrics logs in test
        if (!IS_TEST || (status >= 400)) {
            const line = `[${new Date().toISOString()}] [${level}] [${reqId}] ${req.method} ${req.path} ${status} ${ms}ms`;
            if (level === 'ERROR') console.error(line);
            else if (level === 'WARN') console.warn(line);
            else if (req.path !== '/api/health') console.log(line);
        }
    });

    next();
});

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
    origin: (origin, callback) => {
        const allowed = (process.env.CLIENT_URL || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        // Allow same-origin (no origin header) and configured origins
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
app.use('/api/', limiter);

// ── Prometheus-style metrics ──────────────────────────────────────────────────
let _requestCount = 0;
let _errorCount   = 0;
const _startTime  = Date.now();

app.use((req, _res, next) => { _requestCount++; next(); });

const metricsLimiter = rateLimit({
    windowMs: 60 * 1000,
    max:      30,
    message:  { success: false, message: 'Too many requests to metrics endpoint' },
});

app.get('/api/metrics', metricsLimiter, (_req, res) => {
    const db = require('./utils/jsonDB');
    const uptime = Math.floor((Date.now() - _startTime) / 1000);
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send([
        `# HELP http_requests_total Total HTTP requests`,
        `# TYPE http_requests_total counter`,
        `http_requests_total ${_requestCount}`,
        `# HELP http_errors_total Total HTTP errors`,
        `# TYPE http_errors_total counter`,
        `http_errors_total ${_errorCount}`,
        `# HELP process_uptime_seconds Server uptime in seconds`,
        `# TYPE process_uptime_seconds gauge`,
        `process_uptime_seconds ${uptime}`,
        `# HELP db_users_total Total users in DB`,
        `# TYPE db_users_total gauge`,
        `db_users_total ${db.count('users')}`,
        `# HELP db_products_total Total active products`,
        `# TYPE db_products_total gauge`,
        `db_products_total ${db.count('products', p => p.status === 'active')}`,
        `# HELP db_orders_total Total orders`,
        `# TYPE db_orders_total gauge`,
        `db_orders_total ${db.count('orders')}`,
    ].join('\n'));
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date(), uptime: process.uptime() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/sellers',  require('./routes/sellers'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/gst',      require('./routes/gst'));
app.use('/api/ledger',   require('./routes/ledger'));
app.use('/api/jarvis',   require('./routes/jarvis'));
app.use('/api/billing',  require('./routes/billing'));
app.use('/api/bots',     require('./routes/bots'));

// ── Static frontend ───────────────────────────────────────────────────────────
const distPath = path.join(__dirname, '..', 'dist');
const srcPath  = path.join(__dirname, '..', 'src');
const { existsSync } = require('fs');

// Rate limiter for static/SPA routes (separate from /api limiter)
const staticLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
});

if (existsSync(distPath)) {
    app.use(express.static(distPath));
    // SPA fallback — serves the fixed index.html for all non-API client routes
    app.get('*', staticLimiter, (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        // Path is hardcoded — no user input reaches sendFile
        res.sendFile(path.join(distPath, 'index.html'));
    });
} else if (existsSync(srcPath)) {
    app.use(staticLimiter, express.static(path.join(__dirname, '..')));
}

// ── Sentry error handler ─────────────────────────────────────────────────────
if (Sentry) {
    app.use(Sentry.Handlers.errorHandler());
}

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use('*', (req, res) => {
    res.status(404).json({ success: false, message: 'Route not found', path: req.path });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
    _errorCount++;
    console.error('❌ Error:', err.message);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const eventQueue = require('./services/eventQueue');
const jarvis     = require('./ai/jarvis');

eventQueue.initialize();
jarvis.initialize();

const server = app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║  🚀 EmporiumVipani Server             ║
║  ✅ Running on port ${PORT}             ║
║  📊 Environment: ${process.env.NODE_ENV || 'development'}      ║
╚═══════════════════════════════════════╝
    `);
});

process.on('SIGTERM', () => {
    console.log('⚠️ SIGTERM — shutting down gracefully');
    server.close(() => { console.log('✅ Server closed'); process.exit(0); });
});

// Expose server handle so integration tests can close it cleanly
app._server = server;
module.exports = app;
