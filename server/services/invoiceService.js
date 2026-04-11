// ============================================
// INVOICE SERVICE — GST-compliant invoice generation
// ============================================
const db         = require('../utils/jsonDB');
const gstEngine  = require('./gstEngine');
const { v4: uuidv4 } = require('uuid');

const COLLECTION = 'invoices';

// ── IRN generator ─────────────────────────────────────────────────────────────
function generateIRN(sellerId, invoiceNo, date) {
    const dateStr = new Date(date).toISOString().slice(0, 10).replace(/-/g, '');
    return `IRN${sellerId.slice(0, 6).toUpperCase()}${invoiceNo}${dateStr}`;
}

// ── QR data string ────────────────────────────────────────────────────────────
function generateQRData(invoice) {
    return [
        invoice.sellerGstin || 'NA',
        invoice.buyerGstin  || 'NA',
        invoice.invoiceNumber,
        invoice.invoiceDate,
        invoice.totalAmount,
        invoice.irn,
    ].join('|');
}

// ── Main invoice generator ────────────────────────────────────────────────────
function generateInvoice(order, seller, buyer) {
    const invoiceNumber = `INV-${Date.now()}-${uuidv4().slice(0, 6).toUpperCase()}`;
    const invoiceDate   = new Date().toISOString();

    const sellerState = seller?.address?.state || seller?.state || 'Maharashtra';
    const buyerState  = order.deliveryAddress?.state || buyer?.address?.state || '';

    // Calculate GST for each line item
    const lineItems = (order.items || []).map(item => {
        const hsnCode = item.hsnCode || null;
        const gst     = gstEngine.calculateGST(item.total || item.price * item.quantity, hsnCode, sellerState, buyerState);
        return {
            description: item.name,
            hsnCode:     hsnCode || '9999',
            quantity:    item.quantity,
            unitPrice:   item.price,
            totalPrice:  item.total || item.price * item.quantity,
            rate:        gst.rate,
            cgst:        gst.cgst,
            sgst:        gst.sgst,
            igst:        gst.igst,
            gstAmount:   gst.totalGst,
        };
    });

    const subtotal   = lineItems.reduce((s, i) => s + i.totalPrice, 0);
    const totalCgst  = lineItems.reduce((s, i) => s + i.cgst, 0);
    const totalSgst  = lineItems.reduce((s, i) => s + i.sgst, 0);
    const totalIgst  = lineItems.reduce((s, i) => s + i.igst, 0);
    const totalGst   = parseFloat((totalCgst + totalSgst + totalIgst).toFixed(2));
    const totalAmount = parseFloat((subtotal + totalGst).toFixed(2));

    const irn = generateIRN(seller?.id || 'UNK', invoiceNumber, invoiceDate);

    const invoice = {
        invoiceNumber,
        invoiceDate,
        irn,
        orderId:      order.id,
        sellerId:     seller?.id || order.sellerId || '',
        buyerId:      buyer?.id  || order.userId   || '',
        sellerName:   seller?.seller?.businessName || seller?.name || '',
        sellerGstin:  seller?.seller?.gstNumber    || '',
        sellerAddress: seller?.address || {},
        buyerName:    buyer?.name  || '',
        buyerGstin:   buyer?.gstin || '',
        buyerAddress: order.deliveryAddress || {},
        placeOfSupply: buyerState || sellerState,
        lineItems,
        subtotal:     parseFloat(subtotal.toFixed(2)),
        totalCgst:    parseFloat(totalCgst.toFixed(2)),
        totalSgst:    parseFloat(totalSgst.toFixed(2)),
        totalIgst:    parseFloat(totalIgst.toFixed(2)),
        totalGst,
        totalAmount,
        currency:     'INR',
        status:       'generated',
    };

    invoice.qrData = generateQRData(invoice);

    const stored = db.create(COLLECTION, invoice);
    return stored;
}

// ── Retrieval ─────────────────────────────────────────────────────────────────
function getInvoice(invoiceId) {
    return db.findById(COLLECTION, invoiceId);
}

function listInvoices(sellerId, filters = {}) {
    let invoices = db.find(COLLECTION, inv => inv.sellerId === sellerId);

    if (filters.fromDate) {
        const from = new Date(filters.fromDate).getTime();
        invoices = invoices.filter(inv => new Date(inv.invoiceDate).getTime() >= from);
    }
    if (filters.toDate) {
        const to = new Date(filters.toDate).getTime();
        invoices = invoices.filter(inv => new Date(inv.invoiceDate).getTime() <= to);
    }
    if (filters.status) {
        invoices = invoices.filter(inv => inv.status === filters.status);
    }

    invoices.sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate));
    return invoices;
}

module.exports = {
    generateInvoice,
    getInvoice,
    listInvoices,
    generateIRN,
    generateQRData,
};
