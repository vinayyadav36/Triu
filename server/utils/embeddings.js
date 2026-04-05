'use strict';

// ============================================
// EMBEDDINGS UTILITY — OpenAI text-embedding-3-small
// Falls back gracefully when OPENAI_API_KEY is not configured.
// ============================================

let _openai = null;

function _getClient() {
    if (_openai) return _openai;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    try {
        const { OpenAI } = require('openai');
        _openai = new OpenAI({ apiKey });
    } catch (e) {
        console.warn('[embeddings] openai package not installed – skipping vector generation');
        return null;
    }
    return _openai;
}

/**
 * Convert text to a 1536-dimension embedding vector.
 * Returns null when OpenAI is unavailable (key missing / package not installed).
 * @param {string} text
 * @returns {Promise<number[]|null>}
 */
async function getVector(text) {
    const client = _getClient();
    if (!client) return null;
    const sanitized = String(text || '').replace(/\n/g, ' ').trim().slice(0, 8192);
    if (!sanitized) return null;
    try {
        const response = await client.embeddings.create({
            model: 'text-embedding-3-small',
            input: sanitized,
        });
        return response.data[0].embedding;
    } catch (err) {
        console.error('[embeddings] getVector failed:', err.message);
        return null;
    }
}

module.exports = { getVector };
