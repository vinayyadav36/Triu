// =============================================================
// EmporiumVipani — scripts/data-manager.js
// Lightweight JSON-file CRUD with advisory locking (no dependencies)
// Use: const dm = require('./data-manager'); dm.read('leads')
// =============================================================
'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_DIR   = path.join(__dirname, '..', 'db');
const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure db/ exists
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ── Advisory file-level locks ─────────────────────────────────
const _locks = new Map();
async function withLock(name, fn) {
    while (_locks.get(name)) await new Promise(r => setTimeout(r, 10));
    _locks.set(name, true);
    try   { return await fn(); }
    finally { _locks.delete(name); }
}

// ── Resolve file path (db/ preferred, data/ fallback) ─────────
function resolvePath(collection) {
    const primary = path.join(DB_DIR,   `${collection}.json`);
    const fallback= path.join(DATA_DIR, `${collection}.json`);
    if (fs.existsSync(primary))                            return primary;
    if (fs.existsSync(fallback))                           return fallback;
    // Default: create in db/
    fs.writeFileSync(primary, '[]', 'utf8');
    return primary;
}

// ── Core helpers ──────────────────────────────────────────────
function readSync(collection) {
    try { return JSON.parse(fs.readFileSync(resolvePath(collection), 'utf8')); }
    catch { return []; }
}

function writeSync(collection, data) {
    fs.writeFileSync(resolvePath(collection), JSON.stringify(data, null, 2), 'utf8');
}

// ── Public API ────────────────────────────────────────────────

/** Read all records from a collection */
function read(collection) {
    return readSync(collection);
}

/** Find records matching a predicate */
function find(collection, predicate) {
    return readSync(collection).filter(predicate);
}

/** Find a single record */
function findOne(collection, predicate) {
    return readSync(collection).find(predicate) || null;
}

/** Append a new record (auto-adds id + createdAt) */
async function insert(collection, record) {
    return withLock(collection, () => {
        const items = readSync(collection);
        const entry = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...record };
        items.push(entry);
        writeSync(collection, items);
        return entry;
    });
}

/** Update a record by id */
async function update(collection, id, patch) {
    return withLock(collection, () => {
        const items = readSync(collection);
        const idx   = items.findIndex(i => i.id === id || i.agentId === id);
        if (idx === -1) return null;
        items[idx] = { ...items[idx], ...patch, updatedAt: new Date().toISOString() };
        writeSync(collection, items);
        return items[idx];
    });
}

/** Remove a record by id */
async function remove(collection, id) {
    return withLock(collection, () => {
        const items  = readSync(collection);
        const before = items.length;
        const next   = items.filter(i => i.id !== id && i.agentId !== id);
        if (next.length === before) return false;
        writeSync(collection, next);
        return true;
    });
}

// ── Partner-specific helpers ──────────────────────────────────

/**
 * Approve a lead: generate AgentID, move to partners_active, remove from leads.
 * @param {string} leadId
 * @returns {object} newPartner
 */
async function approveLead(leadId) {
    return withLock('partners_leads', async () => {
        return withLock('partners_active', () => {
            const leads   = readSync('partners_leads');
            const active  = readSync('partners_active');
            const idx     = leads.findIndex(l => l.id === leadId);
            if (idx === -1) throw new Error('Lead not found');

            const lead    = leads[idx];
            const seq     = active.length + 1;
            const yr      = new Date().getFullYear();
            const agentId = `EV-AGNT-${yr}-${String(seq).padStart(3, '0')}`;

            const partner = {
                ...lead,
                agentId,
                status:     'active',
                tier:       'Bronze',
                totalGmv:   0,
                commission: { pending: 0, earned: 0, paid: 0 },
                approvedAt: new Date().toISOString(),
            };
            delete partner.id;

            active.push(partner);
            leads.splice(idx, 1);
            writeSync('partners_active', active);
            writeSync('partners_leads', leads);
            return partner;
        });
    });
}

/**
 * Append a new sale to sales_ledger and update partner commission.
 * @param {object} sale – invoice object from BillingEngine
 */
async function recordSale(sale) {
    await withLock('sales_ledger', () => {
        const ledger = readSync('sales_ledger');
        ledger.push(sale);
        writeSync('sales_ledger', ledger);
    });

    if (sale.agent_id) {
        await withLock('partners_active', () => {
            const active  = readSync('partners_active');
            const partner = active.find(p => p.agentId === sale.agent_id);
            if (partner) {
                partner.totalGmv = (partner.totalGmv || 0) + (sale.net_total || 0);
                partner.commission = partner.commission || { pending: 0, earned: 0, paid: 0 };
                partner.commission.pending += (sale.commission || 0);
                writeSync('partners_active', active);
            }
        });
    }
    return sale;
}

module.exports = { read, find, findOne, insert, update, remove, approveLead, recordSale, withLock };
