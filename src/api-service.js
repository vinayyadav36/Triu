// ============================================
// FRONTEND API SERVICE
// ============================================

// Resolve API base URL.  This file is loaded as a plain <script> (not an ES
// module), so import.meta is unavailable.  Use a window-global injected by
// the build/server, or fall back to localhost for development.
const API_URL = (window.__ENV__ && window.__ENV__.VITE_API_URL)
    ? window.__ENV__.VITE_API_URL
    : 'http://localhost:5000/api';

// Resolve the full origin of our API to scope JWT attachment
const _API_ORIGIN = (() => {
    try { return new URL(API_URL).origin; } catch { return window.location.origin; }
})();

class APIService {
    constructor() {
        this.token = localStorage.getItem('emproium_token');
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('emproium_token', token);
    }

    getToken() {
        return localStorage.getItem('emproium_token');
    }

    clearToken() {
        localStorage.removeItem('emproium_token');
        this.token = null;
    }

    // ── Sanitisation ──────────────────────────────────────────────────────────
    /**
     * Strip all HTML/script from a string value using DOMPurify (loaded
     * synchronously in the page head).  If DOMPurify is somehow absent, the
     * fallback returns an empty string — safer than applying incomplete
     * regex-based sanitisation that may still pass XSS payloads.
     */
    _sanitize(value) {
        if (typeof value !== 'string') return value;
        if (window.DOMPurify) {
            return window.DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
        }
        // DOMPurify is missing (should never happen in normal operation).
        // Return an empty string rather than risk incomplete sanitisation.
        return '';
    }

    _sanitizePayload(data) {
        if (!data || typeof data !== 'object') return data;
        if (Array.isArray(data)) return data.map(item => this._sanitizePayload(item));
        const out = {};
        for (const [k, v] of Object.entries(data)) {
            out[k] = typeof v === 'string'  ? this._sanitize(v)
                   : typeof v === 'object'  ? this._sanitizePayload(v)
                   : v;
        }
        return out;
    }

    // ── Core request ──────────────────────────────────────────────────────────
    async request(method, endpoint, data = null) {
        const url = `${API_URL}${endpoint}`;

        // Only attach JWT when the request targets our own API origin (prevents token leaks to third-party CDNs etc.)
        const token = this.getToken();
        const isOwnApi = (() => {
            try { return new URL(url).origin === _API_ORIGIN; } catch { return true; }
        })();

        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(isOwnApi && token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            const sanitized = this._sanitizePayload(data);
            options.body = JSON.stringify(sanitized);
        }

        try {
            const response = await fetch(url, options);
            const result = await response.json();

            if (!response.ok) {
                const error = new Error(result.message || `HTTP ${response.status}`);
                error.status = response.status;
                error.data = result;
                throw error;
            }

            return result;
        } catch (error) {
            console.error(`❌ API Error [${method} ${endpoint}]:`, error);
            throw error;
        }
    }

    // ========== AUTH ENDPOINTS ==========
    // NOTE: The project is moving to pure OTP + key-based auth.
    // These password-based methods are kept only for backward compatibility
    // with any existing backend; new flows should use the OTP + key methods below.
    async register(name, email, phone, password, passwordConfirm) {
        const result = await this.request('POST', '/auth/register', {
            name,
            email,
            phone,
            password,
            passwordConfirm
        });
        if (result.token) {
            this.setToken(result.token);
        }
        return result;
    }
    
    async login(email, password) {
        const result = await this.request('POST', '/auth/login', {
            email,
            password
        });
        if (result.token) {
            this.setToken(result.token);
        }
        return result;
    }

    logout() {
        this.clearToken();
    }

    async verifyToken() {
        return this.request('POST', '/auth/verify-token');
    }

    // ---------- NEW: OTP + SAFE KEY AUTH FLOW ----------

    /**
     * Step 1: Request OTP for login / signup.
     * Backend should:
     *  - accept identifier (email or phone)
     *  - create/find user
     *  - send OTP via SMS/email
     *  - return { requestId }
     */
    async requestOtp(identifier, purpose = 'login') {
        return this.request('POST', '/auth/request-otp', {
            identifier,
            purpose
        });
    }

    /**
     * Step 2: Verify OTP code.
     * Backend should:
     *  - accept requestId + otpCode
     *  - mark user as verified
     *  - optionally return a short-lived token if needed
     */
    async verifyOtp(requestId, otpCode) {
        return this.request('POST', '/auth/verify-otp', {
            requestId,
            otpCode
        });
    }

    /**
     * Step 3 (first-time only): Set user safe key.
     * Backend should:
     *  - hash + salt the key
     *  - store hash server-side
     *  - return a long-lived JWT for SPA/mobile use
     */
    async setSafeKey(key) {
        const identifier = window.store?.state?.auth?.identifier;
        const result = await this.request('POST', '/auth/set-key', { identifier, key });
        if (result.token) {
            this.setToken(result.token);
        }
        return result;
    }

