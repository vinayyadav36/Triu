'use strict';

// ============================================
// SEARCH ROUTES — AI Concierge (Vector Search)
// POST /api/search/concierge
// ============================================

const express = require('express');
const router  = express.Router();
const Product = require('../models/Product');
const { getVector } = require('../utils/embeddings');

/**
 * POST /api/search/concierge
 * Body: { query: string, limit?: number, boostCategory?: string }
 *
 * 1. Converts the natural-language query to a vector via OpenAI.
 * 2. Runs $vectorSearch on MongoDB Atlas (requires "vector_index").
 * 3. Falls back to full-text / regex search when embeddings are unavailable.
 */
router.post('/concierge', async (req, res) => {
    try {
        const { query, limit = 10, boostCategory } = req.body;

        if (!query || typeof query !== 'string' || !query.trim()) {
            return res.status(400).json({ success: false, message: 'query is required' });
        }

        const parsedLimit = Math.min(20, Math.max(1, parseInt(limit, 10) || 10));
        const cleanQuery  = query.trim().slice(0, 500);

        // ── Try vector search ─────────────────────────────────────────────
        const queryVector = await getVector(cleanQuery);

        if (queryVector) {
            const pipeline = [
                {
                    $vectorSearch: {
                        index:       'vector_index',
                        path:        'embedding',
                        queryVector,
                        numCandidates: parsedLimit * 10,
                        limit:       parsedLimit * 2, // fetch extra, re-rank below
                        filter:      { status: 'active' },
                    },
                },
                {
                    $project: {
                        name: 1, description: 1, price: 1, category: 1,
                        thumbnail: 1, stock: 1, rating: 1, sales: 1,
                        sellerId: 1, hsnCode: 1, countryOfOrigin: 1,
                        score: { $meta: 'vectorSearchScore' },
                    },
                },
            ];

            let results = await Product.aggregate(pipeline);

            // Boost preferred category to the top (hyper-personalisation)
            if (boostCategory) {
                results.sort((a, b) => {
                    const aBoost = a.category === boostCategory ? 0.1 : 0;
                    const bBoost = b.category === boostCategory ? 0.1 : 0;
                    return (b.score + bBoost) - (a.score + aBoost);
                });
            }

            return res.json({
                success: true,
                data:    results.slice(0, parsedLimit),
                mode:    'vector',
            });
        }

        // ── Fallback: MongoDB $text search ───────────────────────────────
        // Requires a text index on { name: 'text', description: 'text', category: 'text' }.
        // Using $text avoids $regex injection vectors (CodeQL js/sql-injection).
        const filter = {
            status: 'active',
            $text: { $search: cleanQuery },
        };

        let results = await Product
            .find(filter)
            .select('name description price category thumbnail stock rating sales sellerId hsnCode countryOfOrigin')
            .limit(parsedLimit * 2)
            .lean();

        if (boostCategory) {
            results.sort((a, b) => (a.category === boostCategory ? -1 : 1));
        }

        res.json({ success: true, data: results.slice(0, parsedLimit), mode: 'text' });

    } catch (err) {
        console.error('❌ AI search error:', err);
        res.status(500).json({ success: false, message: 'Search failed' });
    }
});

module.exports = router;
