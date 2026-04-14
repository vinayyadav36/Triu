'use strict';
/**
 * Multi-Sector Billing Engine Service
 * Supports: retail, food, petrol, hotel
 * Storage: JSON files via jsonDB utility
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../utils/jsonDB');

// ── GST rates by sector/category ─────────────────────────────────────────────
const GST_RATES = {
    food_restaurant: 5,
    food_delivery:   5,
    hotel_under7500: 12,
    hotel_over7500:  18,
    retail_clothing: 5,
    retail_electronics: 18,
    retail_default:  18,
    petrol:          0,  // petrol/diesel outside GST, dealer commission taxed separately
    default:         18,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function nowISO() { return new Date().toISOString(); }

function calcLineGst(amount, gstRate) {
    const gstAmt  = parseFloat(((amount * gstRate) / 100).toFixed(4));
    const halfGst = parseFloat((gstAmt / 2).toFixed(4));
    return { cgst: halfGst, sgst: halfGst, igst: 0, total: gstAmt };
}

function roundTo(val, decimals = 2) {
    return parseFloat(Number(val).toFixed(decimals));
}

// ── Session CRUD ──────────────────────────────────────────────────────────────

/**
 * Creates a new billing session for the given sector.
 * @param {'retail'|'food'|'petrol'|'hotel'} sector
 * @param {object} data  - { cashierId, customerId, customerName, customerPhone, notes, meta }
 * @returns {object} session
 */
function createBillingSession(sector, data = {}) {
    const validSectors = ['retail', 'food', 'petrol', 'hotel'];
    if (!validSectors.includes(sector)) {
        throw new Error(`Invalid sector: ${sector}. Must be one of ${validSectors.join(', ')}`);
    }
    const session = {
        id:            uuidv4(),
        sector,
        cashierId:     data.cashierId     || null,
        customerId:    data.customerId    || null,
        customerName:  data.customerName  || 'Walk-in',
        customerPhone: data.customerPhone || null,
        customerEmail: data.customerEmail || null,
        status:        'open',
        currency:      data.currency      || 'INR',
        items:         [],
        discounts:     [],
        payments:      [],
        sectorData:    {},      // sector-specific fields
        subtotal:      0,
        discountAmt:   0,
        taxAmt:        0,
        surchargeAmt:  0,
        totalAmt:      0,
        paidAmt:       0,
        changeDue:     0,
        notes:         data.notes || '',
        meta:          data.meta  || {},
        openedAt:      nowISO(),
        closedAt:      null,
        createdAt:     nowISO(),
    };

    db.create('billing_sessions', session);
    return session;
}

/**
 * Retrieves a billing session by id.
 * @param {string} sessionId
 * @returns {object}
 */
function getSession(sessionId) {
    const sessions = db.find('billing_sessions', s => s.id === sessionId);
    if (!sessions.length) throw new Error(`Session ${sessionId} not found`);
    return sessions[0];
}

/**
 * Persists updates to a session.
 * @param {string} sessionId
 * @param {object} updates
 * @returns {object} updated session
 */
function updateSession(sessionId, updates) {
    const sessions = db.find('billing_sessions', s => s.id === sessionId);
    if (!sessions.length) throw new Error(`Session ${sessionId} not found`);
    const updated = { ...sessions[0], ...updates };
    db.update('billing_sessions', s => s.id === sessionId, updated);
    return updated;
}

// ── Items ─────────────────────────────────────────────────────────────────────

/**
 * Adds an item to a session.
 * @param {string} sessionId
 * @param {object} item - { name, code, category, unit, quantity, unitPrice, gstRate, barcode, hsnCode, meta }
 * @returns {object} updated session
 */