    /**
     * Step 4 (subsequent logins): Login with safe key.
     * Backend should:
     *  - authenticate with identifier + key against stored hash
     *  - return a JWT token & user object
     */
    async loginWithKey(identifier, key) {
        const result = await this.request('POST', '/auth/login-with-key', {
            identifier,
            key
        });
        if (result.token) {
            this.setToken(result.token);
        }
        return result;
    }

    /**
     * Extend current session by refreshing the JWT if still valid.
     */
    async refreshToken() {
        const result = await this.request('POST', '/auth/refresh-token');
        if (result.token) {
            this.setToken(result.token);
        }
        return result;
    }

    // ========== PRODUCTS ENDPOINTS ==========
    async getProducts(filters = {}) {
        const params = new URLSearchParams(filters);
        return this.request('GET', `/products?${params}`);
    }

    async getProduct(id) {
        return this.request('GET', `/products/${id}`);
    }

    async createProduct(productData) {
        return this.request('POST', '/products', productData);
    }

    async updateProduct(id, productData) {
        return this.request('PUT', `/products/${id}`, productData);
    }

    // ========== ORDERS ENDPOINTS ==========
    async createOrder(orderData) {
        return this.request('POST', '/orders', orderData);
    }

    async getOrders(status = null) {
        const endpoint = status ? `/orders?status=${status}` : '/orders';
        return this.request('GET', endpoint);
    }

    async getOrder(id) {
        return this.request('GET', `/orders/${id}`);
    }

    async cancelOrder(id) {
        return this.request('PUT', `/orders/${id}/cancel`);
    }

    // ========== SELLERS ENDPOINTS ==========
    async applySeller(sellerData) {
        return this.request('POST', '/sellers/apply', sellerData);
    }

    async getSellers(status = 'approved') {
        return this.request('GET', `/sellers?status=${status}`);
    }

    async getSeller(id) {
        return this.request('GET', `/sellers/${id}`);
    }

    async getSellerProducts(id) {
        return this.request('GET', `/sellers/${id}/products`);
    }

    // ========== USERS ENDPOINTS ==========
    async getProfile() {
        return this.request('GET', '/users/profile');
    }

    async updateProfile(profileData) {
        return this.request('PUT', '/users/profile', profileData);
    }

    async getWishlist() {
        return this.request('GET', '/users/wishlist');
    }

    async toggleWishlist(productId) {
        return this.request('POST', `/users/wishlist/${productId}`);
    }

    // ========== PAYMENTS ENDPOINTS ==========
    async createRazorpayOrder(orderId, amount) {
        return this.request('POST', '/payments/razorpay/create', {
            orderId,
            amount
        });
    }

    async verifyPayment(paymentData) {
        return this.request('POST', '/payments/razorpay/verify', paymentData);
    }

    // ========== ADMIN ENDPOINTS ==========
    async getAdminDashboard() {
        return this.request('GET', '/admin/dashboard');
    }

    async getPendingSellers() {
        return this.request('GET', '/admin/sellers/pending');
    }

    async approveSeller(id) {
        return this.request('PUT', `/admin/sellers/${id}/approve`);
    }

    async rejectSeller(id) {
        return this.request('PUT', `/admin/sellers/${id}/reject`);
    }

    // ========== CART SYNC ENDPOINTS ==========
    async addToCart(productId, quantity = 1) {
        return this.request('POST', '/cart', { productId, quantity });
    }

    async removeFromCart(productId) {
        return this.request('DELETE', `/cart/${productId}`);
    }

