// =============================================================
// EmporiumVipani — src/billing-engine.js
// Smart GST Billing Engine
// Usage: <script src="billing-engine.js"></script>
//        then: BillingEngine.generateInvoice({...})
// =============================================================
'use strict';

const BillingEngine = (() => {

  // ── HSN codes + GST slabs ─────────────────────────────────────
  const HSN = {
    'Natural Products': '0910', 'Stationery': '4820', 'Worksheets': '4901',
    'Books': '4901', 'Electronics': '8471', 'Fashion': '6211',
    'Home & Kitchen': '7323', 'Health & Beauty': '3304', 'Toys & Games': '9503',
    'Art & Crafts': '9608', 'Sports & Outdoors': '9506', 'Other': '9999',
  };

  const GST_SLAB = {
    'Natural Products': 5, 'Worksheets': 0, 'Books': 0, 'Stationery': 12,
    'Electronics': 18, 'Fashion': 12, 'Home & Kitchen': 18, 'Health & Beauty': 18,
    'Toys & Games': 28, 'Art & Crafts': 12, 'Sports & Outdoors': 18, 'Other': 18,
  };

  // ── Invoice number counter ────────────────────────────────────
  function _nextInvoiceNo() {
    const key = 'ev_inv_seq';
    const seq = Number(localStorage.getItem(key) || 0) + 1;
    localStorage.setItem(key, String(seq));
    const yr = new Date().getFullYear();
    return `EV/${yr}-${yr - 1999}/${String(seq).padStart(5, '0')}`;
  }

  // ── Tax line calculation ──────────────────────────────────────
  function calcLine(item, buyerState, sellerState) {
    const gstPct  = GST_SLAB[item.category] ?? 18;
    const taxable = (item.price || 0) * (item.qty || item.quantity || 1);
    const taxAmt  = taxable * (gstPct / 100);
    const intra   = buyerState && sellerState &&
      buyerState.trim().toLowerCase() === sellerState.trim().toLowerCase();
    return {
      hsn:        HSN[item.category] || '9999',
      name:       item.name,
      category:   item.category,
      qty:        item.qty || item.quantity || 1,
      unitPrice:  item.price || 0,
      taxable,
      gstRate:    gstPct,
      cgst:       intra ? +(taxAmt / 2).toFixed(2) : 0,
      sgst:       intra ? +(taxAmt / 2).toFixed(2) : 0,
      igst:       intra ? 0 : +taxAmt.toFixed(2),
      totalTax:   +taxAmt.toFixed(2),
      lineTotal:  +(taxable + taxAmt).toFixed(2),
      supplyType: intra ? 'Intra-State' : 'Inter-State',
    };
  }

  // ── Commission calculator ─────────────────────────────────────
  function calcCommission(taxable, partnerTier = 'Bronze') {
    const rates = { Bronze: 0.05, Silver: 0.08, Gold: 0.10, Platinum: 0.12 };
    const rate  = rates[partnerTier] || 0.05;
    return +(taxable * rate).toFixed(2);
  }

  // ── Full invoice generator ────────────────────────────────────
  /**
   * @param {object} opts
   * @param {Array}  opts.items        – cart items [{name, price, qty, category}]
   * @param {object} opts.buyer        – {name, address, state, gstin?, email?}
   * @param {string} [opts.agentId]    – partner Agent ID for commission
   * @param {string} [opts.source]     – 'Google Ads' | 'Referral' | 'Direct'
   * @param {object} [opts.seller]     – {name, gstin, state, address}
   * @param {number} [opts.shipping]   – shipping charge (pre-tax, exempt)
   * @param {number} [opts.discount]   – discount amount
   * @param {string} [opts.partnerTier]– Bronze/Silver/Gold/Platinum
   */
  function generateInvoice({ items = [], buyer = {}, agentId = null, source = 'Direct',
    seller = {}, shipping = 0, discount = 0, partnerTier = 'Bronze' }) {

    const sellerState = seller.state || 'Delhi';
    const buyerState  = buyer.state  || '';

    const lines     = items.map(i => calcLine(i, buyerState, sellerState));
    const sub       = (key) => lines.reduce((a, l) => a + (l[key] || 0), 0);

    const taxableAmt = sub('taxable') + shipping - discount;
    const cgst       = +sub('cgst').toFixed(2);
    const sgst       = +sub('sgst').toFixed(2);
    const igst       = +sub('igst').toFixed(2);
    const totalGst   = +(cgst + sgst + igst).toFixed(2);
    const grandTotal = +(taxableAmt + totalGst).toFixed(2);
    const commission = agentId ? calcCommission(taxableAmt, partnerTier) : 0;

    return {
      invoice_no:  _nextInvoiceNo(),
      date:        new Date().toISOString().split('T')[0],
      agent_id:    agentId,
      source,
      seller: {
        name:    seller.name    || 'EmproiumVipani',
        gstin:   seller.gstin   || 'TO_BE_REGISTERED',
        address: seller.address || 'New Delhi, India',
        state:   sellerState,
      },
      customer: {
        name:    buyer.name    || '',
        address: buyer.address || '',
        state:   buyerState,
        gstin:   buyer.gstin   || 'UNREGISTERED',
        email:   buyer.email   || '',
      },
      items: lines,
      tax_breakup: { cgst, sgst, igst, total_gst: totalGst },
      shipping,
      discount,
      commission,
      net_total:   grandTotal,
      supply_type: buyerState.toLowerCase() === sellerState.toLowerCase() ? 'Intra-State' : 'Inter-State',
    };
  }

  // ── Live preview (real-time as user types in POS form) ────────
  function livePreview(items, buyerState, sellerState = 'Delhi') {
    if (!items || !items.length) return { lines: [], totals: { taxable: 0, cgst: 0, sgst: 0, igst: 0, totalGst: 0, grandTotal: 0 } };
    const lines = items.map(i => calcLine(i, buyerState, sellerState));
    const sum   = (k) => +lines.reduce((a, l) => a + (l[k] || 0), 0).toFixed(2);
    const cgst  = sum('cgst'), sgst = sum('sgst'), igst = sum('igst');
    return { lines, totals: { taxable: sum('taxable'), cgst, sgst, igst, totalGst: +(cgst+sgst+igst).toFixed(2), grandTotal: +(sum('taxable')+cgst+sgst+igst).toFixed(2) }};
  }

  // ── Print / save invoice as text ─────────────────────────────
  function printInvoice(inv) {
    const r  = n => `₹${Number(n).toFixed(2)}`;
    const hr = '─'.repeat(64);
    const lines = [
      'TAX INVOICE', hr,
      `Invoice : ${inv.invoice_no}   Date: ${inv.date}   Type: ${inv.supply_type}`,
      `Agent ID: ${inv.agent_id || 'N/A'}   Source: ${inv.source || 'Direct'}`,
      '',
      `SOLD BY : ${inv.seller.name} | GSTIN: ${inv.seller.gstin} | ${inv.seller.state}`,
      `BILL TO : ${inv.customer.name} | GSTIN: ${inv.customer.gstin} | ${inv.customer.state}`,
      hr,
      `${'HSN'.padEnd(6)} ${'Description'.padEnd(28)} ${'Qty'.padStart(4)} ${'Rate'.padStart(8)} ${'Taxable'.padStart(9)} ${'GST%'.padStart(5)} ${'Tax'.padStart(8)} ${'Total'.padStart(9)}`,
      hr,
      ...inv.items.map(l =>
        `${l.hsn.padEnd(6)} ${(l.name||'').substring(0,28).padEnd(28)} ${String(l.qty).padStart(4)} ${r(l.unitPrice).padStart(8)} ${r(l.taxable).padStart(9)} ${String(l.gstRate+'%').padStart(5)} ${r(l.totalTax).padStart(8)} ${r(l.lineTotal).padStart(9)}`
      ),
      hr,
      `${'Taxable Amount'.padEnd(56)} ${r(inv.net_total - inv.tax_breakup.total_gst).padStart(9)}`,
      inv.tax_breakup.cgst ? `${'CGST'.padEnd(56)} ${r(inv.tax_breakup.cgst).padStart(9)}` : '',
      inv.tax_breakup.sgst ? `${'SGST'.padEnd(56)} ${r(inv.tax_breakup.sgst).padStart(9)}` : '',
      inv.tax_breakup.igst ? `${'IGST'.padEnd(56)} ${r(inv.tax_breakup.igst).padStart(9)}` : '',
      hr,
      `${'GRAND TOTAL'.padEnd(56)} ${r(inv.net_total).padStart(9)}`,
      inv.commission ? `${'Partner Commission'.padEnd(56)} ${r(inv.commission).padStart(9)}` : '',
      hr,
      'This is a computer-generated invoice — EmproiumVipani',
    ].filter(Boolean).join('\n');
    return lines;
  }

  return { generateInvoice, livePreview, printInvoice, calcLine, calcCommission, HSN, GST_SLAB };
})();

window.BillingEngine = BillingEngine;
console.log('✅ BillingEngine loaded');