function addItem(sessionId, item) {
    const session = getSession(sessionId);
    if (session.status !== 'open') throw new Error('Session is not open');

    const qty       = parseFloat(item.quantity  || 1);
    const unitPrice = parseFloat(item.unitPrice || item.unit_price || 0);
    const gstRate   = parseFloat(item.gstRate   || item.gst_rate   || GST_RATES.default);
    const discPct   = parseFloat(item.discountPct || 0);

    const grossAmt   = roundTo(qty * unitPrice, 4);
    const discAmt    = roundTo(grossAmt * discPct / 100, 4);
    const taxableAmt = roundTo(grossAmt - discAmt, 4);
    const gst        = calcLineGst(taxableAmt, gstRate);
    const lineTotal  = roundTo(taxableAmt + gst.total, 4);

    const lineItem = {
        id:          uuidv4(),
        lineNo:      session.items.length + 1,
        code:        item.code        || item.item_code || '',
        name:        item.name        || item.item_name || 'Item',
        category:    item.category    || '',
        unit:        item.unit        || 'pcs',
        barcode:     item.barcode     || '',
        hsnCode:     item.hsnCode     || item.hsn_code || '',
        quantity:    qty,
        unitPrice,
        discountPct: discPct,
        discountAmt: discAmt,
        taxableAmt,
        gstRate,
        cgstAmt:     gst.cgst,
        sgstAmt:     gst.sgst,
        igstAmt:     gst.igst,
        lineTotal,
        meta:        item.meta || {},
    };

    const updatedItems = [...session.items, lineItem];
    const calculated   = _recalcTotals({ ...session, items: updatedItems });
    return updateSession(sessionId, { items: updatedItems, ...calculated });
}

// ── Discounts ─────────────────────────────────────────────────────────────────

/**
 * Applies a discount to the session.
 * @param {string} sessionId
 * @param {object} discount - { type: 'flat'|'percent'|'loyalty'|'coupon', amount|percent, code, description }
 * @returns {object} updated session
 */
function applyDiscount(sessionId, discount) {
    const session = getSession(sessionId);
    if (session.status !== 'open') throw new Error('Session is not open');

    let discAmt = 0;
    if (discount.type === 'percent') {
        discAmt = roundTo(session.subtotal * parseFloat(discount.percent || 0) / 100, 2);
    } else {
        discAmt = roundTo(parseFloat(discount.amount || 0), 2);
    }

    const entry = {
        id:          uuidv4(),
        type:        discount.type || 'flat',
        code:        discount.code || '',
        description: discount.description || '',
        amount:      discAmt,
        appliedAt:   nowISO(),
    };

    const updatedDiscounts = [...session.discounts, entry];
    const totalDiscAmt     = updatedDiscounts.reduce((s, d) => s + d.amount, 0);
    const calculated       = _recalcTotals({ ...session, discounts: updatedDiscounts });
    return updateSession(sessionId, {
        discounts:   updatedDiscounts,
        discountAmt: roundTo(totalDiscAmt, 2),
        ...calculated,
    });
}

// ── Totals ────────────────────────────────────────────────────────────────────

function _recalcTotals(session) {
    const subtotal    = roundTo(session.items.reduce((s, i) => s + i.taxableAmt, 0), 2);
    const taxAmt      = roundTo(session.items.reduce((s, i) => s + i.cgstAmt + i.sgstAmt + i.igstAmt, 0), 2);
    const totalDisc   = roundTo((session.discounts || []).reduce((s, d) => s + d.amount, 0), 2);
    const surcharge   = roundTo(session.surchargeAmt || 0, 2);
    const totalAmt    = roundTo(Math.max(0, subtotal + taxAmt - totalDisc + surcharge), 2);
    return { subtotal, taxAmt, discountAmt: totalDisc, surchargeAmt: surcharge, totalAmt };
}

/**
 * Recalculates and returns the current totals for a session.
 * @param {string} sessionId
 * @returns {object} { subtotal, taxAmt, discountAmt, totalAmt }
 */
function calculateTotals(sessionId) {
    const session  = getSession(sessionId);
    const totals   = _recalcTotals(session);
    updateSession(sessionId, totals);
    return totals;
}

// ── Checkout ──────────────────────────────────────────────────────────────────

/**
 * Finalises the billing session.
 * @param {string} sessionId
 * @param {object} paymentData - { method: 'cash'|'card'|'upi', amount, reference, splits: [{method,amount}] }
 * @returns {object} finalised session
 */
