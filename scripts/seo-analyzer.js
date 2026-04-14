#!/usr/bin/env node
/**
 * seo-analyzer.js
 * Analyzes an HTML file for SEO signals and outputs a traffic-light JSON report.
 *
 * Usage:  node scripts/seo-analyzer.js [path/to/file.html]
 *         node scripts/seo-analyzer.js --output report.json
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const fileArg = args.find(a => !a.startsWith('--'));
const outArg  = args.find((a, i) => args[i-1] === '--output');

// ─── Find HTML file ───────────────────────────────────────────────────────────
const candidates = [
    fileArg,
    'dist/index.html',
    'public/index.html',
    'src/index.html',
    'index.html',
].filter(Boolean);

let htmlPath = null;
let html     = '';
for (const c of candidates) {
    const full = path.resolve(process.cwd(), c);
    if (fs.existsSync(full)) {
        htmlPath = full;
        html     = fs.readFileSync(full, 'utf8');
        break;
    }
}
if (!html) {
    console.error('❌  No HTML file found. Provide a path or ensure dist/index.html exists.');
    process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extract(re, src) { const m = src.match(re); return m ? m[1] || m[0] : null; }
function extractAll(re, src) { return [...(src.matchAll(re))].map(m => m[0]); }
function countWords(str) { return str.trim().split(/\s+/).filter(Boolean).length; }
function trafficLight(ok, warn, fail) { return ok ? 'green' : warn ? 'yellow' : 'red'; }

// ─── Check functions ──────────────────────────────────────────────────────────
function checkTitle(html) {
    const title = extract(/<title[^>]*>([^<]*)<\/title>/i, html);
    if (!title) return { check: 'title', status: 'red',    value: null, message: 'Missing <title> tag' };
    const len   = title.trim().length;
    return {
        check:   'title',
        value:   title.trim(),
        length:  len,
        status:  trafficLight(len >= 30 && len <= 60, len > 0, false),
        message: len < 30 ? `Title too short (${len} chars; aim 30–60)`
                : len > 60 ? `Title too long (${len} chars; aim 30–60)`
                : `Title length OK (${len} chars)`,
    };
}

function checkMetaDescription(html) {
    const m = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
           || html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i);
    const desc = m ? m[1] : null;
    if (!desc) return { check: 'meta_description', status: 'red', value: null, message: 'Missing meta description' };
    const len = desc.trim().length;
    return {
        check:   'meta_description',
        value:   desc.trim().slice(0, 80) + (desc.length > 80 ? '...' : ''),
        length:  len,
        status:  trafficLight(len >= 120 && len <= 160, len >= 50, false),
        message: len < 120 ? `Description short (${len} chars; aim 120–160)`
                : len > 160 ? `Description long (${len} chars; aim 120–160)`
                : `Description OK (${len} chars)`,
    };
}

function checkHeadings(html) {
    const h1s = extractAll(/<h1[^>]*>[^<]*<\/h1>/gi, html);
    const h2s = extractAll(/<h2[^>]*>[^<]*<\/h2>/gi, html);
    const h3s = extractAll(/<h3[^>]*>[^<]*<\/h3>/gi, html);
    const ok  = h1s.length === 1 && h2s.length >= 2;
    return {
        check:   'headings',
        h1_count: h1s.length,
        h2_count: h2s.length,
        h3_count: h3s.length,
        h1_text:  h1s.map(h => h.replace(/<[^>]+>/g, '').trim()).slice(0, 3),
        status:  trafficLight(ok, h1s.length > 0, false),
        message: h1s.length === 0 ? 'No H1 found — critical SEO issue'
                : h1s.length > 1  ? `Multiple H1 tags (${h1s.length}) — use exactly one`
                : h2s.length < 2  ? `Only ${h2s.length} H2 tag(s) — add more structure`
                : `Heading structure OK (H1:${h1s.length} H2:${h2s.length} H3:${h3s.length})`,
    };
}

function checkImageAltTags(html) {
    const allImgs    = extractAll(/<img[^>]+>/gi, html);
    const withoutAlt = allImgs.filter(img => !/alt\s*=\s*["'][^"']+["']/i.test(img));
    const total      = allImgs.length;
    const missing    = withoutAlt.length;
    return {
        check:        'image_alt_tags',
        total_images: total,
        missing_alt:  missing,
        status:       trafficLight(missing === 0, missing <= 2, false),
        message:      total === 0 ? 'No images found'
                    : missing === 0 ? `All ${total} images have alt text ✓`
                    : `${missing}/${total} images missing alt text`,
    };
}

function checkCanonical(html) {
    const m   = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i)
             || html.match(/<link\s+href=["']([^"']*)["']\s+rel=["']canonical["']/i);
    const url = m ? m[1] : null;
    return {
        check:   'canonical',
        value:   url,
        status:  url ? 'green' : 'yellow',
        message: url ? `Canonical URL: ${url}` : 'No canonical URL — recommended for deduplication',
    };
}

function checkOgTags(html) {
    const ogTags   = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'];
    const found    = {};
    const missing  = [];
    for (const tag of ogTags) {
        const m = html.match(new RegExp(`<meta\\s+property=["']${tag}["']\\s+content=["']([^"']*)["']`, 'i'))
               || html.match(new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+property=["']${tag}["']`, 'i'));
        if (m) found[tag] = m[1];
        else missing.push(tag);
    }
    return {
        check:       'og_tags',
        found:       Object.keys(found),
        missing:     missing,
        status:      trafficLight(missing.length === 0, missing.length <= 2, false),
        message:     missing.length === 0 ? 'All Open Graph tags present ✓'
                   : `Missing OG tags: ${missing.join(', ')}`,
    };
}

function checkKeywordDensity(html) {
    const bodyText = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                         .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                         .replace(/<[^>]+>/g, ' ')
                         .toLowerCase();
    const words    = bodyText.split(/\s+/).filter(w => w.length > 4);
    const total    = words.length || 1;
    const freqMap  = {};
    for (const w of words) freqMap[w] = (freqMap[w] || 0) + 1;
    const topWords = Object.entries(freqMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([word, count]) => ({ word, count, density_pct: parseFloat((count / total * 100).toFixed(2)) }));

    const stuffed = topWords.some(w => w.density_pct > 5);
    return {
        check:      'keyword_density',
        word_count: total,
        top_keywords: topWords,
        status:     trafficLight(!stuffed && total > 100, total > 50, false),
        message:    stuffed ? 'Potential keyword stuffing detected (density > 5%)'
                  : total < 100 ? `Low word count (${total}) — aim for 300+ words`
                  : `Word count and density OK (${total} words)`,
    };
}

function checkTwitterCard(html) {
    const m = html.match(/<meta\s+name=["']twitter:card["']/i);
    return {
        check:   'twitter_card',
        status:  m ? 'green' : 'yellow',
        message: m ? 'Twitter Card meta tag present ✓' : 'Missing twitter:card meta tag',
    };
}

function checkViewport(html) {
    const m = html.match(/<meta\s+name=["']viewport["']/i);
    return {
        check:   'viewport',
        status:  m ? 'green' : 'red',
        message: m ? 'Viewport meta tag present ✓' : 'Missing viewport meta tag — mobile SEO critical',
    };
}

function checkStructuredData(html) {
    const hasLdJson = /<script\s+type=["']application\/ld\+json["']/i.test(html);
    return {
        check:   'structured_data',
        status:  hasLdJson ? 'green' : 'yellow',
        message: hasLdJson ? 'JSON-LD structured data found ✓' : 'No JSON-LD structured data — consider adding Schema.org markup',
    };
}

// ─── Run all checks ───────────────────────────────────────────────────────────
const checks = [
    checkTitle(html),
    checkMetaDescription(html),
    checkHeadings(html),
    checkImageAltTags(html),
    checkCanonical(html),
    checkOgTags(html),
    checkKeywordDensity(html),
    checkTwitterCard(html),
    checkViewport(html),
    checkStructuredData(html),
];

const score = {
    green:  checks.filter(c => c.status === 'green').length,
    yellow: checks.filter(c => c.status === 'yellow').length,
    red:    checks.filter(c => c.status === 'red').length,
    total:  checks.length,
};
score.percent = Math.round((score.green + score.yellow * 0.5) / score.total * 100);

const report = {
    generated_at: new Date().toISOString(),
    file_analyzed: htmlPath,
    seo_score:    score,
    checks,
    summary: {
        grade: score.percent >= 85 ? 'A' : score.percent >= 70 ? 'B' : score.percent >= 50 ? 'C' : 'F',
        critical_issues: checks.filter(c => c.status === 'red').map(c => c.message),
        warnings:        checks.filter(c => c.status === 'yellow').map(c => c.message),
    },
};

// ─── Console output ───────────────────────────────────────────────────────────
const ICONS = { green: '✅', yellow: '⚠️ ', red: '❌' };
console.log(`\n${'═'.repeat(60)}`);
console.log('  SEO ANALYZER — EMPROIUM VIPANI');
console.log(`  File: ${path.relative(process.cwd(), htmlPath)}`);
console.log(`${'═'.repeat(60)}`);
for (const c of checks) {
    console.log(`  ${ICONS[c.status]}  ${c.message}`);
}
console.log(`${'─'.repeat(60)}`);
const gradeColor = score.percent >= 85 ? '\x1b[32m' : score.percent >= 50 ? '\x1b[33m' : '\x1b[31m';
console.log(`  SEO Score: ${gradeColor}${score.percent}% (Grade ${report.summary.grade})\x1b[0m  `
          + `✅ ${score.green}  ⚠️  ${score.yellow}  ❌ ${score.red}`);
console.log(`${'═'.repeat(60)}\n`);

// ─── Save report ──────────────────────────────────────────────────────────────
const outPath = outArg || 'data/seo_report.json';
const outDir  = path.dirname(path.resolve(outPath));
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log(`  Report saved → ${outPath}\n`);
