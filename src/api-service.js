// ============================================
// FRONTEND API SERVICE
// ============================================

const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:5000/api';

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

    async request(method, endpoint, data = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...( this.getToken() && { 'Authorization': `Bearer ${this.getToken()}` })
            }
        };

        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(`${API_URL}${endpoint}`, options);
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

    // ========== PRODUCT SINGLE ==========
    async getProduct(id) {
        return this.request('GET', `/products/${id}`);
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
    async requestOtp(identifier, purpose = 'login') {
        return this.request('POST', '/auth/otp/request', { identifier, purpose });
    }

    async verifyOtp(requestId, otp) {
        return this.request('POST', '/auth/otp/verify', { requestId, otp });
    }

    async partnerSendOTP(identifier, agentId) {
        return this.request('POST', '/auth/otp/send', { identifier, agentId });
    }

    async partnerVerifyOTP(identifier, otp, agentId) {
        return this.request('POST', '/auth/otp/verify', { identifier, otp, agentId });
    }

    async setSafeKey(key) {
        return this.request('POST', '/auth/set-key', { key });
    }

    async loginWithKey(identifier, key) {
        const result = await this.request('POST', '/auth/login-with-key', { identifier, key });
        if (result.token) this.setToken(result.token);
        return result;
    }

    async refreshToken() {
        return this.request('POST', '/auth/refresh');
    }

    logout() {
        this.clearToken();
    }
}

// Create global instance
window.api = new APIService();

console.log('✅ API Service initialized');
