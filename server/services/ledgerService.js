// ============================================
// LEDGER SERVICE — Double-entry accounting
// ============================================
const db = require('../utils/jsonDB');

const COLLECTION = 'ledger';

// ── Core entry creators ───────────────────────────────────────────────────────
function debit(accountId, amount, description, refId = null, refType = null) {
    return db.create(COLLECTION, {
        accountId,
        type:        'debit',
        amount:      parseFloat(amount),
        description,
        refId,
        refType,
        date:        new Date().toISOString(),
    });
}

function credit(accountId, amount, description, refId = null, refType = null) {
    return db.create(COLLECTION, {
        accountId,
        type:        'credit',
        amount:      parseFloat(amount),
        description,
        refId,
        refType,
        date:        new Date().toISOString(),
    });
}

// ── Balance ───────────────────────────────────────────────────────────────────
function getBalance(accountId) {
    const entries = db.find(COLLECTION, e => e.accountId === accountId);
    let balance = 0;
    for (const e of entries) {
        if (e.type === 'credit') balance += e.amount;
        else if (e.type === 'debit') balance -= e.amount;
    }
    return parseFloat(balance.toFixed(2));
}

// ── Statement ─────────────────────────────────────────────────────────────────
function getStatement(accountId, fromDate, toDate) {
    const from = fromDate ? new Date(fromDate).getTime() : 0;
    const to   = toDate   ? new Date(toDate).getTime()   : Infinity;

    const entries = db.find(COLLECTION, e => {
        if (e.accountId !== accountId) return false;
        const t = new Date(e.date).getTime();
        return t >= from && t <= to;
    });

    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningBalance = 0;
    return entries.map(e => {
        if (e.type === 'credit') runningBalance += e.amount;
        else runningBalance -= e.amount;
        return { ...e, runningBalance: parseFloat(runningBalance.toFixed(2)) };
    });
}

// ── Order payment ─────────────────────────────────────────────────────────────
function recordOrderPayment(order) {
    const amount    = order.pricing?.total || order.total || 0;
    const orderId   = order.id;
    const userId    = order.userId;
    const sellerId  = order.sellerId || (order.items?.[0]?.sellerId) || 'platform';
    const platform  = 'platform';

    // Customer account debited (they pay)
    debit(userId, amount, `Order payment #${orderId}`, orderId, 'order');

    // Platform account credited (receives payment)
    credit(platform, amount, `Order received #${orderId}`, orderId, 'order');

    // Commission (10%)
    const commission = parseFloat((amount * 0.10).toFixed(2));
    debit(sellerId, commission, `Platform commission #${orderId}`, orderId, 'commission');
    credit(platform, commission, `Commission earned #${orderId}`, orderId, 'commission');

    // Net seller credit (after commission)
    const netSeller = parseFloat((amount - commission).toFixed(2));
    credit(sellerId, netSeller, `Order revenue net #${orderId}`, orderId, 'order');

    return { amount, commission, netSeller, orderId };
}

// ── Settlement ────────────────────────────────────────────────────────────────
function recordSettlement(settlement) {
    const { sellerId, netAmount, id: settlementId } = settlement;

    // Debit seller account (paying out)
    debit(sellerId, netAmount, `Settlement payout #${settlementId}`, settlementId, 'settlement');

    // Debit platform account (paying out)
    debit('platform', netAmount, `Settlement paid #${settlementId}`, settlementId, 'settlement');

    return { sellerId, netAmount, settlementId };
}

module.exports = {
    debit,
    credit,
    getBalance,
    getStatement,
    recordOrderPayment,
    recordSettlement,
};
