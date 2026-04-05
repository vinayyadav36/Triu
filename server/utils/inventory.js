'use strict';

// ============================================
// INVENTORY UTILITY — Predictive stock management
// ============================================

/**
 * Calculate how many days of stock remain based on recent sales history.
 * Requires at least 7 days of data for a reliable velocity estimate.
 *
 * @param {Array<{date: string|Date, unitsSold: number}>} salesHistory
 * @param {number} currentStock - Current units in warehouse
 * @returns {number|null} Days until stockout, Infinity if velocity is zero, null if insufficient data
 */
function calculateDaysRemaining(salesHistory, currentStock) {
    if (!Array.isArray(salesHistory) || salesHistory.length < 7) return null;
    if (typeof currentStock !== 'number' || currentStock < 0) return null;

    const totalSold = salesHistory.reduce((sum, day) => sum + (Number(day.unitsSold) || 0), 0);
    const averageDailyVelocity = totalSold / salesHistory.length;

    if (averageDailyVelocity === 0) return Infinity;
    return Math.floor(currentStock / averageDailyVelocity);
}

/**
 * Determine whether a restock alert should be raised.
 *
 * @param {number|null} daysRemaining - Result of calculateDaysRemaining
 * @param {number} leadTimeDays - Supplier lead time in days (default 7)
 * @returns {{ urgent: boolean, warning: boolean, message: string }}
 */
function inventoryAlert(daysRemaining, leadTimeDays = 7) {
    const SAFETY_BUFFER_DAYS = 2; // extra cushion beyond lead time before raising a warning

    if (daysRemaining === null) return { urgent: false, warning: false, message: 'Insufficient sales data for prediction.' };
    if (daysRemaining === Infinity) return { urgent: false, warning: false, message: 'No sales velocity detected.' };

    const warningThreshold = leadTimeDays + SAFETY_BUFFER_DAYS;
    if (daysRemaining < leadTimeDays) {
        return {
            urgent: true,
            warning: true,
            message: `⚠️ Reorder NOW — stock runs out in ${daysRemaining} day(s), but your supplier takes ${leadTimeDays} days to deliver.`,
        };
    }
    if (daysRemaining < warningThreshold) {
        return {
            urgent: false,
            warning: true,
            message: `Stock covers ~${daysRemaining} day(s). Consider reordering soon.`,
        };
    }
    return { urgent: false, warning: false, message: `Stock healthy — ~${daysRemaining} day(s) remaining.` };
}

module.exports = { calculateDaysRemaining, inventoryAlert };
