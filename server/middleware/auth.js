const jwt = require('jsonwebtoken');
const db  = require('../utils/jsonDB');

const JWT_ACCESS_SECRET = process.env.JWT_SECRET || 'dev-access-secret-change-in-prod';

// ── Role-Permission Map (RBAC) ────────────────────────────────────────────────
const ROLE_PERMISSIONS = {
    admin:    ['read','write','delete','manage_users','manage_sellers','manage_orders','manage_products','view_reports','manage_sessions'],
    seller:   ['read','write','manage_own_products','view_own_orders','view_own_reports'],
    customer: ['read','place_order','view_own_orders','manage_wishlist'],
    agent:    ['read','update_delivery','view_assigned_orders'],
    partner:  ['read','add_leads','view_own_commissions'],
    bot:      ['read','write','run_automation','access_ml_scripts'],
};

function hasPermission(role, permission) {
    const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.customer;
    return perms.includes(permission);
}

// ── JWT access-token authentication ──────────────────────────────────────────
const verifyToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_ACCESS_SECRET);
        } catch (jwtErr) {
            const msg = jwtErr.name === 'TokenExpiredError'
                ? 'Access token expired — please refresh'
                : 'Invalid token';
            return res.status(401).json({ success: false, message: msg });
        }

        if (decoded.type !== 'access') {
            return res.status(401).json({ success: false, message: 'Wrong token type — use access token' });
        }

        const user = db.findById('users', decoded.userId);
        if (!user) return res.status(401).json({ success: false, message: 'User not found' });
        if (user.status !== 'active') return res.status(403).json({ success: false, message: 'Account not active' });

        req.user = {
            id:          user.id,
            role:        user.role,
            seller:      user.seller,
            permissions: ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.customer,
        };
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Authentication failed' });
    }
};

const verifyAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
};

const verifySeller = (req, res, next) => {
    if (req.user.role !== 'seller' || !req.user.seller?.verified) {
        return res.status(403).json({ success: false, message: 'Verified seller access required' });
    }
    next();
};

/**
 * Middleware factory — require a specific RBAC permission.
 * Usage: router.get('/route', verifyToken, requirePermission('view_reports'), handler)
 */
const requirePermission = (permission) => (req, res, next) => {
    if (!hasPermission(req.user?.role, permission)) {
        return res.status(403).json({
            success: false,
            message: `Access denied — '${permission}' permission required`,
        });
    }
    next();
};

module.exports = { verifyToken, verifyAdmin, verifySeller, requirePermission, hasPermission, ROLE_PERMISSIONS };
