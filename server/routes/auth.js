const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const OtpToken = require('../models/OtpToken');
const { validateEmail } = require('../utils/validators');

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, {
        // Enforce short-lived sessions for security; default 15 minutes
        expiresIn: process.env.JWT_EXPIRE || '15m'
    });
};

// ============================================
// POST /api/auth/register
// ============================================
router.post('/register', async (req, res) => {
    try {
        const { name, email, phone, password, passwordConfirm } = req.body;

        // Validation
        if (!name || !email || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (password !== passwordConfirm) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match'
            });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Create user
        const user = await User.create({
            name,
            email,
            phone,
            password
        });

        // Generate token
        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            token,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('❌ Register error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Registration failed'
        });
    }
});

// ============================================
// POST /api/auth/login
// ============================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user and select password
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check password
        const isPasswordValid = await user.matchPassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if account is active
        if (user.status !== 'active') {
            return res.status(403).json({
                success: false,
                message: 'Your account is not active'
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate token
        const token = generateToken(user._id);

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
});

// ============================================
// POST /api/auth/request-otp
// Request an OTP for email or phone-based login/signup
// ============================================
router.post('/request-otp', async (req, res) => {
    try {
        const { identifier, purpose = 'login' } = req.body;

        if (!identifier) {
            return res.status(400).json({
                success: false,
                message: 'Identifier (email or phone) is required'
            });
        }

        const isEmail = validateEmail(identifier);
        if (!isEmail) {
            // For now we accept any non-empty identifier; phone-level validation
            // can be added here if needed.
        }

        // Generate a 6-digit numeric OTP
        const otpCode = (Math.floor(100000 + Math.random() * 900000)).toString();

        const salt = await bcrypt.genSalt(10);
        const codeHash = await bcrypt.hash(otpCode, salt);

        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        const otpToken = await OtpToken.create({
            identifier,
            purpose,
            codeHash,
            expiresAt
        });

        // TODO: Integrate with SMS / email providers.
        // For now, log to server console for testing.
        console.log(`🔐 OTP for ${identifier}: ${otpCode} (expires in 5 minutes)`);

        return res.json({
            success: true,
            message: 'OTP sent successfully',
            requestId: otpToken._id
        });
    } catch (error) {
        console.error('❌ OTP request error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send OTP'
        });
    }
});

// ============================================
// POST /api/auth/verify-otp
// Verify OTP and indicate whether a key is already set
// ============================================
router.post('/verify-otp', async (req, res) => {
    try {
        const { requestId, otpCode } = req.body;

        if (!requestId || !otpCode) {
            return res.status(400).json({
                success: false,
                message: 'requestId and otpCode are required'
            });
        }

        const otpToken = await OtpToken.findById(requestId);

        if (!otpToken) {
            return res.status(400).json({
                success: false,
                message: 'OTP request not found or expired'
            });
        }

        if (otpToken.expiresAt < new Date()) {
            await otpToken.deleteOne();
            return res.status(400).json({
                success: false,
                message: 'OTP has expired'
            });
        }

        if (otpToken.attempts >= 5) {
            await otpToken.deleteOne();
            return res.status(429).json({
                success: false,
                message: 'Too many invalid attempts. Please request a new OTP.'
            });
        }

        const isMatch = await bcrypt.compare(otpCode, otpToken.codeHash);
        if (!isMatch) {
            otpToken.attempts += 1;
            await otpToken.save();
            return res.status(401).json({
                success: false,
                message: 'Invalid OTP code'
            });
        }

        const identifier = otpToken.identifier;
        await otpToken.deleteOne();

        // For now we treat identifier as email first, then phone
        let user = await User.findOne({ email: identifier });
        if (!user) {
            user = await User.findOne({ phone: identifier });
        }

        if (!user) {
            // Create a minimal placeholder user; they can complete profile later
            const randomPassword = crypto.randomBytes(16).toString('hex');
            const isEmailIdentifier = validateEmail(identifier);
            // Build a guaranteed-valid placeholder email using a hex hash of the identifier
            const placeholderEmail = isEmailIdentifier
                ? identifier
                : `otp_${crypto.createHash('sha1').update(identifier).digest('hex').slice(0, 12)}@placeholder.local`;
            user = await User.create({
                name: 'New User',
                email: placeholderEmail,
                phone: !isEmailIdentifier ? identifier : '0000000',
                password: randomPassword
            });
        }

        const hasKey = !!user.safeKeyHash;

        return res.json({
            success: true,
            message: 'OTP verified',
            user: user.toJSON(),
            hasKey
        });
    } catch (error) {
        console.error('❌ OTP verify error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to verify OTP'
        });
    }
});

// ============================================
// POST /api/auth/set-key
// Set private key for a user after OTP verification
// ============================================
router.post('/set-key', async (req, res) => {
    try {
        const { identifier, key } = req.body;

        if (!identifier || !key) {
            return res.status(400).json({
                success: false,
                message: 'Identifier and key are required'
            });
        }

        let user = await User.findOne({ email: identifier }).select('+safeKeyHash');
        if (!user) {
            user = await User.findOne({ phone: identifier }).select('+safeKeyHash');
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found for identifier'
            });
        }

        const salt = await bcrypt.genSalt(12);
        user.safeKeyHash = await bcrypt.hash(key, salt);
        await user.save();

        const token = generateToken(user._id);

        return res.json({
            success: true,
            message: 'Key set successfully',
            token,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('❌ Set key error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to set key'
        });
    }
});

// ============================================
// POST /api/auth/login-with-key
// Login using identifier + private key
// ============================================
router.post('/login-with-key', async (req, res) => {
    try {
        const { identifier, key } = req.body;

        if (!identifier || !key) {
            return res.status(400).json({
                success: false,
                message: 'Identifier and key are required'
            });
        }

        let user = await User.findOne({ email: identifier }).select('+safeKeyHash');
        if (!user) {
            user = await User.findOne({ phone: identifier }).select('+safeKeyHash');
        }

        if (!user || !user.safeKeyHash) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const isValid = await bcrypt.compare(key, user.safeKeyHash);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const token = generateToken(user._id);

        return res.json({
            success: true,
            message: 'Login successful',
            token,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('❌ Login with key error:', error);
        return res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
});

// ============================================
// POST /api/auth/refresh-token
// Extend current session if token is still valid
// ============================================
router.post('/refresh-token', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const newToken = generateToken(decoded.userId);

        return res.json({
            success: true,
            message: 'Session extended',
            token: newToken
        });
    } catch (error) {
        const isExpired = error.name === 'TokenExpiredError';
        return res.status(401).json({
            success: false,
            message: isExpired ? 'Session expired, please log in again' : 'Invalid token'
        });
    }
});

// ============================================
// POST /api/auth/logout
// ============================================
router.post('/logout', (req, res) => {
    // Token invalidation would typically be handled client-side
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// ============================================
// POST /api/auth/verify-token
// ============================================
router.post('/verify-token', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('❌ Token verification error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
});

module.exports = router;
