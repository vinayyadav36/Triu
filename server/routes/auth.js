const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const db       = require('../utils/jsonDB');
const { validateEmail } = require('../utils/validators');

// ── Token helper ─────────────────────────────────────────────────────────────
function generateToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_SECRET || 'dev-secret-change-me', {
        expiresIn: process.env.JWT_EXPIRE || '7d',
    });
}

function safeUser(user) {
    const { passwordHash, ...rest } = user;
    return rest;
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
        });

        const token = generateToken(user.id);
        return res.status(201).json({ success: true, message: 'Account created successfully', token, user: safeUser(user) });
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
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        if (user.status !== 'active') {
            return res.status(403).json({ success: false, message: 'Your account is not active' });
        }

        db.updateById('users', user.id, { lastLogin: new Date().toISOString() });

        const token = generateToken(user.id);
        return res.json({ success: true, message: 'Login successful', token, user: safeUser(user) });
    } catch (err) {
        console.error('❌ Login error:', err);
        return res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// ============================================
// POST /api/auth/verify-token
// ============================================
router.post('/verify-token', (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
        const user    = db.findById('users', decoded.userId);
        if (!user) return res.status(401).json({ success: false, message: 'User not found' });

        return res.json({ success: true, user: safeUser(user) });
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
});

// ============================================
// POST /api/auth/refresh-token
// ============================================
router.post('/refresh-token', (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

        const decoded  = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
        const newToken = generateToken(decoded.userId);
        return res.json({ success: true, message: 'Session extended', token: newToken });
    } catch (err) {
        const isExpired = err.name === 'TokenExpiredError';
        return res.status(401).json({ success: false, message: isExpired ? 'Session expired' : 'Invalid token' });
    }
});

// ============================================
// POST /api/auth/logout
// ============================================
router.post('/logout', (_req, res) => {
    res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
