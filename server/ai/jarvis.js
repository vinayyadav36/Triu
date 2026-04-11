// ============================================
// JARVIS — AI Orchestrator (singleton)
// ============================================
const db              = require('../utils/jsonDB');
const recommendations = require('./skills/recommendations');
const forecasting     = require('./skills/forecasting');
const fraudDetection  = require('./skills/fraudDetection');
const copilot         = require('./skills/copilot');
const gstEngine       = require('../services/gstEngine');
const eventQueue      = require('../services/eventQueue');

// ── Intent classifier ─────────────────────────────────────────────────────────
const INTENT_PATTERNS = [
    { intent: 'gst_liability',   patterns: ['gst liability', 'gst amount', 'tax liability', 'how much gst'] },
    { intent: 'gst_return',      patterns: ['gst return', 'gstr', 'file gst', 'generate gstr'] },
    { intent: 'today_orders',    patterns: ["today's orders", 'orders today', 'todays orders', 'how many orders'] },
    { intent: 'settlements',     patterns: ['settlement', 'payout', 'how much earned', 'my earnings'] },
    { intent: 'low_stock',       patterns: ['low stock', 'out of stock', 'inventory alert', 'reorder'] },
    { intent: 'inventory',       patterns: ['inventory', 'stock levels', 'product stock'] },
    { intent: 'top_products',    patterns: ['top products', 'best selling', 'trending products', 'top 5', 'top 10'] },
    { intent: 'forecast',        patterns: ['forecast', 'predict', 'next month', 'revenue projection', 'demand'] },
    { intent: 'fraud',           patterns: ['fraud', 'anomaly', 'suspicious', 'risk', 'anomalies'] },
    { intent: 'recommendations', patterns: ['recommend', 'suggestion', 'what to sell', 'popular items'] },
    { intent: 'dashboard',       patterns: ['dashboard', 'overview', 'summary', 'stats', 'performance'] },
];

function classifyIntent(query) {
    const q = (query || '').toLowerCase();
    for (const { intent, patterns } of INTENT_PATTERNS) {
        if (patterns.some(p => q.includes(p))) return intent;
    }
    return 'copilot'; // fallback to general copilot
}

