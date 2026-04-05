'use strict';

// ============================================
// TAX ENGINE — GST CGST/SGST/IGST + 1% TCS
// Compliant with CGST Act Section 52 (e-commerce operators).
// ============================================

/**
 * Standard GST rates by HSN chapter heading (simplified lookup).
 * Extend as needed for your product catalogue.
 */
const HSN_GST_RATES = {
    // Books / educational materials
    '4901': 0.00, '4902': 0.00, '4903': 0.00,
    // Stationery / paper articles
    '4820': 0.12, '4817': 0.12,
    // Natural/herbal products (food preparations)
    '2106': 0.05, '0910': 0.05,
    // Apparel ≤₹1000 MRP
    '6101': 0.05, '6201': 0.05,
    // Electronics / electrical equipment
    '8471': 0.18, '8517': 0.18, '8528': 0.18,
    // Sports goods
    '9506': 0.12,
    // Default fallback
    DEFAULT: 0.18,
};

/**
 * Look up GST rate for a given HSN code (string or number).
 * @param {string|number} hsnCode
 * @returns {number} GST rate as a decimal (e.g. 0.18 for 18 %)
 */
function getGSTRate(hsnCode) {
    if (!hsnCode) return HSN_GST_RATES.DEFAULT;
    const key = String(hsnCode).slice(0, 4);
    return HSN_GST_RATES[key] ?? HSN_GST_RATES.DEFAULT;
}

/**
 * Generate line-item invoice data for an order.
 * Automatically splits into CGST+SGST (intra-state) or IGST (inter-state).
 *
 * @param {{
 *   sellerState: string,
 *   buyerState: string,
 *   items: Array<{ id: string, name: string, price: number, quantity: number, hsnCode?: string }>
 * }} order
 * @returns {Array<object>} Array of line-item tax breakdowns
 */
function generateInvoiceData(order) {
    const { sellerState, buyerState, items } = order;
    if (!Array.isArray(items) || items.length === 0) return [];

    const isInterState = String(sellerState || '').trim().toLowerCase() !==
                         String(buyerState  || '').trim().toLowerCase();

    return items.map(item => {
        const qty       = Number(item.quantity) || 1;
        const basePrice = Number(item.price) * qty;
        const gstRate   = getGSTRate(item.hsnCode);

        let cgst = 0, sgst = 0, igst = 0;
        if (isInterState) {
            igst = basePrice * gstRate;
        } else {
            cgst = (basePrice * gstRate) / 2;
            sgst = (basePrice * gstRate) / 2;
        }

        const taxAmount      = igst + cgst + sgst;
        const totalPayable   = basePrice + taxAmount;
        const tcsDeduction   = basePrice * 0.01; // 1 % TCS (Section 52)
        const sellerNetPayout = basePrice - tcsDeduction;

        return {
            productId:      String(item.id || item._id || ''),
            productName:    String(item.name || ''),
            hsnCode:        String(item.hsnCode || ''),
            quantity:       qty,
            unitPrice:      Number(item.price).toFixed(2),
            basePrice:      basePrice.toFixed(2),
            gstRate:        `${(gstRate * 100).toFixed(0)}%`,
            cgst:           cgst.toFixed(2),
            sgst:           sgst.toFixed(2),
            igst:           igst.toFixed(2),
            taxAmount:      taxAmount.toFixed(2),
            totalPayable:   totalPayable.toFixed(2),
            tcs:            tcsDeduction.toFixed(2),
            sellerNetPayout: sellerNetPayout.toFixed(2),
            supplyType:     isInterState ? 'Inter-State' : 'Intra-State',
        };
    });
}

/**
 * Compute order-level totals from line items produced by generateInvoiceData.
 * @param {Array<object>} lineItems
 * @returns {object}
 */
function computeOrderTotals(lineItems) {
    const totals = lineItems.reduce((acc, li) => {
        acc.basePrice    += parseFloat(li.basePrice);
        acc.cgst         += parseFloat(li.cgst);
        acc.sgst         += parseFloat(li.sgst);
        acc.igst         += parseFloat(li.igst);
        acc.taxAmount    += parseFloat(li.taxAmount);
        acc.totalPayable += parseFloat(li.totalPayable);
        acc.tcs          += parseFloat(li.tcs);
        acc.sellerNetPayout += parseFloat(li.sellerNetPayout);
        return acc;
    }, { basePrice: 0, cgst: 0, sgst: 0, igst: 0, taxAmount: 0, totalPayable: 0, tcs: 0, sellerNetPayout: 0 });

    Object.keys(totals).forEach(k => { totals[k] = totals[k].toFixed(2); });
    return totals;
}

module.exports = { generateInvoiceData, computeOrderTotals, getGSTRate, HSN_GST_RATES };
