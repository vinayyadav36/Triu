// ============================================
// COPILOT — Conversational business assistant
// ============================================
const db                 = require('../../utils/jsonDB');
const gstEngine          = require('../../services/gstEngine');
const settlementService  = require('../../services/settlementService');
const { detectLowStock } = require('./forecasting');

// ── Entity extraction helpers ─────────────────────────────────────────────────
function extractDate(query) {
    const today = new Date();
    const q     = query.toLowerCase();

    if (q.includes('today'))      return { date: today.toISOString().slice(0, 10), label: 'Today' };
    if (q.includes('yesterday')) {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        return { date: y.toISOString().slice(0, 10), label: 'Yesterday' };
    }
    if (q.includes('this week')) {
        const w = new Date(today); w.setDate(w.getDate() - 7);
        return { date: w.toISOString().slice(0, 10), label: 'This Week' };
    }
    if (q.includes('this month')) {
        return { date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, label: 'This Month' };
    }
    // Month name extraction
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    for (let i = 0; i < months.length; i++) {
        if (q.includes(months[i])) {
            const year = q.match(/\d{4}/)?.[0] || today.getFullYear();
            return { date: `${year}-${String(i + 1).padStart(2, '0')}-01`, label: months[i], month: i + 1, year };
        }
    }
    return null;
}

function extractAmount(query) {
    // Use a simple, non-backtracking pattern to avoid ReDoS
    const match = query.match(/(?:₹\s*)?(\d{1,15}(?:\.\d{1,2})?)/);
    if (!match) return null;
    const num = parseFloat(match[1].replace(/,/g, ''));
    return isNaN(num) ? null : num;
}

function extractLimit(query) {
    // Use simple non-backtracking pattern
    const m1 = query.match(/top\s+(\d{1,3})/i);
    if (m1) return parseInt(m1[1], 10);
    const m2 = query.match(/(\d{1,3})\s+products/i);
    return m2 ? parseInt(m2[1], 10) : 5;
}

// ── Dashboard card builders ───────────────────────────────────────────────────
function buildMetricCard(title, value, unit = '', trend = null) {
    return { type: 'metric', title, data: { value, unit, trend } };
}

function buildTableCard(title, columns, rows) {
    return { type: 'table', title, data: { columns, rows } };
}

function buildAlertCard(title, message, severity = 'info') {
    return { type: 'alert', title, data: { message, severity } };
}

// ── Query processors ──────────────────────────────────────────────────────────
function handleTodaySettlements(userId, role) {
    const today = new Date().toISOString().slice(0, 10);
    const sellerId = role === 'seller' ? userId : null;
    const settlements = settlementService.getSettlements(sellerId)
        .filter(s => s.processedAt && s.processedAt.slice(0, 10) === today);

    if (settlements.length === 0) {
        return [buildAlertCard('Settlements', 'No settlements processed today.', 'info')];
    }

    const total = settlements.reduce((s, st) => s + (st.netAmount || 0), 0);
    return [
        buildMetricCard("Today's Settlements", total.toFixed(2), '₹'),
        buildTableCard('Settlement Details',
            ['Seller ID', 'Net Amount', 'Status'],
            settlements.map(s => [s.sellerId, `₹${s.netAmount}`, s.status]),
        ),
    ];
}

function handleGSTLiability(userId, role) {
    const today = new Date();
    const month = today.getMonth() + 1;
    const year  = today.getFullYear();
    const sellerId = role === 'seller' ? userId : null;

    if (!sellerId) {
        return [buildAlertCard('GST Liability', 'Please specify a seller or log in as a seller.', 'warning')];
    }

    const gstReturn = gstEngine.generateGSTReturn(sellerId, month, year);
    return [
        buildMetricCard('GST Liability (This Month)', gstReturn.totalTax.toFixed(2), '₹'),
        buildTableCard('GST Summary',
            ['Metric', 'Value'],
            [
                ['Taxable Amount', `₹${gstReturn.totalTaxableAmt}`],
                ['Total GST',      `₹${gstReturn.totalTax}`],
                ['Period',         `${String(month).padStart(2, '0')}/${year}`],
            ],
        ),
    ];
}