// ── Skill dispatcher ──────────────────────────────────────────────────────────
async function dispatchSkill(intent, query, context) {
    const userId   = context?.userId   || null;
    const role     = context?.role     || 'customer';
    const sellerId = context?.sellerId || userId;

    switch (intent) {
        case 'gst_liability': {
            const today = new Date();
            const data  = gstEngine.generateGSTReturn(sellerId, today.getMonth() + 1, today.getFullYear());
            return {
                intent,
                data,
                message: `Your GST liability this month is ₹${data.totalTax}`,
                card: { type: 'metric', title: 'GST Liability', data: { value: data.totalTax, unit: '₹' } },
            };
        }

        case 'gst_return': {
            const dateInfo = copilot.extractDate(query);
            const month    = dateInfo?.month || new Date().getMonth() + 1;
            const year     = dateInfo?.year  || new Date().getFullYear();
            const data     = gstEngine.generateGSTReturn(sellerId, month, year);
            return {
                intent,
                data,
                message: `Generated GSTR-1 draft for ${String(month).padStart(2,'0')}/${year}`,
                card: { type: 'table', title: 'GSTR-1 Draft', data },
            };
        }

        case 'today_orders': {
            const today  = new Date().toISOString().slice(0, 10);
            const orders = db.find('orders', o => o.createdAt?.slice(0, 10) === today);
            const revenue = orders.reduce((s, o) => s + (o.pricing?.total || o.total || 0), 0);
            return {
                intent,
                data:    { orders, count: orders.length, revenue },
                message: `You have ${orders.length} orders today totaling ₹${revenue.toFixed(2)}`,
                card:    { type: 'metric', title: "Today's Orders", data: { value: orders.length, revenue } },
            };
        }

        case 'settlements': {
            const { settlementService } = require('../services/settlementService');
            const settlements = (typeof settlementService?.getSettlements === 'function'
                ? settlementService.getSettlements(sellerId)
                : require('../services/settlementService').getSettlements(sellerId));
            return {
                intent,
                data:    settlements,
                message: `Found ${settlements.length} settlements`,
                card:    { type: 'table', title: 'Settlements', data: settlements },
            };
        }

        case 'low_stock':
        case 'inventory': {
            const lowStock = forecasting.detectLowStock(sellerId);
            return {
                intent,
                data:    lowStock,
                message: lowStock.length === 0 ? 'All products are well-stocked!' : `${lowStock.length} products need attention`,
                card:    { type: 'table', title: 'Inventory Alert', data: lowStock },
            };
        }

        case 'top_products': {
            const limit    = copilot.extractLimit(query);
            const products = db.find('products', p => p.status === 'active');
            products.sort((a, b) => (b.sales || 0) - (a.sales || 0));
            const top = products.slice(0, limit);
            return {
                intent,
                data:    top,
                message: `Top ${limit} products by sales`,
                card:    { type: 'table', title: `Top ${limit} Products`, data: top },
            };
        }

        case 'forecast': {
            const data = forecasting.forecastRevenue(sellerId, 30);
            return {
                intent,
                data,
                message: `Projected revenue for next 30 days: ₹${data.totalProjectedRevenue}`,
                card:    { type: 'chart', title: 'Revenue Forecast', data },
            };
        }

        case 'fraud': {
            const anomalies = fraudDetection.getAnomalies();
            return {
                intent,
                data:    anomalies,
                message: `Found ${anomalies.length} fraud/anomaly events`,
                card:    { type: 'table', title: 'Fraud Alerts', data: anomalies },
            };
        }

        case 'recommendations': {
            const recs = recommendations.getTrendingProducts(null, 10);
            return {
                intent,
                data:    recs,
                message: `Here are the top trending products`,
                card:    { type: 'table', title: 'Trending Products', data: recs },
            };
        }

        case 'dashboard': {
            const totalUsers    = db.count('users');
            const totalProducts = db.count('products', p => p.status === 'active');
            const totalOrders   = db.count('orders');
            const revenue       = db.find('orders').reduce((s, o) => s + (o.pricing?.total || o.total || 0), 0);
            return {
                intent,
                data:    { totalUsers, totalProducts, totalOrders, revenue },
                message: `Platform overview: ${totalUsers} users, ${totalProducts} products, ${totalOrders} orders, ₹${revenue.toFixed(2)} revenue`,
                card:    { type: 'metric', title: 'Platform Dashboard', data: { totalUsers, totalProducts, totalOrders, revenue } },
            };
        }

        default: {
            const result = copilot.processQuery(query, userId, role);
            return {
                intent: 'copilot',
                data:    result,
                message: result.cards?.[0]?.data?.message || 'Here is what I found',
                card:    result.cards?.[0] || { type: 'alert', title: 'Copilot', data: { message: 'How can I help you?' } },
            };
        }
    }
}

// ── Alert checker ─────────────────────────────────────────────────────────────
async function runAlert(sellerId) {
    const alerts = [];

    // Low stock alerts
    try {
        const lowStock = forecasting.detectLowStock(sellerId);
        if (lowStock.length > 0) {
            alerts.push({
                type:     'low_stock',
                severity: 'warning',
                message:  `${lowStock.length} products have low stock`,
                data:     lowStock,
            });
        }
    } catch {}

    // Refund spike
    try {
        const refundCheck = fraudDetection.analyzeRefundSpike(sellerId);
        if (refundCheck.spike) {
            alerts.push({
                type:     'refund_spike',
                severity: 'high',
                message:  `Unusual refund spike detected (${refundCheck.refundRate7}% in last 7 days)`,
                data:     refundCheck,
            });
        }
    } catch {}

    // Pending orders
    try {
        const pendingOrders = db.find('orders', o =>
            (o.items || []).some(i => i.sellerId === sellerId) && o.status === 'pending',
        );
        if (pendingOrders.length > 10) {
            alerts.push({
                type:     'pending_orders',
                severity: 'warning',
                message:  `You have ${pendingOrders.length} pending orders`,
                data:     { count: pendingOrders.length },
            });
        }
    } catch {}

    return alerts;
}

// ── Singleton ─────────────────────────────────────────────────────────────────
const jarvis = {
    initialized: false,

    initialize() {
        if (this.initialized) return;
        this.initialized = true;
        console.log('✅ Jarvis AI initialized');

        // Subscribe to order events
        eventQueue.subscribe(eventQueue.TOPICS.ORDER_CREATED, (event) => {
            const order = event.value;
            if (order?.id) {
                fraudDetection.analyzeOrder(order);
            }
        });
    },

    async ask(query, context = {}) {
        const intent = classifyIntent(query);
        return dispatchSkill(intent, query, context);
    },

    runAlert,
};

module.exports = jarvis;