function checkout(sessionId, paymentData) {
    const session = getSession(sessionId);
    if (session.status !== 'open') throw new Error(`Cannot checkout session in status: ${session.status}`);

    const totals   = _recalcTotals(session);
    const paidAmt  = roundTo(parseFloat(paymentData.amount || totals.totalAmt), 2);
    const changeDue = roundTo(Math.max(0, paidAmt - totals.totalAmt), 2);

    const payment = {
        id:        uuidv4(),
        method:    paymentData.method    || 'cash',
        reference: paymentData.reference || '',
        amount:    paidAmt,
        paidAt:    nowISO(),
    };

    const payments = [...session.payments, payment];
    if (paymentData.splits && Array.isArray(paymentData.splits)) {
        for (const split of paymentData.splits) {
            payments.push({ id: uuidv4(), method: split.method, reference: split.reference || '', amount: roundTo(split.amount, 2), paidAt: nowISO() });
        }
    }

    const updated = updateSession(sessionId, {
        ...totals,
        paidAmt,
        changeDue,
        payments,
        status:    'paid',
        closedAt:  nowISO(),
        paymentMethod: paymentData.method || 'cash',
    });

    // Archive to billing_history
    db.create('billing_history', { ...updated, archivedAt: nowISO() });
    return updated;
}

// ── Slip ──────────────────────────────────────────────────────────────────────

/**
 * Generates a plain-text receipt slip for a session.
 * @param {string} sessionId
 * @returns {string} formatted slip text
 */
function generateSlip(sessionId) {
    const s    = getSession(sessionId);
    const line = '─'.repeat(42);
    const dbl  = '═'.repeat(42);

    const pad = (label, value, width = 42) => {
        const l = String(label);
        const v = String(value);
        const spaces = Math.max(1, width - l.length - v.length);
        return l + ' '.repeat(spaces) + v;
    };

    const lines = [
        dbl,
        '          EMPROIUM VIPANI          '.padStart(42),
        `   ${s.sector.toUpperCase()} RECEIPT   `.padStart(42),
        dbl,
        pad('Bill No:', s.id.slice(0, 8).toUpperCase()),
        pad('Date:', new Date(s.openedAt).toLocaleString('en-IN')),
        pad('Customer:', s.customerName),
        s.customerPhone ? pad('Phone:', s.customerPhone) : null,
        line,
        pad('ITEM', 'TOTAL', 42),
        line,
        ...s.items.map(i =>
            `${i.name.substring(0, 22).padEnd(22)} ${String(i.quantity).padStart(4)} x ${String(i.unitPrice.toFixed(2)).padStart(8)} = ${String(i.lineTotal.toFixed(2)).padStart(8)}`
        ),
        line,
        pad('Subtotal:', `₹${s.subtotal.toFixed(2)}`),
        ...(s.discountAmt > 0 ? [pad('Discount:', `-₹${s.discountAmt.toFixed(2)}`)] : []),
        pad('GST:', `₹${s.taxAmt.toFixed(2)}`),
        ...(s.surchargeAmt > 0 ? [pad('Surcharge:', `₹${s.surchargeAmt.toFixed(2)}`)] : []),
        dbl,
        pad('TOTAL:', `₹${s.totalAmt.toFixed(2)}`),
        dbl,
        pad('Paid:', `₹${s.paidAmt.toFixed(2)}`),
        ...(s.changeDue > 0 ? [pad('Change:', `₹${s.changeDue.toFixed(2)}`)] : []),
        line,
        '     Thank you for your business!     ',
        '         Visit us again!              ',
        line,
    ].filter(Boolean);

    return lines.join('\n');
}

// ── Sector-specific methods ───────────────────────────────────────────────────

/**
 * Adds a fuel dispensing reading to a petrol billing session.
 * @param {string} sessionId
 * @param {object} data - { nozzleNo, pumpNo, fuelCode, openingReading, closingReading, vehicleNo, ratePerLitre }
 * @returns {object} updated session
 */
function addFuelReading(sessionId, data) {
    const session = getSession(sessionId);
    if (session.sector !== 'petrol') throw new Error('addFuelReading is only for petrol sessions');

    const volume    = roundTo(parseFloat(data.closingReading) - parseFloat(data.openingReading), 3);
    const unitPrice = parseFloat(data.ratePerLitre || 102.92);
    const fuelAmt   = roundTo(volume * unitPrice, 2);

    // Record meter reading in sector data
    const readings = session.sectorData.nozzleReadings || [];
    readings.push({
        id:              uuidv4(),
        nozzleNo:        data.nozzleNo,
        pumpNo:          data.pumpNo,
        fuelCode:        data.fuelCode || 'MS',
        openingReading:  parseFloat(data.openingReading),
        closingReading:  parseFloat(data.closingReading),
        volumeDispensed: volume,
        ratePerLitre:    unitPrice,
        amount:          fuelAmt,
        vehicleNo:       data.vehicleNo || '',
        recordedAt:      nowISO(),
    });
    updateSession(sessionId, { sectorData: { ...session.sectorData, nozzleReadings: readings } });

    return addItem(sessionId, {
        name:      `${data.fuelCode || 'Petrol'} - Pump ${data.pumpNo || ''} Nozzle ${data.nozzleNo || ''}`,
        code:      `FUEL-${data.fuelCode || 'MS'}`,
        category:  'fuel',
        unit:      'litre',
        quantity:  volume,
        unitPrice,
        gstRate:   0,
        meta:      { vehicleNo: data.vehicleNo || '', nozzleNo: data.nozzleNo, pumpNo: data.pumpNo },
    });
}

