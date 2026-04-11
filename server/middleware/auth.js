const jwt = require('jsonwebtoken');
const db  = require('../utils/jsonDB');

const verifyToken = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
        const user    = db.findById('users', decoded.userId);

        if (!user) return res.status(401).json({ success: false, message: 'User not found' });
        if (user.status !== 'active') return res.status(403).json({ success: false, message: 'Account not active' });

        req.user = { id: user.id, role: user.role, seller: user.seller };
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
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

module.exports = { verifyToken, verifyAdmin, verifySeller };
