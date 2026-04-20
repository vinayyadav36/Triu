const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db       = require('../utils/jsonDB');
const { validateEmail }   = require('../utils/validators');
const { sendOtpEmail }    = require('../utils/emailService');

// ── JWT config ────────────────────────────────────────────────────────────────
const JWT_ACCESS_SECRET  = process.env.JWT_SECRET || 'dev-access-secret-change-in-prod';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-prod';
const ACCESS_TTL         = process.env.JWT_EXPIRE        || '15m';   // short-lived access token
const REFRESH_TTL        = process.env.JWT_REFRESH_EXPIRE || '7d';   // long-lived refresh token

function issueTokenPair(userId, role) {
    const accessToken  = jwt.sign({ userId, role, type: 'access' },  JWT_ACCESS_SECRET,  { expiresIn: ACCESS_TTL });
    const refreshToken = jwt.sign({ userId, role, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });

    // Persist refresh token in JSON DB (allows revocation)
    db.create('sessions', {
        token:     refreshToken,
        userId,
        role,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    return { accessToken, refreshToken };
}

function safeUser({ passwordHash: _ph, keyHash: _kh, ...rest }) {
    return rest;
}

function generateOtp() {
    return String(Math.floor(100_000 + Math.random() * 900_000));
}

// ── Housekeeping: purge expired refresh tokens periodically ───────────────────
function purgeExpiredSessions() {
    try { db.deleteWhere('sessions', s => new Date(s.expiresAt) < new Date()); } catch { /* non-critical */ }
}
if (process.env.NODE_ENV !== 'test') {
    setInterval(purgeExpiredSessions, 60 * 60 * 1000); // every hour
}

// ── Audit logger ──────────────────────────────────────────────────────────────
function auditLog(action, userId, meta = {}) {
    try {
        db.create('audit_log', {
            action,
            userId: userId || 'anonymous',
            ...meta,
            ip: meta.ip || null,
            at: new Date().toISOString(),
        });
    } catch { /* non-critical */ }
}

// ============================================
// POST /api/auth/register
// ============================================
router.post('/register', async (req, res) => {
    try {
        const { name, email, phone, password, passwordConfirm, role } = req.body;

        if (!name || !email || !phone || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        if (password !== passwordConfirm) {
            return res.status(400).json({ success: false, message: 'Passwords do not match' });
        }
        if (!validateEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const existing = db.findOne('users', u => u.email === email.toLowerCase());
        if (existing) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = db.create('users', {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            phone: phone.trim(),
            passwordHash,
            role: role === 'seller' ? 'seller' : 'customer',
            status: 'active',
            seller: null,
            orders: [],
            wishlist: [],
            address: null,
            lastLogin: null,
            xp: 0,
            level: 1,
            badges: [],
        });

        const { accessToken, refreshToken } = issueTokenPair(user.id, user.role);
        auditLog('register', user.id, { email: user.email, ip: req.ip });

        return res.status(201).json({
            success:      true,
            message:      'Account created successfully',
            accessToken,
            refreshToken,
            token:        accessToken, // backward-compat alias
            user:         safeUser(user),
        });
    } catch (err) {
        console.error('❌ Register error:', err);
        return res.status(500).json({ success: false, message: 'Registration failed' });
    }
});

// ============================================
// POST /api/auth/login
// ============================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const user = db.findOne('users', u => u.email === email.toLowerCase().trim());
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            auditLog('login_fail', user.id, { email: user.email, ip: req.ip });
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        if (user.status !== 'active') {
            return res.status(403).json({ success: false, message: 'Your account is not active' });
        }

        db.updateById('users', user.id, { lastLogin: new Date().toISOString() });
        const { accessToken, refreshToken } = issueTokenPair(user.id, user.role);
        auditLog('login', user.id, { email: user.email, ip: req.ip });

        return res.json({
            success:      true,
            message:      'Login successful',
            accessToken,
            refreshToken,
            token:        accessToken, // backward-compat alias
            user:         safeUser(user),
        });
    } catch (err) {
        console.error('❌ Login error:', err);
        return res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// ============================================
// POST /api/auth/refresh-token
// Exchange a valid refresh token for a new access+refresh pair
// ============================================
router.post('/refresh-token', (req, res) => {
    try {
        const rawToken = req.body.refreshToken || req.headers.authorization?.split(' ')[1];
        if (!rawToken) {
            return res.status(401).json({ success: false, message: 'Refresh token required' });
        }

        // Verify JWT signature + expiry
        let decoded;
        try {
            decoded = jwt.verify(rawToken, JWT_REFRESH_SECRET);
        } catch (jwtErr) {
            const msg = jwtErr.name === 'TokenExpiredError' ? 'Refresh token expired' : 'Invalid refresh token';
            return res.status(401).json({ success: false, message: msg });
        }

        if (decoded.type !== 'refresh') {
            return res.status(401).json({ success: false, message: 'Invalid token type' });
        }

        // Check the token is still in the sessions store (not revoked)
        const session = db.findOne('sessions', s => s.token === rawToken);
        if (!session) {
            return res.status(401).json({ success: false, message: 'Refresh token revoked or not found' });
        }

        // Rotate: delete old refresh token, issue new pair
        db.deleteWhere('sessions', s => s.token === rawToken);
        const { accessToken, refreshToken: newRefreshToken } = issueTokenPair(decoded.userId, decoded.role);

        return res.json({
            success:      true,
            message:      'Tokens refreshed',
            accessToken,
            refreshToken: newRefreshToken,
            token:        accessToken,
        });
    } catch (err) {
        console.error('❌ Refresh-token error:', err);
        return res.status(500).json({ success: false, message: 'Token refresh failed' });
    }
});

// ============================================
// POST /api/auth/verify-token
// ============================================
router.post('/verify-token', (req, res) => {
    try {
        const rawToken = req.headers.authorization?.split(' ')[1];
        if (!rawToken) return res.status(401).json({ success: false, message: 'No token provided' });

        const decoded = jwt.verify(rawToken, JWT_ACCESS_SECRET);
        const user    = db.findById('users', decoded.userId);
        if (!user) return res.status(401).json({ success: false, message: 'User not found' });

        return res.json({ success: true, user: safeUser(user) });
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
});

// ============================================
// POST /api/auth/logout
// Revoke refresh token
// ============================================
router.post('/logout', (req, res) => {
    try {
        const refreshToken = req.body.refreshToken;
        if (refreshToken) {
            db.deleteWhere('sessions', s => s.token === refreshToken);
        }
        const userId = req.body.userId;
        auditLog('logout', userId, { ip: req.ip });
        res.json({ success: true, message: 'Logged out successfully' });
    } catch {
        res.json({ success: true, message: 'Logged out successfully' });
    }
});

// ============================================
// POST /api/auth/logout-all
// Revoke ALL refresh tokens for a user
// ============================================
router.post('/logout-all', (req, res) => {
    try {
        const rawToken = req.headers.authorization?.split(' ')[1];
        if (!rawToken) return res.status(401).json({ success: false, message: 'No token provided' });

        const decoded = jwt.verify(rawToken, JWT_ACCESS_SECRET);
        db.deleteWhere('sessions', s => s.userId === decoded.userId);
        auditLog('logout_all', decoded.userId, { ip: req.ip });
        return res.json({ success: true, message: 'All sessions terminated' });
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
});

// ============================================
// POST /api/auth/request-otp
// ============================================
router.post('/request-otp', async (req, res) => {
    try {
        const { identifier, purpose = 'login' } = req.body;
        if (!identifier) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const email = identifier.toLowerCase().trim();
        if (!validateEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }

        // Rate-limit: max 3 OTP requests per 10 minutes per email
        const recentOtps = db.find('otps', o =>
            o.email === email &&
            new Date(o.createdAt) > new Date(Date.now() - 10 * 60 * 1000)
        );
        if (recentOtps.length >= 3) {
            return res.status(429).json({ success: false, message: 'Too many OTP requests. Wait 10 minutes.' });
        }

        // Expire old OTPs for this email
        db.deleteWhere('otps', o => o.email === email);

        const otpCode   = generateOtp();
        const requestId = uuidv4();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

        db.create('otps', { requestId, email, otpCode, purpose, expiresAt });
        await sendOtpEmail(email, otpCode, purpose);

        return res.json({ success: true, message: 'OTP sent to your email', requestId });
    } catch (err) {
        console.error('❌ Request OTP error:', err);
        return res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
});

// ============================================
// POST /api/auth/verify-otp
// ============================================
router.post('/verify-otp', async (req, res) => {
    try {
        const { requestId, otpCode, name, phone } = req.body;
        if (!requestId || !otpCode) {
            return res.status(400).json({ success: false, message: 'requestId and otpCode are required' });
        }

        const record = db.findOne('otps', o => o.requestId === requestId);
        if (!record) {
            return res.status(400).json({ success: false, message: 'OTP request not found or already used' });
        }
        if (new Date(record.expiresAt) < new Date()) {
            db.deleteWhere('otps', o => o.requestId === requestId);
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }
        if (record.otpCode !== String(otpCode).trim()) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        // OTP verified — consume it
        db.deleteWhere('otps', o => o.requestId === requestId);

        const email = record.email;
        let user = db.findOne('users', u => u.email === email);

        if (!user) {
            // Auto-create account on first OTP login
            user = db.create('users', {
                name:         name || email.split('@')[0],
                email,
                phone:        phone || '',
                passwordHash: '',
                role:         'customer',
                status:       'active',
                seller:       null,
                orders:       [],
                wishlist:     [],
                address:      null,
                lastLogin:    new Date().toISOString(),
                xp:           0,
                level:        1,
                badges:       [],
            });
        } else {
            db.updateById('users', user.id, { lastLogin: new Date().toISOString() });
        }

        const { accessToken, refreshToken } = issueTokenPair(user.id, user.role);
        auditLog('otp_login', user.id, { email, purpose: record.purpose, ip: req.ip });

        return res.json({
            success:      true,
            message:      'OTP verified',
            accessToken,
            refreshToken,
            token:        accessToken,
            user:         safeUser(user),
        });
    } catch (err) {
        console.error('❌ Verify OTP error:', err);
        return res.status(500).json({ success: false, message: 'OTP verification failed' });
    }
});

// ============================================
// POST /api/auth/set-key  (set a personal passkey)
// ============================================
router.post('/set-key', async (req, res) => {
    try {
        const { identifier, key } = req.body;
        if (!identifier || !key) {
            return res.status(400).json({ success: false, message: 'identifier and key are required' });
        }
        if (key.length < 6) {
            return res.status(400).json({ success: false, message: 'Key must be at least 6 characters' });
        }

        const email = identifier.toLowerCase().trim();
        const user  = db.findOne('users', u => u.email === email);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const keyHash = await bcrypt.hash(key, 10);
        db.updateById('users', user.id, { keyHash });

        const { accessToken, refreshToken } = issueTokenPair(user.id, user.role);
        auditLog('set_key', user.id, { ip: req.ip });

        return res.json({
            success:      true,
            message:      'Personal key set',
            accessToken,
            refreshToken,
            token:        accessToken,
            user:         safeUser(user),
        });
    } catch (err) {
        console.error('❌ Set-key error:', err);
        return res.status(500).json({ success: false, message: 'Failed to set key' });
    }
});

// ============================================
// POST /api/auth/login-with-key
// ============================================
router.post('/login-with-key', async (req, res) => {
    try {
        const { identifier, key } = req.body;
        if (!identifier || !key) {
            return res.status(400).json({ success: false, message: 'identifier and key are required' });
        }

        const email = identifier.toLowerCase().trim();
        const user  = db.findOne('users', u => u.email === email);
        if (!user || !user.keyHash) {
            return res.status(401).json({ success: false, message: 'No key set for this account' });
        }

        const valid = await bcrypt.compare(key, user.keyHash);
        if (!valid) {
            auditLog('key_login_fail', user.id, { ip: req.ip });
            return res.status(401).json({ success: false, message: 'Invalid key' });
        }
        if (user.status !== 'active') {
            return res.status(403).json({ success: false, message: 'Account not active' });
        }

        db.updateById('users', user.id, { lastLogin: new Date().toISOString() });
        const { accessToken, refreshToken } = issueTokenPair(user.id, user.role);
        auditLog('key_login', user.id, { ip: req.ip });

        return res.json({
            success:      true,
            message:      'Login successful',
            accessToken,
            refreshToken,
            token:        accessToken,
            user:         safeUser(user),
        });
    } catch (err) {
        console.error('❌ Login-with-key error:', err);
        return res.status(500).json({ success: false, message: 'Login failed' });
    }
});

module.exports = router;