function handleTopProducts(query) {
    const limit = extractLimit(query);
    const products = db.find('products', p => p.status === 'active');
    products.sort((a, b) => (b.sales || 0) - (a.sales || 0));
    const top = products.slice(0, limit);
    return [
        buildTableCard(`Top ${limit} Products by Revenue`,
            ['Product', 'Category', 'Price', 'Sales'],
            top.map(p => [p.name, p.category, `₹${p.price}`, p.sales || 0]),
        ),
    ];
}

function handleInventoryAlert(userId, role) {
    const sellerId = role === 'seller' ? userId : null;
    if (!sellerId) {
        return [buildAlertCard('Inventory', 'Log in as a seller to view inventory alerts.', 'warning')];
    }
    const lowStock = detectLowStock(sellerId);
    if (lowStock.length === 0) {
        return [buildAlertCard('Inventory', 'All products are well-stocked!', 'success')];
    }
    return [
        buildAlertCard('Low Stock Warning', `${lowStock.length} products need restocking`, 'warning'),
        buildTableCard('Low Stock Products',
            ['Product', 'Current Stock', 'Days Until Out', 'Urgency'],
            lowStock.map(p => [p.productName, p.currentStock, p.daysUntilOut === Infinity ? '∞' : p.daysUntilOut, p.urgency]),
        ),
    ];
}

function handleGSTReturn(query, userId, role) {
    const dateInfo = extractDate(query);
    const month    = dateInfo?.month || new Date().getMonth() + 1;
    const year     = dateInfo?.year  || new Date().getFullYear();
    const sellerId = role === 'seller' ? userId : null;

    if (!sellerId) {
        return [buildAlertCard('GST Return', 'Log in as a seller to generate GST returns.', 'warning')];
    }

    const gstReturn = gstEngine.generateGSTReturn(sellerId, month, year);
    return [
        buildMetricCard('GSTR-1 Period', `${String(month).padStart(2, '0')}/${year}`, ''),
        buildMetricCard('Total Tax',     gstReturn.totalTax.toFixed(2), '₹'),
        buildTableCard('B2B Invoices',
            ['Invoice', 'Buyer GSTIN', 'Taxable', 'Tax'],
            (gstReturn.b2b || []).map(b => [b.invoiceNo, b.buyerGstin, `₹${b.taxableAmt}`, `₹${b.igst + b.cgst + b.sgst}`]),
        ),
    ];
}

// ── Main entry point ──────────────────────────────────────────────────────────
function processQuery(query, userId, role) {
    const q = (query || '').toLowerCase();
    let cards = [];

    if (q.includes('settlement') && (q.includes('today') || q.includes('latest'))) {
        cards = handleTodaySettlements(userId, role);
    } else if (q.includes('gst') && q.includes('liability')) {
        cards = handleGSTLiability(userId, role);
    } else if (q.includes('top') && q.includes('product')) {
        cards = handleTopProducts(query);
    } else if (q.includes('inventory') || q.includes('low stock')) {
        cards = handleInventoryAlert(userId, role);
    } else if (q.includes('gst') && (q.includes('return') || q.includes('gstr'))) {
        cards = handleGSTReturn(query, userId, role);
    } else if (q.includes('order') && q.includes('today')) {
        const today   = new Date().toISOString().slice(0, 10);
        const orders  = db.find('orders', o => o.createdAt?.slice(0, 10) === today);
        const revenue = orders.reduce((s, o) => s + (o.pricing?.total || o.total || 0), 0);
        cards = [
            buildMetricCard("Today's Orders", orders.length, 'orders'),
            buildMetricCard("Today's Revenue", revenue.toFixed(2), '₹'),
        ];
    } else {
        cards = [buildAlertCard('Copilot', `I understood: "${query}". Try: "show today's settlements", "GST liability this month", "top 5 products", "low stock alert".`, 'info')];
    }

    return { query, cards, timestamp: new Date().toISOString() };
}

module.exports = {
    processQuery,
    extractDate,
    extractAmount,
    extractLimit,
};
