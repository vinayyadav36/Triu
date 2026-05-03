'use strict';

// ============================================
// SEARCH ROUTES — Full-text search over JSON DB
// POST /api/search/concierge
// ============================================

const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');
const db        = require('../utils/jsonDB');

const conciergeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { success: false, message: 'Too many search requests, please try again shortly' },
});

/**
 * POST /api/search/concierge
 * Body: { query: string, limit?: number, boostCategory?: string }
 *
 * Performs case-insensitive full-text search across product name, description,
 * and category fields stored in the JSON database.
 */
router.post('/concierge', conciergeLimiter, (req, res) => {
    try {
        const { query, limit = 10, boostCategory } = req.body;

        if (!query || typeof query !== 'string' || !query.trim()) {
            return res.status(400).json({ success: false, message: 'query is required' });
        }

        const parsedLimit = Math.min(20, Math.max(1, parseInt(limit, 10) || 10));
        const cleanQuery  = query.trim().toLowerCase().slice(0, 500);
        const terms       = cleanQuery.split(/\s+/).filter(Boolean);

        // Score each active product by how many query terms it matches
        let products = db.find('products', p => p.status === 'active');

        const scored = products.map(p => {
            const haystack = [
                p.name        || '',
                p.description || '',
                p.category    || '',
            ].join(' ').toLowerCase();

            const matchCount = terms.filter(t => haystack.includes(t)).length;
            const score = matchCount / terms.length;
            return { ...p, _score: score };
        }).filter(p => p._score > 0);

        // Sort by score descending; boost preferred category
        scored.sort((a, b) => {
            const aBoost = boostCategory && a.category === boostCategory ? 0.1 : 0;
            const bBoost = boostCategory && b.category === boostCategory ? 0.1 : 0;
            return (b._score + bBoost) - (a._score + aBoost);
        });

        const results = scored.slice(0, parsedLimit).map(({ _score, ...p }) => p);

        return res.json({ success: true, data: results, mode: 'json-text' });
    } catch (err) {
        console.error('❌ Search error:', err);
        return res.status(500).json({ success: false, message: 'Search failed' });
    }
});

module.exports = router;
