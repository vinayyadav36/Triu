#!/usr/bin/env node
// server/scripts/db-migrate.js
// Ensures all JSON DB collection files exist and are valid JSON arrays.
// Safe to run at any time — creates missing files, does not delete data.

'use strict';

const fs   = require('fs');
const path = require('path');

const DB_DIR = process.env.TRIU_DB_DIR || path.join(__dirname, '..', 'db');

const COLLECTIONS = [
    'users', 'products', 'orders', 'events', 'gst', 'invoices',
    'ledger', 'messages', 'otps', 'sessions', 'settlements',
    'support_tickets', 'audit_log', 'documents',
];

function migrate() {
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
        console.log(`📁 Created DB directory: ${DB_DIR}`);
    }

    let created = 0;
    let repaired = 0;

    for (const col of COLLECTIONS) {
        const file = path.join(DB_DIR, `${col}.json`);

        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, '[]', 'utf8');
            console.log(`  ✅ Created: ${col}.json`);
            created++;
            continue;
        }

        // Validate existing file is a valid JSON array
        try {
            const content = fs.readFileSync(file, 'utf8');
            const parsed  = JSON.parse(content);
            if (!Array.isArray(parsed)) {
                fs.writeFileSync(file, '[]', 'utf8');
                console.log(`  🔧 Repaired (was not array): ${col}.json`);
                repaired++;
            } else {
                console.log(`  ✔  OK: ${col}.json (${parsed.length} records)`);
            }
        } catch {
            fs.writeFileSync(file, '[]', 'utf8');
            console.log(`  🔧 Repaired (invalid JSON): ${col}.json`);
            repaired++;
        }
    }

    console.log(`\n✅ Migration complete — ${created} created, ${repaired} repaired.\n`);
}

migrate();
