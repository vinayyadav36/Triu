// ============================================
// MESSAGES ROUTES — User inbox / messaging
// ============================================
// Stores all messages in server/db/messages.json via jsonDB.
// Messages can be system notifications, order updates, or
// direct messages between users and support/admin.
// ============================================

const express        = require('express');
const router         = express.Router();
const db             = require('../utils/jsonDB');
const { verifyToken } = require('../middleware/auth');

// ── POST /api/messages — send a message ─────────────────────────────────────
router.post('/', verifyToken, (req, res) => {
    try {
        const { toUserId, subject, body, refType, refId } = req.body;
        const fromUserId = req.user.id;

        if (!toUserId || !body) {
            return res.status(400).json({ success: false, message: 'toUserId and body are required' });
        }

        const recipient = db.findById('users', toUserId);
        if (!recipient) {
            return res.status(404).json({ success: false, message: 'Recipient not found' });
        }

        const msg = db.create('messages', {
            fromUserId,
            toUserId,
            subject:  subject  || '',
            body:     String(body).slice(0, 4000),
            refType:  refType  || null, // e.g. 'order', 'product', 'support_ticket'
            refId:    refId    || null,
            readAt:   null,
            deletedBy: [],
        });

        return res.status(201).json({ success: true, message: 'Message sent', data: msg });
    } catch (err) {
        console.error('❌ Send message error:', err);
        return res.status(500).json({ success: false, message: 'Failed to send message' });
    }
});

// ── GET /api/messages/inbox — received messages ──────────────────────────────
router.get('/inbox', verifyToken, (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20, unreadOnly } = req.query;

        let msgs = db.find('messages', m =>
            m.toUserId === userId && !(m.deletedBy || []).includes(userId)
        );

        if (unreadOnly === 'true') {
            msgs = msgs.filter(m => !m.readAt);
        }

        msgs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const parsedPage  = Math.max(1, parseInt(page, 10));
        const parsedLimit = Math.min(100, parseInt(limit, 10) || 20);
        const total       = msgs.length;
        const paged       = msgs.slice((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit);

        return res.json({ success: true, data: paged, total, page: parsedPage, limit: parsedLimit });
    } catch (err) {
        console.error('❌ Inbox error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load inbox' });
    }
});

// ── GET /api/messages/sent — sent messages ───────────────────────────────────
router.get('/sent', verifyToken, (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;

        let msgs = db.find('messages', m =>
            m.fromUserId === userId && !(m.deletedBy || []).includes(userId)
        );
        msgs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const parsedPage  = Math.max(1, parseInt(page, 10));
        const parsedLimit = Math.min(100, parseInt(limit, 10) || 20);
        const total       = msgs.length;
        const paged       = msgs.slice((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit);

        return res.json({ success: true, data: paged, total, page: parsedPage, limit: parsedLimit });
    } catch (err) {
        console.error('❌ Sent error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load sent messages' });
    }
});

// ── GET /api/messages/unread-count ───────────────────────────────────────────
router.get('/unread-count', verifyToken, (req, res) => {
    try {
        const count = db.count('messages', m =>
            m.toUserId === req.user.id && !m.readAt && !(m.deletedBy || []).includes(req.user.id)
        );
        return res.json({ success: true, data: { count } });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to count messages' });
    }
});

// ── GET /api/messages/:id — single message ───────────────────────────────────
router.get('/:id', verifyToken, (req, res) => {
    try {
        const msg = db.findById('messages', req.params.id);
        if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

        const userId = req.user.id;
        if (msg.toUserId !== userId && msg.fromUserId !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Mark as read when recipient opens it
        if (msg.toUserId === userId && !msg.readAt) {
            db.updateById('messages', msg.id, { readAt: new Date().toISOString() });
            msg.readAt = new Date().toISOString();
        }

        return res.json({ success: true, data: msg });
    } catch (err) {
        console.error('❌ Get message error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load message' });
    }
});

// ── PUT /api/messages/:id/read — mark as read ────────────────────────────────
router.put('/:id/read', verifyToken, (req, res) => {
    try {
        const msg = db.findById('messages', req.params.id);
        if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
        if (msg.toUserId !== req.user.id) return res.status(403).json({ success: false, message: 'Access denied' });

        const updated = db.updateById('messages', msg.id, { readAt: new Date().toISOString() });
        return res.json({ success: true, data: updated });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to mark as read' });
    }
});

// ── DELETE /api/messages/:id — soft-delete for the requesting user ───────────
router.delete('/:id', verifyToken, (req, res) => {
    try {
        const msg = db.findById('messages', req.params.id);
        if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

        const userId = req.user.id;
        if (msg.toUserId !== userId && msg.fromUserId !== userId) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const deletedBy = [...new Set([...(msg.deletedBy || []), userId])];
        db.updateById('messages', msg.id, { deletedBy });
        return res.json({ success: true, message: 'Message deleted' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to delete message' });
    }
});

// ── POST /api/messages/system — send system/admin notification ───────────────
router.post('/system', verifyToken, (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const { toUserId, subject, body, refType, refId } = req.body;
        if (!toUserId || !body) {
            return res.status(400).json({ success: false, message: 'toUserId and body are required' });
        }

        const msg = db.create('messages', {
            fromUserId: 'system',
            toUserId,
            subject:  subject || 'System Notification',
            body:     String(body).slice(0, 4000),
            refType:  refType || null,
            refId:    refId   || null,
            readAt:   null,
            deletedBy: [],
        });

        return res.status(201).json({ success: true, message: 'System message sent', data: msg });
    } catch (err) {
        console.error('❌ System message error:', err);
        return res.status(500).json({ success: false, message: 'Failed to send system message' });
    }
});

module.exports = router;
