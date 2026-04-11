// ============================================
// JSON FILE DATABASE UTILITY
// ============================================
// Provides simple CRUD operations backed by
// plain JSON files stored in server/db/*.json
// ============================================

const fs   = require('fs');
const path = require('path');

// Allow tests to override DB directory via env var
const DB_DIR = process.env.TRIU_DB_DIR || path.join(__dirname, '..', 'db');

// Ensure the db directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

/** Return the file path for a given collection name */
function colPath(name) {
    return path.join(DB_DIR, `${name}.json`);
}

/** Read all records from a collection */
function readAll(name) {
    const file = colPath(name);
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, '[]', 'utf8');
        return [];
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return [];
    }
}

/** Atomically write records to a collection */
function writeAll(name, records) {
    const file    = colPath(name);
    const tmpFile = file + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(records, null, 2), 'utf8');
    fs.renameSync(tmpFile, file);
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────

/** Find all documents matching a predicate (or all if no predicate) */
function find(name, predicate = null) {
    const records = readAll(name);
    return predicate ? records.filter(predicate) : records;
}

/** Find a single document matching a predicate */
function findOne(name, predicate) {
    const records = readAll(name);
    return records.find(predicate) || null;
}

/** Find a document by its `id` field */
function findById(name, id) {
    return findOne(name, r => r.id === id);
}

/** Insert a new document; auto-generates `id`, `createdAt`, `updatedAt` */
function create(name, data) {
    const records = readAll(name);
    const doc = {
        id: _genId(),
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    records.push(doc);
    writeAll(name, records);
    return doc;
}

/** Update a document by id; merges fields; returns updated doc or null */
function updateById(name, id, updates) {
    const records = readAll(name);
    const idx     = records.findIndex(r => r.id === id);
    if (idx === -1) return null;
    records[idx] = { ...records[idx], ...updates, updatedAt: new Date().toISOString() };
    writeAll(name, records);
    return records[idx];
}

/** Delete a document by id; returns boolean */
function deleteById(name, id) {
    const records = readAll(name);
    const next    = records.filter(r => r.id !== id);
    if (next.length === records.length) return false;
    writeAll(name, next);
    return true;
}

/** Delete all documents matching a predicate */
function deleteWhere(name, predicate) {
    const records = readAll(name);
    const next    = records.filter(r => !predicate(r));
    writeAll(name, next);
    return records.length - next.length;
}

/** Count documents (optionally matching a predicate) */
function count(name, predicate = null) {
    return find(name, predicate).length;
}

// ── ID generator ──────────────────────────────────────────────────────────────
const { v4: uuidv4 } = require('uuid');

function _genId() {
    return uuidv4();
}

// ── Export ────────────────────────────────────────────────────────────────────
module.exports = {
    find,
    findOne,
    findById,
    create,
    updateById,
    deleteById,
    deleteWhere,
    count,
    readAll,
    writeAll,
};
