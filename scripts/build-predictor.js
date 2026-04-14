#!/usr/bin/env node
/**
 * build-predictor.js
 * Reads recent git commit messages, scores each for risk factors,
 * and predicts build-failure probability.
 *
 * Usage:  node scripts/build-predictor.js [--commits 20] [--output report.json]
 */
'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const nCommits    = parseInt(args.find(a => /^\d+$/.test(a)) || '20', 10);
const outArg      = args.find((a, i) => args[i-1] === '--output');
const outPath     = outArg || 'data/build_risk_report.json';

// ─── Risk rules ───────────────────────────────────────────────────────────────
const RISK_RULES = [
    { pattern: /\bwip\b/i,           weight: 25, label: 'WIP commit',              advice: 'Merge WIP commit before CI' },
    { pattern: /\bhack\b/i,          weight: 30, label: 'Hack/workaround',         advice: 'Review hack before deploying' },
    { pattern: /\btodo\b/i,          weight: 15, label: 'TODO left in message',    advice: 'Resolve TODO items' },
    { pattern: /\bfixme\b/i,         weight: 20, label: 'FIXME marker',            advice: 'Address FIXME before merge' },
    { pattern: /\btest(?:ing)?\b/i,  weight: -10, label: 'Contains tests',         advice: 'Tests reduce risk ✓' },
    { pattern: /\bfix(?:ed)?\b/i,    weight: 10,  label: 'Bug fix (verify tests)', advice: 'Ensure fix is tested' },
    { pattern: /\brefactor\b/i,      weight: 12,  label: 'Refactor',               advice: 'Refactors need regression tests' },
    { pattern: /\bmerge\b/i,         weight: 8,   label: 'Merge commit',           advice: 'Verify no conflict regressions' },
    { pattern: /\bhotfix\b/i,        weight: 35,  label: 'Hotfix',                 advice: 'Hotfixes are high-risk — test thoroughly' },
    { pattern: /\bbreaking\b/i,      weight: 40,  label: 'Breaking change',        advice: 'Breaking changes require version bump' },
    { pattern: /\bupdate dep/i,      weight: 15,  label: 'Dependency update',      advice: 'Dependency updates can introduce regressions' },
    { pattern: /\breadme|docs?\b/i,  weight: -15, label: 'Docs-only',              advice: 'Documentation changes are low risk ✓' },
    { pattern: /\bchore\b/i,         weight: 5,   label: 'Chore',                  advice: 'Low risk routine change' },
    { pattern: /^.{1,10}$/,          weight: 20,  label: 'Very short message',     advice: 'Short commit messages suggest hasty commits' },
];

// ─── Get git log ──────────────────────────────────────────────────────────────
let logLines = [];
try {
    const raw = execSync(
        `git --no-pager log --pretty=format:"%H|||%s|||%an|||%ad|||%D" --date=short -${nCommits}`,
        { cwd: process.cwd(), encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }
    );
    logLines = raw.trim().split('\n').filter(Boolean);
} catch (err) {
    console.error('❌  Could not read git log:', err.message);
    process.exit(1);
}

// ─── Get diff stats (lines changed) ──────────────────────────────────────────
function getDiffStats(sha) {
    try {
        const out = execSync(
            `git --no-pager diff --shortstat ${sha}^..${sha} 2>/dev/null || echo "0"`,
            { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }
        );
        const ins = parseInt((out.match(/(\d+) insertion/) || [0,0])[1], 10);
        const del = parseInt((out.match(/(\d+) deletion/)  || [0,0])[1], 10);
        const files = parseInt((out.match(/(\d+) file/)    || [0,0])[1], 10);
        return { insertions: ins, deletions: del, files_changed: files, total_lines: ins + del };
    } catch { return { insertions: 0, deletions: 0, files_changed: 0, total_lines: 0 }; }
}

// ─── Score a commit ───────────────────────────────────────────────────────────
function scoreCommit(sha, subject, diffStats) {
    let risk = 0;
    const triggers = [];

    for (const rule of RISK_RULES) {
        if (rule.pattern.test(subject)) {
            risk += rule.weight;
            if (rule.weight > 0) triggers.push({ rule: rule.label, weight: rule.weight, advice: rule.advice });
            else triggers.push({ rule: rule.label, weight: rule.weight, advice: rule.advice });
        }
    }

    // Large diff penalty
    if (diffStats.total_lines > 500) {
        const penalty = Math.min(40, Math.floor(diffStats.total_lines / 50));
        risk += penalty;
        triggers.push({ rule: `Large diff (${diffStats.total_lines} lines)`, weight: penalty, advice: 'Large diffs are harder to review' });
    }

    // Many files changed
    if (diffStats.files_changed > 20) {
        risk += 15;
        triggers.push({ rule: `Many files (${diffStats.files_changed})`, weight: 15, advice: 'Too many files changed at once increases risk' });
    }

    // Clamp 0–100
    risk = Math.max(0, Math.min(100, risk));
    return { risk, triggers };
}

