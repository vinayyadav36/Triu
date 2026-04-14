// ============================================
// EMAIL SERVICE — MailerSend HTTP API
// Replaces Appwrite email delivery
// API key: configured via MAILERSEND_API_KEY env var
// ============================================

const axios = require('axios');

const MAILERSEND_API = 'https://api.mailersend.com/v1/email';

/**
 * Low-level send using MailerSend REST API.
 * @param {object} opts
 * @param {string} opts.toEmail
 * @param {string} opts.toName
 * @param {string} opts.subject
 * @param {string} opts.text   – plain-text body
 * @param {string} [opts.html] – optional HTML body
 */
async function sendEmail({ toEmail, toName, subject, text, html }) {
    const apiKey  = process.env.MAILERSEND_API_KEY || '';
    const fromEmail = process.env.MAILERSEND_FROM_EMAIL || 'noreply@emproiumvipani.com';
    const fromName  = process.env.MAILERSEND_FROM_NAME  || 'EmproiumVipani';

    if (!apiKey) {
        console.warn('⚠️  MAILERSEND_API_KEY not set — skipping real email send');
        console.log(`📧 [DEV] Email to ${toEmail} | Subject: ${subject}`);
        console.log(`📧 [DEV] Body: ${text}`);
        return false;
    }

    const payload = {
        from: { email: fromEmail, name: fromName },
        to:   [{ email: toEmail, name: toName || toEmail }],
        subject,
        text,
        ...(html ? { html } : {}),
    };

    try {
        await axios.post(MAILERSEND_API, payload, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 10000,
        });
        console.log(`✅ Email sent via MailerSend to ${toEmail}`);
        return true;
    } catch (err) {
        const msg = err.response?.data?.message || err.message;
        console.warn(`⚠️  MailerSend send failed: ${msg}`);
        // Always fallback to console so OTPs can still be read in dev/test
        console.log(`📧 [FALLBACK] Email to ${toEmail} | Subject: ${subject}`);
        console.log(`📧 [FALLBACK] Body: ${text}`);
        return false;
    }
}

/**
 * Send an OTP code to the given email.
 * @param {string} toEmail
 * @param {string} otpCode
 * @param {string} purpose  – 'login' | 'register' | 'reset'
 */
async function sendOtpEmail(toEmail, otpCode, purpose = 'login') {
    const labels = { login: 'sign in', register: 'account creation', reset: 'password reset' };
    const label  = labels[purpose] || purpose;

    const subject = `Your ${label} OTP – EmproiumVipani`;
    const text    = [
        `Hi,`,
        ``,
        `Your one-time verification code for EmproiumVipani is:`,
        ``,
        `  ${otpCode}`,
        ``,
        `This code expires in 5 minutes. Do not share it with anyone.`,
        ``,
        `If you did not request this, please ignore this email.`,
        ``,
        `– Team EmproiumVipani`,
    ].join('\n');

    // Log to console so OTP is always available during development/testing
    console.log(`🔐 OTP for ${toEmail} (${purpose}): ${otpCode}`);

    return sendEmail({ toEmail, toName: toEmail.split('@')[0], subject, text });
}

/**
 * Send order confirmation email.
 * @param {string} toEmail
 * @param {object} order
 */
async function sendOrderConfirmation(toEmail, order) {
    const subject = `Order Confirmed – #${order.orderId} – EmproiumVipani`;
    const itemLines = (order.items || [])
        .map(i => `  • ${i.name} × ${i.quantity}  ₹${i.total}`)
        .join('\n');

    const text = [
        `Hi ${order.customerName},`,
        ``,
        `Your order has been placed successfully! 🎉`,
        ``,
        `Order ID : ${order.orderId}`,
        `Date     : ${new Date(order.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
        ``,
        `Items:`,
        itemLines,
        ``,
        `Subtotal : ₹${order.subtotal}`,
        `Shipping : ₹${order.shipping}`,
        `Discount : -₹${order.discount}`,
        `Total    : ₹${order.total}`,
        `Payment  : ${order.payment?.method || 'COD'}`,
        ``,
        `Delivery Address:`,
        `  ${order.deliveryAddress?.street}, ${order.deliveryAddress?.city} – ${order.deliveryAddress?.pincode}`,
        ``,
        `We'll notify you when your order ships.`,
        ``,
        `– Team EmproiumVipani`,
    ].join('\n');

    return sendEmail({ toEmail, toName: order.customerName, subject, text });
}

module.exports = { sendEmail, sendOtpEmail, sendOrderConfirmation };
