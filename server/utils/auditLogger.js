'use strict';

// ============================================
// AUDIT LOGGER — DPDP Act 2023 compliance
// Records every data-access event: who, when, why, what resource.
// ============================================

const mongoose = require('mongoose');

// ── Schema ──────────────────────────────────────────────────────────────────
const auditSchema = new mongoose.Schema({
    actorId:    { type: String, default: 'anonymous' }, // user/admin id or 'system'
    actorRole:  { type: String, default: 'unknown' },
    action:     { type: String, required: true },        // e.g. 'READ_USER_PROFILE'
    resource:   { type: String, required: true },        // e.g. '/api/users/profile'
    method:     { type: String, required: true },        // HTTP method
    statusCode: { type: Number },
    ip:         { type: String },
    userAgent:  { type: String },
    purpose:    { type: String, default: 'operational' }, // DPDP: purpose of processing
    timestamp:  { type: Date, default: Date.now, index: true },
}, { timestamps: false });

// Keep audit records for 7 years (Income Tax Act requirement)
auditSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 365 * 24 * 3600 });

let AuditLog;
try {
    AuditLog = mongoose.model('AuditLog');
} catch {
    AuditLog = mongoose.model('AuditLog', auditSchema);
}

// ── PII-sensitive route patterns (always logged at higher priority) ──────────
const PII_PATTERNS = [
    /\/api\/users/,
    /\/api\/auth/,
    /\/api\/admin/,
    /\/api\/sellers.*kyc/,
    /\/api\/payments/,
];

function isPiiRoute(path) {
    return PII_PATTERNS.some(re => re.test(path));
}

// ── Middleware factory ───────────────────────────────────────────────────────
/**
 * Express middleware that logs every request to the AuditLog collection.
 * Non-blocking: logging failures never interrupt the request lifecycle.
 */
function auditLogger(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
        // Skip health-check and static asset noise
        if (req.path === '/api/health' || !req.path.startsWith('/api/')) return;

        const actor = req.user || {};
        const entry = {
            actorId:    String(actor.id || actor._id || 'anonymous'),
            actorRole:  String(actor.role || 'unknown'),
            action:     `${req.method}_${req.path.replace(/\//g, '_').toUpperCase().replace(/^_/, '')}`,
            resource:   req.path,
            method:     req.method,
            statusCode: res.statusCode,
            ip:         (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(),
            userAgent:  (req.headers['user-agent'] || '').slice(0, 200),
            purpose:    isPiiRoute(req.path) ? 'pii-access' : 'operational',
        };

        // Fire-and-forget — never block response
        AuditLog.create(entry).catch(err => {
            console.error('[auditLogger] Write failed:', err.message);
        });
    });

    next();
}

// ── Manual event logger (call from controllers) ──────────────────────────────
/**
 * Log a specific data-processing event (e.g., data deletion, export).
 * @param {{ actorId, actorRole, action, resource, purpose, ip? }} event
 */
async function logEvent(event) {
    try {
        await AuditLog.create({
            actorId:   String(event.actorId || 'system'),
            actorRole: String(event.actorRole || 'system'),
            action:    String(event.action),
            resource:  String(event.resource),
            method:    'EVENT',
            purpose:   String(event.purpose || 'operational'),
            ip:        String(event.ip || 'internal'),
            userAgent: 'server',
        });
    } catch (err) {
        console.error('[auditLogger] logEvent failed:', err.message);
    }
}

module.exports = { auditLogger, logEvent, AuditLog };
