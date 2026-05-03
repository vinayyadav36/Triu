#!/usr/bin/env node
// server/scripts/db-reset.js
// Clears all JSON DB collection files and re-runs the seed script.
// USE WITH CAUTION — all data will be lost.

'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DB_DIR = process.env.TRIU_DB_DIR || path.join(__dirname, '..', 'db');

const COLLECTIONS = [
    'users', 'products', 'orders', 'events', 'gst', 'invoices',
    'ledger', 'messages', 'otps', 'sessions', 'settlements',
    'support_tickets', 'audit_log', 'documents',
];

function reset() {
    if (!fs.existsSync(DB_DIR)) {
        console.log(`ℹ️  DB directory not found: ${DB_DIR}`);
        fs.mkdirSync(DB_DIR, { recursive: true });
    }

    for (const col of COLLECTIONS) {
        const file = path.join(DB_DIR, `${col}.json`);
        fs.writeFileSync(file, '[]', 'utf8');
        console.log(`  🗑️  Cleared: ${col}.json`);
    }

    console.log(`\n✅ Cleared ${COLLECTIONS.length} collection(s).\n`);
    console.log('🌱 Re-running seed script...\n');

    const result = spawnSync(process.execPath, [path.join(__dirname, 'db-seed.js')], {
        stdio: 'inherit',
        env:   { ...process.env, TRIU_DB_DIR: DB_DIR },
    });

    if (result.status !== 0) {
        console.error('❌ Seed script exited with code', result.status);
        process.exit(result.status || 1);
    }
}

reset();