    // ========== GEO / LOCATION ==========
    async getProductsByLocation(lat, lng, radius = 50) {
        return this.request('GET', `/products/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
    }

    // ========== AUCTIONS ==========
    async getAuctions(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return this.request('GET', `/auctions${qs ? '?' + qs : ''}`);
    }

    async getAuction(id) {
        return this.request('GET', `/auctions/${id}`);
    }

    async placeBid(auctionId, amount) {
        return this.request('POST', `/auctions/${auctionId}/bid`, { amount });
    }

    // ========== REVIEWS ==========
    async getReviews(productId) {
        return this.request('GET', `/products/${productId}/reviews`);
    }

    async submitReview(productId, rating, comment) {
        return this.request('POST', `/products/${productId}/reviews`, { rating, comment });
    }

    // ========== AGENT / LOGISTICS ==========
    async getDeliveryQueue(agentId) {
        return this.request('GET', `/agents/${agentId}/deliveries`);
    }

    async pingAgentLocation(agentId, lat, lng) {
        return this.request('POST', `/agents/${agentId}/location`, { lat, lng });
    }

    async updateDeliveryStatus(agentId, orderId, status) {
        return this.request('PUT', `/agents/${agentId}/deliveries/${orderId}`, { status });
    }

    // ========== PARTNER / DROPSHIPPER ==========
    async getPartnerDashboard(agentId) {
        return this.request('GET', `/partners/${agentId}/dashboard`);
    }

    async getPartnerLeads(agentId) {
        return this.request('GET', `/partners/${agentId}/leads`);
    }

    async addPartnerLead(agentId, leadData) {
        return this.request('POST', `/partners/${agentId}/leads`, leadData);
    }

    async getPartnerCommissions(agentId) {
        return this.request('GET', `/partners/${agentId}/commissions`);
    }

    async requestPartnerPayout(agentId) {
        return this.request('POST', `/partners/${agentId}/payout`);
    }

    // ========== ADMIN COMMAND CENTRE ==========
    async getAdminCRM() {
        return this.request('GET', '/admin/crm');
    }

    async getAdminOrders(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return this.request('GET', `/admin/orders${qs ? '?' + qs : ''}`);
    }

    async getAdminPartners() {
        return this.request('GET', '/admin/partners');
    }

    async getPartnerLeadsAdmin() {
        return this.request('GET', '/admin/partner-leads');
    }

    async approvePartner(leadId) {
        return this.request('POST', `/admin/partner-leads/${leadId}/approve`);
    }

    async rejectPartnerLead(leadId) {
        return this.request('DELETE', `/admin/partner-leads/${leadId}`);
    }

    async blockUser(userId) {
        return this.request('PUT', `/admin/users/${userId}/block`);
    }

    async issueRefund(orderId) {
        return this.request('POST', `/admin/orders/${orderId}/refund`);
    }

    async runResearch() {
        return this.request('POST', '/admin/run-research');
    }

    async getPowerBIExport() {
        return `${API_URL}/admin/export/powerbi?token=${this.getToken()}`;
    }

    async getGSTReport(month, year) {
        return this.request('GET', `/admin/gst-report?month=${month}&year=${year}`);
    }

    async createSaleFromPOS(saleData) {
        return this.request('POST', '/admin/sales', saleData);
    }

    async getAdminSessions() {
        return this.request('GET', '/admin/sessions');
    }

    async terminateSession(sessionId) {
        return this.request('DELETE', `/admin/sessions/${sessionId}`);
    }

    // ========== OTP AUTH (Gromo-style for partners) ==========
    async partnerSendOTP(identifier, agentId) {
        return this.request('POST', '/auth/otp/send', { identifier, agentId });
    }

    async partnerVerifyOTP(identifier, otp, agentId) {
        return this.request('POST', '/auth/otp/verify', { identifier, otp, agentId });
    }

    // ========== AI CONCIERGE SEARCH ==========
    /**
     * Intent-based semantic search (vector search with text fallback).
     * @param {string} query  - Natural language query, e.g. "something for a beach wedding"
     * @param {object} opts   - { limit, boostCategory }
     */
    async searchConcierge(query, opts = {}) {
        return this.request('POST', '/search/concierge', {
            query,
            limit:         opts.limit         || 10,
            boostCategory: opts.boostCategory  || null,
        });
    }

    // ========== PERSONALISED PRODUCTS ==========
    /**
     * Fetch products with hyper-personalised category boosting.
     * Reads the top category from Alpine.store('interests') automatically.
     * @param {object} filters - standard product filters
     */
    async getPersonalizedProducts(filters = {}) {
        const primaryCategory = (() => {
            try {
                return window.Alpine?.store('interests')?.getPrimaryCategory() || null;
            } catch { return null; }
        })();
        const params = new URLSearchParams({
            ...filters,
            ...(primaryCategory ? { boostCategory: primaryCategory } : {}),
        });
        return this.request('GET', `/products?${params}`);
    }

    // ── Jarvis AI ──────────────────────────────────────────────────────────────
    async askJarvis(query, context = {}) {
        return this.request('POST', '/jarvis/ask', { query, context });
    }

    async getJarvisAlerts() {
        return this.request('GET', '/jarvis/alerts');
    }

    async getRecommendations() {
        return this.request('GET', `/jarvis/recommendations/${this.getUserId()}`);
    }

    async getTrendingProducts() {
        return this.request('GET', '/jarvis/trending');
    }

    getUserId() {
        try {
            const token = this.getToken();
            if (!token) return null;
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.userId;
        } catch { return null; }
    }

    // ── GST ────────────────────────────────────────────────────────────────────
    async getGSTRate(hsnCode) {
        return this.request('GET', `/gst/rate/${hsnCode}`);
    }

    async calculateGST(amount, hsnCode, sellerState, buyerState) {
        return this.request('POST', '/gst/calculate', { amount, hsnCode, sellerState, buyerState });
    }

    async getGSTReturn(sellerId, month, year) {
        return this.request('GET', `/gst/return/${sellerId}/${month}/${year}`);
    }

    // ── Ledger ─────────────────────────────────────────────────────────────────
    async getLedgerStatement(accountId, fromDate, toDate) {
        const params = new URLSearchParams({ fromDate, toDate }).toString();
        return this.request('GET', `/ledger/statement/${accountId}?${params}`);
    }

    async triggerSettlement(sellerId) {
        return this.request('POST', `/ledger/settlement/${sellerId}`);
    }
}

// Create global instance
window.api = new APIService();

console.log('✅ API Service initialized');
