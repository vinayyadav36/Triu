// ============================================
// SETTLEMENT SERVICE — Merchant payout engine
// ============================================
const db            = require('../utils/jsonDB');
const ledgerService = require('./ledgerService');

const COLLECTION        = 'settlements';
const COMMISSION_RATE   = 0.10; // 10%
const TDS_RATE          = 0.01; // 1%

// ── Per-order commission register ────────────────────────────────────────────
function getOrderCommissions(sellerId, fromDate, toDate) {
    const from = fromDate ? new Date(fromDate).getTime() : 0;
    const to   = toDate   ? new Date(toDate).getTime()   : Infinity;

    const orders = db.find('orders', o => {
        const sellerItems = (o.items || []).some(i => i.sellerId === sellerId);
        if (!sellerItems) return false;
        const t = new Date(o.createdAt).getTime();
        return t >= from && t <= to && o.status !== 'cancelled' && o.status !== 'refunded';
    });

    return orders.map(order => {
        const sellerTotal = (order.items || [])
            .filter(i => i.sellerId === sellerId)
            .reduce((s, i) => s + (i.total || i.price * i.quantity), 0);
        const commission = parseFloat((sellerTotal * COMMISSION_RATE).toFixed(2));
        const tds        = parseFloat((sellerTotal * TDS_RATE).toFixed(2));
        const net        = parseFloat((sellerTotal - commission - tds).toFixed(2));
        return {
            orderId:   order.id,
            orderDate: order.createdAt,
            gross:     parseFloat(sellerTotal.toFixed(2)),
            commission,
            tds,
            net,
        };
    });
}

// ── Calculate settlement ─────────────────────────────────────────────────────
function calculateSettlement(sellerId, fromDate, toDate) {
    const commissions = getOrderCommissions(sellerId, fromDate, toDate);

    const totalGross      = commissions.reduce((s, c) => s + c.gross, 0);
    const totalCommission = commissions.reduce((s, c) => s + c.commission, 0);
    const totalTds        = commissions.reduce((s, c) => s + c.tds, 0);
    const totalNet        = commissions.reduce((s, c) => s + c.net, 0);

    // Subtract any refunds in this period
    const refunds = db.find('orders', o =>
        (o.items || []).some(i => i.sellerId === sellerId) &&
        (o.status === 'refunded' || o.status === 'cancelled'),
    ).reduce((s, o) => {
        const sellerTotal = (o.items || [])
            .filter(i => i.sellerId === sellerId)
            .reduce((t, i) => t + (i.total || i.price * i.quantity), 0);
        return s + sellerTotal;
    }, 0);

    return {
        sellerId,
        fromDate: fromDate || null,
        toDate:   toDate   || null,
        orders:   commissions,
        summary: {
            totalGross:      parseFloat(totalGross.toFixed(2)),
            totalCommission: parseFloat(totalCommission.toFixed(2)),
            totalTds:        parseFloat(totalTds.toFixed(2)),
            totalRefunds:    parseFloat(refunds.toFixed(2)),
            netPayable:      parseFloat((totalNet - refunds).toFixed(2)),
        },
    };
}

// ── Process settlement ────────────────────────────────────────────────────────
function processSettlement(sellerId, fromDate, toDate) {
    const calc = calculateSettlement(sellerId, fromDate, toDate);
    const netAmount = calc.summary.netPayable;

    const settlement = db.create(COLLECTION, {
        sellerId,
        fromDate:        fromDate || new Date(0).toISOString(),
        toDate:          toDate   || new Date().toISOString(),
        status:          'processed',
        summary:         calc.summary,
        orderCount:      calc.orders.length,
        netAmount,
        currency:        'INR',
        processedAt:     new Date().toISOString(),
    });

    // Record in ledger
    ledgerService.recordSettlement(settlement);

    return settlement;
}

// ── List settlements ──────────────────────────────────────────────────────────
function getSettlements(sellerId) {
    const settlements = sellerId
        ? db.find(COLLECTION, s => s.sellerId === sellerId)
        : db.find(COLLECTION);
    settlements.sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt));
    return settlements;
}

module.exports = {
    calculateSettlement,
    processSettlement,
    getSettlements,
    getOrderCommissions,
    COMMISSION_RATE,
    TDS_RATE,
};