/**
 * Adds room rent + any extra charge to a hotel billing session.
 * @param {string} sessionId
 * @param {object} data - { roomNo, roomType, nights, ratePerNight, chargeType, description }
 * @returns {object} updated session
 */
function addRoomCharge(sessionId, data) {
    const session = getSession(sessionId);
    if (session.sector !== 'hotel') throw new Error('addRoomCharge is only for hotel sessions');

    const nights      = parseInt(data.nights || 1, 10);
    const ratePerNight = parseFloat(data.ratePerNight || 2500);
    const gstRate      = ratePerNight >= 7500 ? 18 : 12;
    const chargeType   = data.chargeType || 'room_rent';

    const roomCharges = session.sectorData.roomCharges || [];
    roomCharges.push({
        id:         uuidv4(),
        roomNo:     data.roomNo,
        roomType:   data.roomType  || 'STD',
        nights,
        ratePerNight,
        chargeType,
        addedAt:    nowISO(),
    });
    updateSession(sessionId, { sectorData: { ...session.sectorData, roomCharges } });

    return addItem(sessionId, {
        name:      `${chargeType === 'room_rent' ? 'Room Rent' : data.description || chargeType} - Room ${data.roomNo}`,
        code:      `ROOM-${data.roomNo}`,
        category:  chargeType,
        unit:      chargeType === 'room_rent' ? 'night' : 'pcs',
        quantity:  chargeType === 'room_rent' ? nights : (data.quantity || 1),
        unitPrice: ratePerNight,
        gstRate,
        meta:      { roomNo: data.roomNo, nights, chargeType },
    });
}

/**
 * Attaches rider/delivery info to a food billing session.
 * @param {string} sessionId
 * @param {object} data - { riderId, riderName, riderPhone, distanceKm, deliveryFee }
 * @returns {object} updated session
 */
function addRiderInfo(sessionId, data) {
    const session = getSession(sessionId);
    if (session.sector !== 'food') throw new Error('addRiderInfo is only for food sessions');

    const deliveryFee = parseFloat(data.deliveryFee || 0);
    const riderInfo   = {
        riderId:   data.riderId   || null,
        riderName: data.riderName || 'Rider',
        riderPhone: data.riderPhone || '',
        distanceKm: parseFloat(data.distanceKm || 0),
        deliveryFee,
        assignedAt: nowISO(),
    };

    updateSession(sessionId, { sectorData: { ...session.sectorData, riderInfo } });

    if (deliveryFee > 0) {
        return addItem(sessionId, {
            name:     `Delivery Fee (${riderInfo.distanceKm} km)`,
            code:     'DELIVERY',
            category: 'delivery',
            unit:     'trip',
            quantity: 1,
            unitPrice: deliveryFee,
            gstRate:  18,
            meta:     riderInfo,
        });
    }
    return getSession(sessionId);
}

// ── History ───────────────────────────────────────────────────────────────────

/**
 * Returns paginated billing history.
 * @param {object} filters - { sector, status, limit, offset }
 * @returns {{ data: object[], total: number }}
 */
function getBillingHistory(filters = {}) {
    const limit  = parseInt(filters.limit  || 50, 10);
    const offset = parseInt(filters.offset || 0,  10);

    let records = db.find('billing_history', () => true) || [];

    if (filters.sector) records = records.filter(r => r.sector === filters.sector);
    if (filters.status) records = records.filter(r => r.status === filters.status);

    // Sort newest first
    records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { data: records.slice(offset, offset + limit), total: records.length };
}

module.exports = {
    createBillingSession,
    getSession,
    addItem,
    applyDiscount,
    calculateTotals,
    checkout,
    generateSlip,
    addFuelReading,
    addRoomCharge,
    addRiderInfo,
    getBillingHistory,
};
