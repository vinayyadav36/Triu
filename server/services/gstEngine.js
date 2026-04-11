// ============================================
// GST ENGINE — Indian GST calculation service
// ============================================
const db = require('../utils/jsonDB');

// HSN code → GST rate mapping (%)
const HSN_RATES = {
    // Electronics (18%)
    '8471': 18, '8473': 18, '8517': 18, '8528': 18, '8542': 18,
    // Garments / Fashion (12%)
    '6101': 12, '6102': 12, '6109': 12, '6110': 12, '6201': 12, '6203': 12,
    // Grocery / Food (5%)
    '1001': 5, '1006': 5, '0901': 5, '2101': 5, '1905': 5,
    // Books / Education (0%)
    '4901': 0, '4902': 0, '4903': 0,
    // Footwear (12%)
    '6401': 12, '6402': 12, '6403': 12, '6404': 12,
    // Furniture (18%)
    '9401': 18, '9403': 18,
    // Jewellery (3%)
    '7113': 3, '7114': 3,
    // Pharmaceuticals (12%)
    '3001': 12, '3002': 12, '3004': 12,
    // Automobiles (28%)
    '8703': 28, '8711': 28,
    // Default
    default: 18,
};

const CATEGORY_RATES = {
    electronics: 18,
    fashion: 12,
    clothing: 12,
    grocery: 5,
    food: 5,
    books: 0,
    education: 0,
    footwear: 12,
    furniture: 18,
    jewellery: 3,
    pharmacy: 12,
    automobile: 28,
    toys: 12,
    sports: 12,
    beauty: 18,
};

function getRate(hsnCode) {
    if (!hsnCode) return HSN_RATES.default;
    const code = String(hsnCode).slice(0, 4);
    return HSN_RATES[code] !== undefined ? HSN_RATES[code] : HSN_RATES.default;
}

function getRateByCategory(category) {
    if (!category) return HSN_RATES.default;
    return CATEGORY_RATES[category.toLowerCase()] || HSN_RATES.default;
}

// ── Core calculator ───────────────────────────────────────────────────────────
function calculateGST(amount, hsnCode, sellerState, buyerState) {
    const rate = getRate(hsnCode);
    const totalGst = parseFloat(((amount * rate) / 100).toFixed(2));
    const isInterState = sellerState && buyerState
        ? sellerState.trim().toLowerCase() !== buyerState.trim().toLowerCase()
        : false;

    let cgst = 0, sgst = 0, igst = 0;
    if (isInterState) {
        igst = totalGst;
    } else {
        cgst = parseFloat((totalGst / 2).toFixed(2));
        sgst = parseFloat((totalGst / 2).toFixed(2));
    }

    return {
        baseAmount: amount,
        rate,
        cgst,
        sgst,
        igst,
        totalGst,
        totalWithGst: parseFloat((amount + totalGst).toFixed(2)),
        isInterState,
        breakdown: {
            hsnCode,
            sellerState: sellerState || 'N/A',
            buyerState: buyerState || 'N/A',
            type: isInterState ? 'IGST' : 'CGST+SGST',
        },
    };
}

// ── B2B aggregation ───────────────────────────────────────────────────────────
function calculateB2B(orders) {
    const invoices = [];
    for (const order of orders) {
        if (!order.buyerGstin) continue; // B2B requires GSTIN
        const gstData = calculateGST(
            order.subtotal || 0,
            order.hsnCode || null,
            order.sellerState || '',
            order.buyerState || '',
        );
        invoices.push({
            invoiceNo:   order.invoiceNumber || order.id,
            invoiceDate: order.createdAt,
            buyerGstin:  order.buyerGstin,
            buyerName:   order.buyerName || '',
            pos:         order.buyerState || '',
            reverseCharge: 'N',
            invoiceType: 'Regular',
            ecomGstin:   '',
            rate:        gstData.rate,
            taxableAmt:  gstData.baseAmount,
            igst:        gstData.igst,
            cgst:        gstData.cgst,
            sgst:        gstData.sgst,
            cess:        0,
        });
    }
    return invoices;
}

// ── B2C aggregation ───────────────────────────────────────────────────────────
function calculateB2C(orders) {
    // Group by state + rate for B2CS summary
    const grouped = {};
    for (const order of orders) {
        if (order.buyerGstin) continue; // skip B2B orders
        const gstData = calculateGST(
            order.subtotal || 0,
            order.hsnCode || null,
            order.sellerState || '',
            order.buyerState || '',
        );
        const key = `${order.buyerState || 'OTH'}_${gstData.rate}`;
        if (!grouped[key]) {
            grouped[key] = {
                type:       'OE',
                rate:       gstData.rate,
                pos:        order.buyerState || 'OTH',
                ecomGstin:  '',
                taxableAmt: 0,
                igst:       0,
                cess:       0,
            };
        }
        grouped[key].taxableAmt += gstData.baseAmount;
        grouped[key].igst       += gstData.igst;
    }
    return Object.values(grouped);
}

// ── GSTR-1 draft ─────────────────────────────────────────────────────────────
function generateGSTReturn(sellerId, month, year) {
    const allOrders = db.find('orders', o => {
        if (o.sellerId !== sellerId && !o.items?.some(i => i.sellerId === sellerId)) return false;
        const d = new Date(o.createdAt);
        return d.getMonth() + 1 === parseInt(month, 10) && d.getFullYear() === parseInt(year, 10);
    });

    const sellerOrders = allOrders.map(o => ({
        ...o,
        subtotal:   o.subtotal || o.pricing?.subtotal || 0,
        sellerState: 'Maharashtra', // Default; real data would come from seller profile
        buyerState:  o.deliveryAddress?.state || '',
    }));

    const b2b = calculateB2B(sellerOrders);
    const b2c = calculateB2C(sellerOrders);

    const totalTaxable = sellerOrders.reduce((s, o) => s + (o.subtotal || 0), 0);
    const totalTax     = sellerOrders.reduce((s, o) => {
        const g = calculateGST(o.subtotal || 0, o.hsnCode, o.sellerState, o.buyerState);
        return s + g.totalGst;
    }, 0);

    return {
        gstin:       '', // seller GSTIN — populated from seller profile
        period:      `${String(month).padStart(2, '0')}${year}`,
        sellerId,
        b2b,
        b2cs: b2c,
        totalInvoices: sellerOrders.length,
        totalTaxableAmt: parseFloat(totalTaxable.toFixed(2)),
        totalTax:        parseFloat(totalTax.toFixed(2)),
        generatedAt:     new Date().toISOString(),
    };
}

module.exports = {
    calculateGST,
    generateGSTReturn,
    calculateB2B,
    calculateB2C,
    getRate,
    getRateByCategory,
    HSN_RATES,
    CATEGORY_RATES,
};
