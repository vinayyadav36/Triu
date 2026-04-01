// ============================================
// EmproiumVipani — gst_billing.js
// Indian GST Tax Invoice Generator
// ============================================

'use strict';

// ── HSN Codes by product category ──────────────────────────
const HSN_CODES = {
  'Natural Products': '0910', // Spices, herbs
  'Stationery':       '4820', // Registers, notebooks
  'Worksheets':       '4901', // Printed books / educational sheets
  'Books':            '4901',
  'Electronics':      '8471',
  'Fashion':          '6211',
  'Home & Kitchen':   '7323',
  'Health & Beauty':  '3304',
  'Toys & Games':     '9503',
  'Art & Crafts':     '9608',
  'Sports & Outdoors':'9506',
  'Other':            '9999',
};

// ── GST Slab rates by category (%) ─────────────────────────
const GST_RATES = {
  'Natural Products': 5,
  'Worksheets':       0,
  'Books':            0,
  'Stationery':       12,
  'Electronics':      18,
  'Fashion':          12,
  'Home & Kitchen':   18,
  'Health & Beauty':  18,
  'Toys & Games':     28,
  'Art & Crafts':     12,
  'Sports & Outdoors':18,
  'Other':            18,
};

// ── Internal counter for sequential invoice numbers ────────
let _invoiceSeq = Number(
  (typeof localStorage !== 'undefined' && localStorage.getItem('ev_invoice_seq')) || 0
);

function _nextInvoiceNo() {
  _invoiceSeq += 1;
  if (typeof localStorage !== 'undefined') localStorage.setItem('ev_invoice_seq', String(_invoiceSeq));
  const yr  = new Date().getFullYear();
  const num = String(_invoiceSeq).padStart(5, '0');
  return `EV/${yr}-${yr + 1 - 2000}/${num}`;
}

// ── Tax calculation for a single line item ─────────────────
/**
 * @param {object} item        – { price, quantity, category }
 * @param {string} buyerState  – e.g. "Delhi"
 * @param {string} sellerState – defaults to "Delhi"
 * @returns TaxLine object
 */
function calcItemTax(item, buyerState, sellerState = 'Delhi') {
  const gstPct  = GST_RATES[item.category] ?? 18;
  const taxable = (item.price || 0) * (item.quantity || 1);
  const taxAmt  = taxable * (gstPct / 100);
  const intra   = buyerState &&
    buyerState.trim().toLowerCase() === sellerState.trim().toLowerCase();

  return {
    hsn:        HSN_CODES[item.category] || '9999',
    description: item.name || item.productName || 'Product',
    qty:        item.quantity || 1,
    unitPrice:  item.price || 0,
    taxable,
    gstRate:    gstPct,
    cgst:       intra ? taxAmt / 2 : 0,       // Central GST
    sgst:       intra ? taxAmt / 2 : 0,       // State GST
    igst:       intra ? 0        : taxAmt,    // Integrated GST
    totalTax:   taxAmt,
    lineTotal:  taxable + taxAmt,
  };
}

// ── Full invoice generator ──────────────────────────────────
/**
 * @param {object} opts
 * @param {Array}  opts.cart         – array of cart items
 * @param {object} opts.buyer        – { name, address, state, gstin?, email? }
 * @param {object} [opts.seller]     – { name, gstin, state, address }
 * @param {number} [opts.shipping]   – shipping charge (pre-tax)
 * @param {number} [opts.discount]   – discount amount
 */
function generateInvoice({ cart = [], buyer = {}, seller = {}, shipping = 0, discount = 0 }) {
  const invoiceNo   = _nextInvoiceNo();
  const invoiceDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const sellerState  = seller.state || 'Delhi';
  const buyerState   = buyer.state  || '';

  const lines = cart.map(item => calcItemTax(item, buyerState, sellerState));

  const sum = (key) => lines.reduce((a, l) => a + (l[key] || 0), 0);

  const taxable   = sum('taxable') + shipping - discount;
  const cgst      = sum('cgst');
  const sgst      = sum('sgst');
  const igst      = sum('igst');
  const totalTax  = cgst + sgst + igst;
  const grandTotal = taxable + totalTax;

  return {
    invoiceNo,
    invoiceDate,
    seller: {
      name:    seller.name    || 'EmproiumVipani',
      gstin:   seller.gstin   || 'TO_BE_REGISTERED',
      address: seller.address || 'New Delhi, India',
      state:   sellerState,
    },
    buyer: {
      name:    buyer.name    || 'Customer',
      address: buyer.address || '',
      state:   buyerState,
      gstin:   buyer.gstin   || 'UNREGISTERED',
      email:   buyer.email   || '',
    },
    lines,
    shipping,
    discount,
    totals: { taxable, cgst, sgst, igst, totalTax, grandTotal },
    supplyType: buyerState.toLowerCase() === sellerState.toLowerCase() ? 'Intra-State' : 'Inter-State',
  };
}

// ── Plain-text invoice renderer (for email / console) ──────
function renderTextInvoice(inv) {
  const r = (n) => `₹${Number(n).toFixed(2)}`;
  const hr = '─'.repeat(60);
  let out = [
    `TAX INVOICE`,
    hr,
    `Invoice No : ${inv.invoiceNo}`,
    `Date       : ${inv.invoiceDate}`,
    `Supply Type: ${inv.supplyType}`,
    ``,
    `SOLD BY`,
    `  ${inv.seller.name}  |  GSTIN: ${inv.seller.gstin}`,
    `  ${inv.seller.address}`,
    ``,
    `BILL TO`,
    `  ${inv.buyer.name}  |  GSTIN: ${inv.buyer.gstin}`,
    `  ${inv.buyer.address}  |  State: ${inv.buyer.state}`,
    hr,
    `${'HSN'.padEnd(6)} ${'Description'.padEnd(26)} ${'Qty'.padStart(4)} ${'Rate'.padStart(8)} ${'Taxable'.padStart(10)} ${'GST%'.padStart(6)} ${'Tax'.padStart(8)} ${'Total'.padStart(10)}`,
    hr,
    ...inv.lines.map(l =>
      `${l.hsn.padEnd(6)} ${l.description.substring(0, 26).padEnd(26)} ${String(l.qty).padStart(4)} ${r(l.unitPrice).padStart(8)} ${r(l.taxable).padStart(10)} ${String(l.gstRate + '%').padStart(6)} ${r(l.totalTax).padStart(8)} ${r(l.lineTotal).padStart(10)}`
    ),
    hr,
    `${'Taxable Amount'.padEnd(52)} ${r(inv.totals.taxable).padStart(10)}`,
    inv.totals.cgst ? `${'CGST'.padEnd(52)} ${r(inv.totals.cgst).padStart(10)}` : '',
    inv.totals.sgst ? `${'SGST'.padEnd(52)} ${r(inv.totals.sgst).padStart(10)}` : '',
    inv.totals.igst ? `${'IGST'.padEnd(52)} ${r(inv.totals.igst).padStart(10)}` : '',
    hr,
    `${'GRAND TOTAL'.padEnd(52)} ${r(inv.totals.grandTotal).padStart(10)}`,
    hr,
    `This is a computer-generated invoice.`,
  ].filter(l => l !== '').join('\n');
  return out;
}

// ── Exports ────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcItemTax, generateInvoice, renderTextInvoice, HSN_CODES, GST_RATES };
} else {
  window.GSTBillingStandalone = { calcItemTax, generateInvoice, renderTextInvoice, HSN_CODES, GST_RATES };
}
