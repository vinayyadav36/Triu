'use strict';

// ============================================
// AUDIT LOGGER — DPDP Act 2023 compliance
// Records every data-access event: who, when, why, what resource.
// Backed by JSON file DB (collection: audit_log).
// ============================================

const db = require('./jsonDB');

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
 * Express middleware that logs every request to the audit_log collection.
 * Non-blocking: logging failures never interrupt the request lifecycle.
 */
function auditLogger(req, res, next) {
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
            timestamp:  new Date().toISOString(),
        };

        // Fire-and-forget — never block response
        try {
            db.create('audit_log', entry);
        } catch (err) {
            console.error('[auditLogger] Write failed:', err.message);
        }
    });

    next();
}

// ── Manual event logger (call from controllers) ──────────────────────────────
/**
 * Log a specific data-processing event (e.g., data deletion, export).
 * @param {{ actorId, actorRole, action, resource, purpose, ip? }} event
 */
function logEvent(event) {
    try {
        db.create('audit_log', {
            actorId:   String(event.actorId || 'system'),
            actorRole: String(event.actorRole || 'system'),
            action:    String(event.action),
            resource:  String(event.resource),
            method:    'EVENT',
            statusCode: null,
            purpose:   String(event.purpose || 'operational'),
            ip:        String(event.ip || 'internal'),
            userAgent: 'server',
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[auditLogger] logEvent failed:', err.message);
    }
}

module.exports = { auditLogger, logEvent };
