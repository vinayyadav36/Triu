'use strict';

// ============================================
// SITEMAP ROUTE — Dynamic XML sitemap
// GET /sitemap.xml
// ============================================

const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');
const db        = require('../utils/jsonDB');

const sitemapLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,                   // max 20 requests per IP per hour (bots/crawlers)
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many sitemap requests',
});

function xmlEscape(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

router.get('/', sitemapLimiter, (req, res) => {
    try {
        const BASE = (process.env.CLIENT_URL || 'https://emporiumvipani.com').replace(/\/$/, '');

        const staticUrls = [
            { loc: BASE,              changefreq: 'daily',   priority: '1.0' },
            { loc: `${BASE}/#products`, changefreq: 'daily',   priority: '0.9' },
            { loc: `${BASE}/#about`,    changefreq: 'monthly', priority: '0.5' },
            { loc: `${BASE}/legal/privacy.html`, changefreq: 'monthly', priority: '0.3' },
            { loc: `${BASE}/legal/terms.html`,   changefreq: 'monthly', priority: '0.3' },
        ];

        const products = db.find('products', p => p.status === 'active').slice(0, 50000);

        const productUrls = products.map(p => ({
            loc:        `${BASE}/#product-${p.id}`,
            changefreq: 'weekly',
            priority:   '0.8',
            lastmod:    p.updatedAt ? new Date(p.updatedAt).toISOString().split('T')[0] : undefined,
        }));

        const allUrls = [...staticUrls, ...productUrls];

        const urlBlock = allUrls.map(u => {
            const lastmod = u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : '';
            return `  <url>
    <loc>${xmlEscape(u.loc)}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${lastmod}
  </url>`;
        }).join('\n');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlBlock}
</urlset>`;

        res.setHeader('Content-Type', 'application/xml; charset=UTF-8');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(xml);

    } catch (err) {
        console.error('❌ Sitemap error:', err);
        res.setHeader('Content-Type', 'application/xml; charset=UTF-8');
        res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
});

module.exports = router;
