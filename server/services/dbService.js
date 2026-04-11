// ============================================
// DB SERVICE — Schema-validated wrapper around jsonDB
// ============================================
const db = require('../utils/jsonDB');

// ── Schemas ───────────────────────────────────────────────────────────────────
const SCHEMAS = {
    users: {
        required: ['name', 'email', 'passwordHash'],
        types: { name: 'string', email: 'string', passwordHash: 'string' },
    },
    products: {
        required: ['name', 'price'],
        types: { name: 'string', price: 'number' },
    },
    orders: {
        required: ['userId', 'items'],
        types: { userId: 'string' },
    },
    gst: {
        required: ['sellerId', 'period'],
        types: { sellerId: 'string', period: 'string' },
    },
    ledger: {
        required: ['accountId', 'type', 'amount'],
        types: { accountId: 'string', type: 'string', amount: 'number' },
    },
    invoices: {
        required: ['orderId', 'sellerId'],
        types: { orderId: 'string', sellerId: 'string' },
    },
    settlements: {
        required: ['sellerId'],
        types: { sellerId: 'string' },
    },
    events: {
        required: ['topic', 'value'],
        types: { topic: 'string' },
    },
};

// ── Validation ────────────────────────────────────────────────────────────────
function validate(collection, data) {
    const schema = SCHEMAS[collection];
    if (!schema) return { valid: true };

    const errors = [];

    for (const field of (schema.required || [])) {
        if (data[field] === undefined || data[field] === null || data[field] === '') {
            errors.push(`Field '${field}' is required`);
        }
    }

    for (const [field, expectedType] of Object.entries(schema.types || {})) {
        if (data[field] !== undefined && data[field] !== null) {
            // eslint-disable-next-line valid-typeof
            if (typeof data[field] !== expectedType) {
                errors.push(`Field '${field}' must be of type ${expectedType}`);
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

// ── Default JSON-file adapter ─────────────────────────────────────────────────
let _adapter = {
    find:       (col, pred)     => db.find(col, pred),
    findOne:    (col, pred)     => db.findOne(col, pred),
    findById:   (col, id)       => db.findById(col, id),
    create:     (col, data)     => db.create(col, data),
    updateById: (col, id, upd)  => db.updateById(col, id, upd),
    deleteById: (col, id)       => db.deleteById(col, id),
    count:      (col, pred)     => db.count(col, pred),
};

function setAdapter(adapter) {
    const required = ['find', 'findOne', 'findById', 'create', 'updateById', 'deleteById', 'count'];
    for (const m of required) {
        if (typeof adapter[m] !== 'function') {
            throw new Error(`Adapter must implement method: ${m}`);
        }
    }
    _adapter = adapter;
}

// ── Validated CRUD ────────────────────────────────────────────────────────────
function find(collection, predicate = null) {
    return _adapter.find(collection, predicate);
}

function findOne(collection, predicate) {
    return _adapter.findOne(collection, predicate);
}

function findById(collection, id) {
    return _adapter.findById(collection, id);
}

function create(collection, data) {
    const { valid, errors } = validate(collection, data);
    if (!valid) {
        const err = new Error(`Validation failed for ${collection}: ${errors.join(', ')}`);
        err.validationErrors = errors;
        throw err;
    }
    return _adapter.create(collection, data);
}

function updateById(collection, id, updates) {
    return _adapter.updateById(collection, id, updates);
}

function deleteById(collection, id) {
    return _adapter.deleteById(collection, id);
}

function count(collection, predicate = null) {
    return _adapter.count(collection, predicate);
}

module.exports = {
    validate,
    setAdapter,
    find,
    findOne,
    findById,
    create,
    updateById,
    deleteById,
    count,
};
