const express = require('express');
const router = express.Router();
const db = require('../utils/jsonDB');

const jwt = require('jsonwebtoken');
const JWT_ACCESS_SECRET = process.env.JWT_SECRET || 'dev-access-secret-change-in-prod';
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
            req.user = db.findById('users', decoded.userId);
        } catch(e) {}
    }
    next();
};

router.use(optionalAuth);

router.get('/', (req, res) => {
    try {
        const userId = req.user ? req.user.id : (req.headers['x-guest-id'] || req.query.guestId || 'guest');
        const cartItems = db.find('cartItems', c => c.userId === userId);
        return res.json({ success: true, data: cartItems });
    } catch(err) {
        return res.status(500).json({ success: false, message: 'Failed to fetch cart' });
    }
});

router.post('/', (req, res) => {
    try {
        const { productId, quantity } = req.body;
        const userId = req.user ? req.user.id : (req.headers['x-guest-id'] || req.body.guestId || 'guest');

        let cartItem = db.find('cartItems', c => c.userId === userId && c.productId === productId)[0];
        if (cartItem) {
            db.updateById('cartItems', cartItem.id, { quantity: cartItem.quantity + quantity });
        } else {
            db.create('cartItems', { userId, productId, quantity });
        }

        const updatedCart = db.find('cartItems', c => c.userId === userId);
        return res.json({ success: true, data: updatedCart });
    } catch(err) {
        return res.status(500).json({ success: false, message: 'Failed to add to cart' });
    }
});

router.delete('/:productId', (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.user ? req.user.id : (req.headers['x-guest-id'] || req.query.guestId || 'guest');

        const cartItem = db.find('cartItems', c => c.userId === userId && c.productId === productId)[0];
        if (cartItem) {
            db.deleteById('cartItems', cartItem.id);
        }

        const updatedCart = db.find('cartItems', c => c.userId === userId);
        return res.json({ success: true, data: updatedCart });
    } catch(err) {
        return res.status(500).json({ success: false, message: 'Failed to remove from cart' });
    }
});

module.exports = router;
