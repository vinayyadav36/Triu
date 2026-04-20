// ============================================
// USERS ROUTES
// ============================================
const express   = require('express');
const router    = express.Router();
const bcrypt    = require('bcryptjs');
const db        = require('../utils/jsonDB');
const { verifyToken } = require('../middleware/auth');

function safeUser(user) {
    const safe = { ...user };
    delete safe.passwordHash;
    return safe;
}

// GET /api/users/profile
router.get('/profile', verifyToken, (req, res) => {
    try {
        const user = db.findById('users', req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        return res.json({ success: true, data: safeUser(user) });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to load profile' });
    }
});

// PUT /api/users/profile
router.put('/profile', verifyToken, (req, res) => {
    try {
        const { name, phone, address } = req.body;
        const updates = {};
        if (name)    updates.name    = name.trim();
        if (phone)   updates.phone   = phone.trim();
        if (address) updates.address = address;

        const updated = db.updateById('users', req.user.id, updates);
        if (!updated) return res.status(404).json({ success: false, message: 'User not found' });
        return res.json({ success: true, message: 'Profile updated', data: safeUser(updated) });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
});

// PUT /api/users/password
router.put('/password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Both current and new password are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        const user = db.findById('users', req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

        const passwordHash = await bcrypt.hash(newPassword, 10);
        db.updateById('users', req.user.id, { passwordHash });
        return res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to change password' });
    }
});

// GET /api/users/wishlist
router.get('/wishlist', verifyToken, (req, res) => {
    try {
        const user = db.findById('users', req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const wishlist = (user.wishlist || []).map(productId => db.findById('products', productId)).filter(Boolean);
        return res.json({ success: true, data: wishlist });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to load wishlist' });
    }
});

// POST /api/users/wishlist/:productId — toggle
router.post('/wishlist/:productId', verifyToken, (req, res) => {
    try {
        const user = db.findById('users', req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const productId = req.params.productId;
        const product   = db.findById('products', productId);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        let wishlist = user.wishlist || [];
        let action;
        if (wishlist.includes(productId)) {
            wishlist = wishlist.filter(id => id !== productId);
            action   = 'removed';
        } else {
            wishlist.push(productId);
            action = 'added';
        }

        db.updateById('users', req.user.id, { wishlist });
        return res.json({ success: true, message: `Product ${action} from wishlist`, data: { wishlist, action } });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to update wishlist' });
    }
});

// GET /api/users/orders
router.get('/orders', verifyToken, (req, res) => {
    try {
        const orders = db.find('orders', o => o.userId === req.user.id);
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return res.json({ success: true, data: orders });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to load orders' });
    }
});

module.exports = router;
