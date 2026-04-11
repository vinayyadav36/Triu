// ============================================
// FORECASTING — Demand and sales projections
// ============================================
const db        = require('../../utils/jsonDB');
const gstEngine = require('../../services/gstEngine');

// ── Exponential smoothing ─────────────────────────────────────────────────────
function exponentialSmoothing(data, alpha = 0.3) {
    if (!data || data.length === 0) return [];
    const smoothed = [data[0]];
    for (let i = 1; i < data.length; i++) {
        smoothed.push(alpha * data[i] + (1 - alpha) * smoothed[i - 1]);
    }
    return smoothed;
}

// Build daily sales time-series for a product over last N days
function buildDailySales(productId, days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const orders = db.find('orders', o => new Date(o.createdAt).getTime() >= cutoff);

    const dailyMap = {};
    for (let i = 0; i < days; i++) {
        const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
        dailyMap[d.toISOString().slice(0, 10)] = 0;
    }

    for (const order of orders) {
        const day = new Date(order.createdAt).toISOString().slice(0, 10);
        for (const item of (order.items || [])) {
            if (item.productId === productId) {
                dailyMap[day] = (dailyMap[day] || 0) + item.quantity;
            }
        }
    }

    return Object.entries(dailyMap).map(([date, qty]) => ({ date, qty }));
}

// ── Demand forecast ───────────────────────────────────────────────────────────
function forecastDemand(productId, days = 14) {
    const historicalDays = Math.max(days * 2, 30);
    const history        = buildDailySales(productId, historicalDays);
    const qtySeries      = history.map(d => d.qty);
    const smoothed       = exponentialSmoothing(qtySeries);

    const lastSmoothed = smoothed[smoothed.length - 1] || 0;

    // Project forward
    const forecast = [];
    for (let i = 1; i <= days; i++) {
        const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
        forecast.push({
            date:         d.toISOString().slice(0, 10),
            forecastQty:  Math.max(0, Math.round(lastSmoothed * (1 + (Math.random() - 0.5) * 0.1))),
        });
    }

    return {
        productId,
        historicalData: history,
        forecast,
        avgDailySales: parseFloat((qtySeries.reduce((a, b) => a + b, 0) / qtySeries.length).toFixed(2)),
    };
}

// ── Revenue forecast ─────────────────────────────────────────────────────────
function forecastRevenue(sellerId, days = 30) {
    const products = db.find('products', p => p.sellerId === sellerId && p.status === 'active');
    const historicalDays = Math.max(days * 2, 30);
    const cutoff    = Date.now() - historicalDays * 24 * 60 * 60 * 1000;

    const orders = db.find('orders', o => new Date(o.createdAt).getTime() >= cutoff);

    const dailyRevMap = {};
    for (let i = 0; i < historicalDays; i++) {
        const d = new Date(Date.now() - (historicalDays - 1 - i) * 24 * 60 * 60 * 1000);
        dailyRevMap[d.toISOString().slice(0, 10)] = 0;
    }

    for (const order of orders) {
        const day = new Date(order.createdAt).toISOString().slice(0, 10);
        for (const item of (order.items || [])) {
            if (item.sellerId === sellerId) {
                dailyRevMap[day] = (dailyRevMap[day] || 0) + (item.total || item.price * item.quantity);
            }
        }
    }

    const revSeries = Object.values(dailyRevMap);
    const smoothed  = exponentialSmoothing(revSeries);
    const lastSmoothed = smoothed[smoothed.length - 1] || 0;

    const forecast = [];
    for (let i = 1; i <= days; i++) {
        const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
        forecast.push({
            date:            d.toISOString().slice(0, 10),
            forecastRevenue: parseFloat(Math.max(0, lastSmoothed * (1 + (Math.random() - 0.5) * 0.15)).toFixed(2)),
        });
    }

    const totalProjected = forecast.reduce((s, f) => s + f.forecastRevenue, 0);

    return {
        sellerId,
        productCount: products.length,
        forecastDays: days,
        forecast,
        totalProjectedRevenue: parseFloat(totalProjected.toFixed(2)),
        avgDailyRevenue: parseFloat((lastSmoothed).toFixed(2)),
    };
}

// ── Low stock detection ───────────────────────────────────────────────────────
function detectLowStock(sellerId) {
    const products = db.find('products', p => p.sellerId === sellerId && p.status === 'active');
    const lowStock = [];

    for (const product of products) {
        const demand  = forecastDemand(product.id, 7);
        const needed  = demand.forecast.reduce((s, f) => s + f.forecastQty, 0);
        const stock   = product.stock || 0;

        if (stock < needed || stock < 10) {
            lowStock.push({
                productId:    product.id,
                productName:  product.name,
                currentStock: stock,
                forecastNeed: needed,
                daysUntilOut: needed > 0 ? Math.floor(stock / (needed / 7)) : Infinity,
                urgency:      stock === 0 ? 'critical' : stock < 5 ? 'high' : 'medium',
            });
        }
    }

    lowStock.sort((a, b) => a.daysUntilOut - b.daysUntilOut);
    return lowStock;
}

// ── GST liability projection ─────────────────────────────────────────────────
function getGSTLiabilityProjection(sellerId, month, year) {
    const revenue = forecastRevenue(sellerId, 30);
    const avgDaily = revenue.avgDailyRevenue;
    const daysInMonth = new Date(year, month, 0).getDate();
    const projectedRevenue = avgDaily * daysInMonth;

    const gst = gstEngine.calculateGST(projectedRevenue, null, 'Maharashtra', 'Maharashtra');

    return {
        sellerId,
        month,
        year,
        projectedRevenue:     parseFloat(projectedRevenue.toFixed(2)),
        projectedGstLiability: gst.totalGst,
        breakdown: {
            cgst:  gst.cgst,
            sgst:  gst.sgst,
            igst:  gst.igst,
        },
    };
}

module.exports = {
    forecastDemand,
    forecastRevenue,
    detectLowStock,
    getGSTLiabilityProjection,
    exponentialSmoothing,
};