// ─── Analyse commits ──────────────────────────────────────────────────────────
const analysed = [];
for (const line of logLines) {
    const [sha, subject, author, date, refs] = line.split('|||');
    if (!sha) continue;
    const diffStats = getDiffStats(sha.trim());
    const { risk, triggers } = scoreCommit(sha.trim(), subject || '', diffStats);
    analysed.push({
        sha:         sha.trim().slice(0, 10),
        subject:     (subject || '').trim(),
        author:      (author  || '').trim(),
        date:        (date    || '').trim(),
        refs:        (refs    || '').trim(),
        diff_stats:  diffStats,
        risk_score:  risk,
        risk_level:  risk >= 60 ? 'HIGH' : risk >= 30 ? 'MEDIUM' : 'LOW',
        triggers,
    });
}

// ─── Aggregate risk prediction ────────────────────────────────────────────────
const avgRisk    = analysed.length ? analysed.reduce((s, c) => s + c.risk_score, 0) / analysed.length : 0;
const highRisk   = analysed.filter(c => c.risk_level === 'HIGH');
const recentRisk = analysed.slice(0, 5).reduce((s, c) => s + c.risk_score, 0) / Math.min(5, analysed.length);

// Weight recent commits more heavily
const buildFailurePct = Math.round(Math.min(95, recentRisk * 0.6 + avgRisk * 0.4));

const verdict = buildFailurePct >= 60 ? '🔴 HIGH RISK  — investigate before deploying'
              : buildFailurePct >= 30 ? '🟡 MEDIUM RISK — review flagged commits'
              : '🟢 LOW RISK   — build looks stable';

const report = {
    generated_at:        new Date().toISOString(),
    commits_analyzed:    analysed.length,
    build_failure_pct:   buildFailurePct,
    verdict,
    avg_risk_score:      Math.round(avgRisk),
    recent_5_risk:       Math.round(recentRisk),
    high_risk_commits:   highRisk.length,
    commits:             analysed,
    recommendations:     [
        highRisk.length > 0  ? `Review ${highRisk.length} high-risk commit(s) before merging to main.` : null,
        buildFailurePct > 40 ? 'Run full test suite before deploying.' : null,
        analysed.some(c => c.triggers.some(t => t.rule.includes('WIP')))
            ? 'Squash WIP commits before tagging a release.' : null,
        analysed.some(c => c.diff_stats.total_lines > 500)
            ? 'Break large commits into smaller atomic PRs.' : null,
        'Set up branch protection rules to enforce CI passing before merge.',
    ].filter(Boolean),
};

// ─── Console output ───────────────────────────────────────────────────────────
const riskColor = buildFailurePct >= 60 ? '\x1b[31m' : buildFailurePct >= 30 ? '\x1b[33m' : '\x1b[32m';
console.log(`\n${'═'.repeat(60)}`);
console.log('  BUILD PREDICTOR — EMPROIUM VIPANI');
console.log(`${'═'.repeat(60)}`);
console.log(`  Commits analyzed  : ${analysed.length}`);
console.log(`  Avg risk score    : ${Math.round(avgRisk)}/100`);
console.log(`  Recent 5 risk     : ${Math.round(recentRisk)}/100`);
console.log(`  High-risk commits : ${highRisk.length}`);
console.log(`\n  Build Failure Risk: ${riskColor}${buildFailurePct}%\x1b[0m`);
console.log(`  Verdict: ${verdict}`);
console.log(`\n  Top risky commits:`);
for (const c of analysed.slice(0, 5)) {
    const icon = c.risk_level === 'HIGH' ? '🔴' : c.risk_level === 'MEDIUM' ? '🟡' : '🟢';
    console.log(`    ${icon} [${c.sha}] ${c.subject.slice(0, 45).padEnd(45)} ${String(c.risk_score).padStart(3)}%`);
}
if (report.recommendations.length) {
    console.log('\n  Recommendations:');
    for (const r of report.recommendations) console.log(`    ➤  ${r}`);
}
console.log(`${'═'.repeat(60)}\n`);

// ─── Save report ──────────────────────────────────────────────────────────────
const outDir = path.dirname(path.resolve(outPath));
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log(`  Report saved → ${outPath}\n`);
