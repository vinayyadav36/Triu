// ============================================
// EMPROIUMVIPANI - COMPLETE APP.JS
// Alpine.js Store + Logic (Production-Ready)
// ============================================

// Import Alpine (already loaded via CDN)
// window.Alpine is available globally

// ============================================
// 1. GLOBAL STORE (Redux-like State Management)
// ============================================
class AppStore {
    constructor() {
        this.state = {
            // User & Auth
            user: null,
            isLoggedIn: false,
            sessionExpiresAt: null,
            auth: {
                // For OTP + key flow
                otpRequestId: null,
                otpStage: 'idle', // 'idle' | 'awaiting_otp' | 'set_key' | 'login_with_key'
                identifier: '',   // email or phone used for login
                // Session management
                sessionWarningShown: false,
                showSessionExtend: false,
                // Contextual auth — stores intent when a guarded action triggers login
                pendingAction: null,       // function to call after successful login
                authContext: null,         // human-readable reason shown in login modal
                authContextAction: null,   // short label of the action (e.g. 'checkout')
            },

            // Guest session — generated once per device, persisted in localStorage
            guestSessionId: null,

            // Account & dashboard data
            account: {
                view: 'overview', // 'overview' | 'orders' | 'seller' | 'bookkeeping'
                profile: null,
                orders: [],
                sellerProducts: [],
                adminDashboard: null,
                pendingSellers: [],
                loading: {
                    profile: false,
                    orders: false,
                    seller: false,
                    admin: false
                },
                bookkeeping: {
                    totalRevenue: 89450,
                    commissionsPaid: 16820,
                    netEarnings: 70920,
                    tdsDeducted: 1789,
                    monthly: [
                        { month: 'Aug 2024', orders: 23, revenue: 12400, commission: 2480, tds: 310, net: 9610 },
                        { month: 'Sep 2024', orders: 31, revenue: 16200, commission: 3240, tds: 405, net: 12555 },
                        { month: 'Oct 2024', orders: 28, revenue: 14800, commission: 2960, tds: 370, net: 11470 },
                        { month: 'Nov 2024', orders: 35, revenue: 18500, commission: 3700, tds: 462, net: 14338 },
                        { month: 'Dec 2024', orders: 42, revenue: 22100, commission: 4420, tds: 552, net: 17128 },
                        { month: 'Jan 2025', orders: 19, revenue: 5450,  commission: 1020, tds: 136, net: 4294  }
                    ]
                }
            },
            
            // Cart
            cart: [],
            greenShipping: false,   // Green checkout offset toggle
            cartOpen: false,
            
            // Products & Filters
            products: [],
            sellers: [],
            filteredProducts: [],
            filters: {
                category: 'all',
                search: '',
                sortBy: 'relevance',
                condition: 'all'  // New/Refurbished/Used
            },
            selectedProduct: null,

            // UI State
            modals: {
                seller: false,
                login: false,
                cart: false,
                checkout: false
            },

            // Loading States
            loading: {
                products: false,
                checkout: false,
                order: false
            },

            // Order Confirmation
            lastOrder: null,

            // Mobile
            mobileMenuOpen: false,

            // Wishlist (persisted)
            wishlist: [],

            // Escrow payment tracker
            escrow: { status: null, orderId: null, history: [] },

            // Real-time order status (WebSocket driven)
            realtimeOrderStatus: null,

            // SPA Routing
            currentRoute: '/',
            currentRouteParams: {},
            routeLoading: false,

            // Geo-location service
            location: { lat: null, lng: null, city: null, radius: 50 },

            // Auction listings
            auctions: [],

            // Agent / Logistics
            agent: { deliveryQueue: [], currentLocation: null, isOnline: false },

            // Partner / Dropshipper
            partner: { agentId: null, leads: [], commissions: { pending: 0, earned: 0, paid: 0 }, tier: 'Bronze' },

            // Prefetch cache (productId → data)
            _prefetchCache: {},
        };
        
        this.listeners = [];
        this.init();
    }
    
    init() {
        this.loadFromStorage();
        this.loadInitialData();
    }
    
    // ========== Initial Data Loading (API-first with graceful fallback) ==========
    async loadInitialData() {
        // Try loading from backend API first; fall back to local seed data on failure
        this.state.loading.products = true;
        this.notify();

        try {
            const api = window.api;

            if (!api || typeof api.getProducts !== 'function' || typeof api.getSellers !== 'function') {
                console.warn('⚠️ API service not available, using local seed data');
                this.seedData();
                return;
            }

            const [productsResponse, sellersResponse] = await Promise.all([
                api.getProducts({ limit: 60 }),
                api.getSellers('approved')
            ]);

            const rawProducts = productsResponse?.data || [];
            const rawSellers = sellersResponse?.data || [];

            // Normalize sellers
            const sellers = rawSellers.map((s) => ({
                id: s._id,
                name: s.name,
                status: s.seller?.status || 'approved',
                rating: 0,
                desc: s.seller?.description || '',
                avatar: (s.name || 'S').charAt(0).toUpperCase(),
                verified: !!s.seller?.verified,
                location: s.seller?.businessType || 'Seller'
            }));

            // Index sellers by id for quick lookup
            const sellerMap = new Map(sellers.map((s) => [String(s.id), s]));

            // Normalize products into the shape the UI expects
            const products = rawProducts.map((p) => {
                const sellerId = (p.sellerId && (p.sellerId._id || p.sellerId)) || null;
                const seller = sellerMap.get(String(sellerId));

                // Choose a simple emoji avatar based on category if thumbnail is not present
                const defaultEmojiByCategory = {
                    'Natural Products': '🌿',
                    'Stationery': '📓',
                    'Worksheets': '📚',
                    'Electronics': '💻',
                    'Fashion': '👗',
                    'Home & Kitchen': '🏠',
                    'Books': '📖',
                    'Toys & Games': '🎮',
                    'Health & Beauty': '💊',
                    'Sports & Outdoors': '⚽',
                    'Grocery': '🛒',
                    'Automotive': '🚗',
                    'Art & Crafts': '🎨',
                    'Baby Products': '🍼',
                    'Office Supplies': '🖊',
                    'Other': '📦'
                };

                return {
                    id: p._id,
                    name: p.name,
                    price: p.price,
                    sellerId: seller ? seller.id : sellerId,
                    category: p.category || 'Other',
                    image: p.thumbnail || defaultEmojiByCategory[p.category] || '🛒',
                    stock: p.stock ?? 0,
                    rating: p.rating?.average ?? 0,
                    sales: p.sales ?? 0,
                    description: p.description || ''
                };
            });

            this.state.sellers = sellers;
            this.state.products = products;
            this.state.filteredProducts = [...products];
            this.filterProducts();
        } catch (error) {
            console.error('❌ Failed to load products from API, using local seed data instead:', error);
            this.showToast('Unable to connect to marketplace server. Showing demo catalogue.', 'warning');
            this.seedData();
        } finally {
            this.state.loading.products = false;
            this.notify();
        }
    }
    
    // ========== Guest Session ==========
    /**
     * Generate or restore a stable guest session ID.
     * Used to associate cart/wishlist/draft data with a device before login.
     */
    ensureGuestSession() {
        let guestId = localStorage.getItem('emproium_guest_id');
        if (!guestId) {
            // Use the Web Crypto API for a cryptographically secure random UUID.
            // crypto.randomUUID() is available in all modern browsers (Chrome 92+,
            // Firefox 95+, Safari 15.4+) and in HTTPS / localhost contexts.
            guestId = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : Array.from(crypto.getRandomValues(new Uint8Array(16)))
                    .map(b => b.toString(16).padStart(2, '0')).join('');
            localStorage.setItem('emproium_guest_id', guestId);
        }
        this.state.guestSessionId = guestId;
    }

    // ========== Storage Management ==========
    loadFromStorage() {
        const saved        = localStorage.getItem('emproium_cart');
        const userSaved    = localStorage.getItem('emproium_user');
        const sessionExpiry= localStorage.getItem('emproium_session_expires_at');
        const filtersSaved = localStorage.getItem('emproium_filters');
        const wishlistSaved= localStorage.getItem('emproium_wishlist');

        // Always ensure a guest session ID exists
        this.ensureGuestSession();

        if (saved) {
            try { this.state.cart = JSON.parse(saved); } catch (e) { console.error('Cart load error:', e); }
        }
        if (userSaved) {
            try { this.state.user = JSON.parse(userSaved); this.state.isLoggedIn = true; } catch (e) { console.error('User load error:', e); }
        }
        if (filtersSaved) {
            try {
                const f = JSON.parse(filtersSaved);
                this.state.filters = { ...this.state.filters, ...f };
            } catch (e) { /* ignore */ }
        }
        if (wishlistSaved) {
            try { this.state.wishlist = JSON.parse(wishlistSaved); } catch (e) { /* ignore */ }
        }
        if (sessionExpiry) {
            const expiry = Number(sessionExpiry);
            if (!Number.isNaN(expiry) && expiry > Date.now()) {
                this.state.sessionExpiresAt = expiry;
            } else {
                this.logout();
            }
        }
    }
    
    saveToStorage() {
        localStorage.setItem('emproium_cart', JSON.stringify(this.state.cart));
        localStorage.setItem('emproium_wishlist', JSON.stringify(this.state.wishlist));
        localStorage.setItem('emproium_filters', JSON.stringify({
            category:  this.state.filters.category,
            sortBy:    this.state.filters.sortBy,
            condition: this.state.filters.condition,
        }));
        if (this.state.user) {
            localStorage.setItem('emproium_user', JSON.stringify(this.state.user));
        }
        if (this.state.sessionExpiresAt) {
            localStorage.setItem('emproium_session_expires_at', String(this.state.sessionExpiresAt));
        } else {
            localStorage.removeItem('emproium_session_expires_at');
        }
    }
    
    // ========== Data Seeding ==========
    seedData() {
        this.state.sellers = [
            { 
                id: 1, 
                name: 'Triu Naturals Pvt Ltd', 
                status: 'approved', 
                rating: 4.85, 
                desc: 'Premium herbal powders & spices',
                avatar: '👨‍🌾',
                verified: true,
                location: 'Delhi'
            },
            { 
                id: 2, 
                name: 'Aurora Quill Designs', 
                status: 'approved', 
                rating: 4.92, 
                desc: 'Luxury stationery collections',
                avatar: '✍️',
                verified: true,
                location: 'Mumbai'
            },
            { 
                id: 3, 
                name: 'EduSpark Worksheets', 
                status: 'approved', 
                rating: 4.76, 
                desc: 'STEM & skill-building resources',
                avatar: '📚',
                verified: true,
                location: 'Bangalore'
            },
            { 
                id: 4, 
                name: 'GreenLeaf Organics', 
                status: 'pending', 
                rating: 0, 
                desc: 'Organic superfoods',
                avatar: '🌱',
                verified: false,
                location: 'Pune'
            }
        ];
        
        this.state.products = [
            {
                id: 1,
                name: 'Organic Turmeric Powder 500g',
                price: 299,
                sellerId: 1,
                category: 'Natural Products',
                image: '🧂',
                stock: 124,
                rating: 4.9,
                sales: 567,
                description: 'Pure, organic turmeric powder from trusted farmers'
            },
            {
                id: 2,
                name: 'Premium Leather-Bound Diary',
                price: 1299,
                sellerId: 2,
                category: 'Stationery',
                image: '📓',
                stock: 43,
                rating: 4.95,
                sales: 234,
                description: 'Luxury leather diary for journaling and planning'
            },
            {
                id: 3,
                name: 'Math & Logic Worksheets (Grade 5)',
                price: 249,
                sellerId: 3,
                category: 'Worksheets',
                image: '📐',
                stock: 89,
                rating: 4.8,
                sales: 456,
                description: 'Comprehensive math worksheets for critical thinking'
            },
            {
                id: 4,
                name: 'Ashwagandha Root Powder 250g',
                price: 499,
                sellerId: 1,
                category: 'Natural Products',
                image: '🌿',
                stock: 76,
                rating: 4.85,
                sales: 345,
                description: 'Premium Ashwagandha for wellness'
            },
            {
                id: 5,
                name: 'Custom Monogram Notebook Set',
                price: 899,
                sellerId: 2,
                category: 'Stationery',
                image: '📔',
                stock: 21,
                rating: 4.9,
                sales: 167,
                description: 'Personalized notebook set with monogram'
            },
            {
                id: 6,
                name: 'Science Experiment Worksheets Bundle',
                price: 599,
                sellerId: 3,
                category: 'Worksheets',
                image: '🔬',
                stock: 45,
                rating: 4.7,
                sales: 234,
                description: 'Interactive science worksheets for hands-on learning'
            }
        ];
        
        this.state.filteredProducts = [...this.state.products];
        this.notify();
    }
    
    // ========== State Management ==========
    setState(updates) {
        this.state = { ...this.state, ...updates };
        this.saveToStorage();
        this.notify();
    }
    
    updateCart(cart) {
        this.state.cart = cart;
        this.saveToStorage();
        this.notify();
    }
    
    subscribe(callback) {
        this.listeners.push(callback);
    }
    
    notify() {
        this.listeners.forEach(cb => cb(this.state));
    }
    
    // ========== Cart Operations (Optimistic UI) ==========
    addToCart(productId) {
        const product = this.state.products.find(p => p.id === productId);
        if (!product) return;

        // 1. Snapshot for potential rollback
        const snapshot = JSON.stringify(this.state.cart);

        // 2. Immediate (optimistic) update
        const existing = this.state.cart.find(item => item.id === productId);
        if (existing) { existing.quantity += 1; }
        else           { this.state.cart.push({ ...product, quantity: 1 }); }

        this.saveToStorage();
        this.notify();
        this.showToast('✅ Added to cart!', 'success');

        // 3. Background API sync
        const api = window.api;
        if (api && typeof api.addToCart === 'function') {
            api.addToCart(productId, 1).catch(() => {
                try { this.state.cart = JSON.parse(snapshot); } catch {}
                this.saveToStorage();
                this.notify();
                this.showToast('Cart sync failed — change reverted.', 'error');
            });
        }
    }

    removeFromCart(productId) {
        // Optimistic: remove immediately, sync in background
        const snapshot = JSON.stringify(this.state.cart);
        this.state.cart = this.state.cart.filter(item => item.id !== productId);
        this.saveToStorage();
        this.notify();

        const api = window.api;
        if (api && typeof api.removeFromCart === 'function') {
            api.removeFromCart(productId).catch(() => {
                try { this.state.cart = JSON.parse(snapshot); } catch {}
                this.saveToStorage();
                this.notify();
            });
        }
    }
    
    updateQuantity(productId, change) {
        const item = this.state.cart.find(item => item.id === productId);
        if (!item) return;
        
        item.quantity += change;
        
        if (item.quantity <= 0) {
            this.removeFromCart(productId);
        } else {
            this.updateCart(this.state.cart);
        }
    }
    
    clearCart() {
        this.state.cart = [];
        this.updateCart([]);
    }
    
    // ========== Product Filtering ==========
    filterProducts() {
        let filtered = [...this.state.products];

        if (this.state.filters.category !== 'all') {
            filtered = filtered.filter(p => p.category === this.state.filters.category);
        }

        if (this.state.filters.search) {
            const s = this.state.filters.search.toLowerCase();
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(s) || (p.description || '').toLowerCase().includes(s)
            );
        }

        // Condition filter (New / Refurbished / Used)
        if (this.state.filters.condition !== 'all') {
            filtered = filtered.filter(p => (p.condition || 'new') === this.state.filters.condition);
        }

        switch (this.state.filters.sortBy) {
            case 'price-low':
                filtered.sort((a, b) => a.price - b.price);
                break;
            case 'price-high':
                filtered.sort((a, b) => b.price - a.price);
                break;
            case 'rating':
                filtered.sort((a, b) => b.rating - a.rating);
                break;
            case 'newest':
                filtered.sort((a, b) => b.id - a.id);
                break;
            default: // relevance
                filtered.sort((a, b) => b.sales - a.sales);
        }
        
        this.state.filteredProducts = filtered;

        // SEO: noindex thin/empty filtered pages
        if (window.MetaTags) {
            const isThin = filtered.length === 0 &&
                (this.state.filters.search || this.state.filters.category !== 'all');
            window.MetaTags.update({ noindex: isThin });
        }

        this.notify();
    }
    
    setFilter(filterName, value) {
        this.state.filters[filterName] = value;
        this.filterProducts();
    }
    
    // ========== Modal Management ==========
    openModal(modalName) {
        this.state.modals[modalName] = true;
        this.notify();
    }
    
    closeModal(modalName) {
        this.state.modals[modalName] = false;
        this.notify();
    }
    
    // ========== Calculations ==========
    getCartTotal() {
        return this.state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }
    
    getCartCount() {
        return this.state.cart.reduce((sum, item) => sum + item.quantity, 0);
    }
    
    getShipping() {
        return this.state.cart.length > 0 ? 50 : 0;
    }
    
    getDiscount() {
        const total = this.getCartTotal();
        return total > 1000 ? Math.floor(total * 0.05) : 0;
    }
    
    getFinalTotal() {
        const base = this.getCartTotal() + this.getShipping() - this.getDiscount();
        return base + (this.state.greenShipping ? this.getGreenOffset() : 0);
    }

    // ── Green / Sustainable Checkout ──────────────────────────────────────────
    // Carbon factors (kg CO₂ per unit) mirroring server-side CARBON_FACTORS
    static get CARBON_FACTORS() {
        return {
            'Electronics':     5.2, 'Fashion':         3.5, 'Natural Products': 0.8,
            'Stationery':      0.5, 'Books':           0.3, 'Worksheets':       0.2,
            'Home & Kitchen':  2.1, 'Toys & Games':    1.8, 'Health & Beauty':  1.2,
            'Sports & Outdoors':2.0,'Grocery':         0.6, 'Automotive':       4.5,
            'Art & Crafts':    0.9, 'Baby Products':   1.5, 'Office Supplies':  0.7,
            'Other':           1.0,
        };
    }

    /** Total estimated kg CO₂ for the current cart */
    getCartCarbonKg() {
        const factors = AppStore.CARBON_FACTORS;
        return parseFloat(this.state.cart.reduce((total, item) => {
            const product = this.state.products.find(p => p.id === item.id);
            const factor  = product ? (factors[product.category] || 1.0) : 1.0;
            return total + (factor * item.quantity * 0.1); // 0.1 base weight per unit
        }, 0).toFixed(2));
    }

    /** Offset fee in ₹ (₹10 per kg CO₂, min ₹5) */
    getGreenOffset() {
        const kg = this.getCartCarbonKg();
        return Math.max(5, Math.ceil(kg * 10));
    }

    toggleGreenShipping() {
        this.state.greenShipping = !this.state.greenShipping;
        this.notify();
    }
    
    getSeller(sellerId) {
        return this.state.sellers.find(s => s.id === sellerId);
    }

    // ========== Product Detail ==========
    async setSelectedProductById(productId) {
        // Record dwell-start time for hyper-personalisation
        this._dwellStart = Date.now();

        // Check prefetch cache first (populated by hover)
        const cached = this.state._prefetchCache[productId];
        let product = cached && typeof cached === 'object' && cached.id
            ? cached
            : this.state.products.find(p => p.id === productId);

        if (!product && window.api && typeof window.api.getProduct === 'function') {
            try {
                const result = await window.api.getProduct(productId);
                product = result.data;
            } catch (error) {
                console.error('❌ Load product detail error:', error);
                this.showToast('Unable to load product details', 'error');
            }
        }

        if (product) {
            this.state.selectedProduct = product;

            // Inject JSON-LD Product schema for SEO
            if (window.StructuredData) {
                const seller = this.getSeller(product.sellerId);
                window.StructuredData.injectProduct(product, seller);
            }

            // Update dynamic meta tags for social sharing + SEO
            if (window.MetaTags) {
                window.MetaTags.update({
                    title:       product.name,
                    description: product.description
                        || `Buy ${product.name} – ₹${product.price} | EmporiumVipani`,
                    image: product.image && product.image.startsWith('http') ? product.image : undefined,
                    url:   `${window.location.origin}/#product-${product.id}`,
                });
            }

            // Sync Alpine SEO store for live document.title update
            if (window.Alpine) {
                const seoStore = window.Alpine.store('seo');
                if (seoStore) seoStore.set(product.name, product.description || '', product.image || '');
            }

            // Dynamic remarketing data layer (Google Ads)
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                event: 'view_item',
                ecommerce: {
                    items: [{
                        item_id:       String(product.id),
                        item_name:     product.name,
                        item_category: product.category,
                        price:         product.price,
                        currency:      'INR',
                    }]
                }
            });

            this.notify();
        }
    }

    clearSelectedProduct() {
        // Commit dwell-time to interests store before clearing
        if (this._dwellStart && this.state.selectedProduct) {
            const seconds = Math.floor((Date.now() - this._dwellStart) / 1000);
            const category = this.state.selectedProduct.category;
            if (seconds > 0 && category && window.Alpine) {
                const interests = window.Alpine.store('interests');
                if (interests) interests.recordView(category, seconds);
            }
        }
        this._dwellStart = null;
        this.state.selectedProduct = null;
        if (window.MetaTags)       window.MetaTags.reset();
        if (window.StructuredData) window.StructuredData.removeProduct();
        // Reset Alpine SEO store
        if (window.Alpine) {
            const seoStore = window.Alpine.store('seo');
            if (seoStore) seoStore.reset();
        }
        this.notify();
    }
    
    // ========== Auth (OTP + SAFE KEY) ==========

    /**
     * Guest-first auth guard.
     *
     * Call this before any protected action. If the user is already logged in
     * the callback is invoked immediately. If not, the login modal is opened
     * with a contextual message explaining WHY login is required.  The callback
     * is stored as a pending action and executed automatically after the user
     * completes login — so the user is never left stranded.
     *
     * @param {string}   actionLabel   Short name shown in the auth modal (e.g. 'checkout')
     * @param {string}   contextMsg    Human-readable reason (e.g. 'to place your order')
     * @param {Function} callback      The action to run after successful authentication
     */
    requireAuth(actionLabel, contextMsg, callback) {
        if (this.state.isLoggedIn) {
            callback();
            return;
        }
        // Store the pending action for deferred execution
        this.state.auth.pendingAction     = callback;
        this.state.auth.authContext       = contextMsg;
        this.state.auth.authContextAction = actionLabel;
        this.openModal('login');
        this.notify();
    }

    /**
     * Execute and clear any pending action stored by requireAuth.
     * Called internally after a successful login.
     */
    _executePendingAction() {
        const pending = this.state.auth.pendingAction;
        // Clear before calling so re-entrant calls don't loop
        this.state.auth.pendingAction     = null;
        this.state.auth.authContext       = null;
        this.state.auth.authContextAction = null;
        if (typeof pending === 'function') {
            try { pending(); } catch (e) { console.error('❌ Pending action error:', e); }
        }
    }

    /**
     * Start login/signup by requesting an OTP to email or phone.
     * Start login/signup by requesting an OTP to email or phone.
     */
    async startOtpFlow(identifier, purpose = 'login') {
        if (!identifier) {
            throw new Error('Identifier is required');
        }

        const api = window.api;
        if (!api || typeof api.requestOtp !== 'function') {
            throw new Error('Auth service not available');
        }

        this.state.auth.identifier = identifier;
        this.state.auth.otpStage = 'requesting';
        this.notify();

        const result = await api.requestOtp(identifier, purpose);

        this.state.auth.otpRequestId = result.requestId;
        this.state.auth.otpStage = 'awaiting_otp';
        this.notify();

        this.showToast('📩 OTP sent. Please check your phone/email.', 'info');
        return result;
    }

    /**
     * Verify OTP code.
     * Backend should tell us whether this is a first-time user (needs key)
     * or an existing user (already has key set).
     */
    async verifyOtpCode(otpCode) {
        const api = window.api;
        if (!api || typeof api.verifyOtp !== 'function') {
            throw new Error('Auth service not available');
        }

        if (!this.state.auth.otpRequestId) {
            throw new Error('No OTP request in progress');
        }

        const result = await api.verifyOtp(this.state.auth.otpRequestId, otpCode);

        // Expect backend to return { user, hasKey, token? }
        const user = result.user || null;
        const hasKey = !!result.hasKey;

        this.state.user = user;
        this.state.isLoggedIn = !!user && hasKey && !!result.token;

        if (!hasKey) {
            // First-time user – ask them to set a key
            this.state.auth.otpStage = 'set_key';
            this.showToast('Create your private key to secure your account.', 'info');
        } else if (this.state.isLoggedIn) {
            // Backend returned a token directly (OTP-only flow)
            this.state.sessionExpiresAt = Date.now() + 15 * 60 * 1000;
            this.state.auth.otpStage = 'idle';
            this.loadProfileAndOrders().catch(console.error);
            this.saveToStorage();
            this.notify();
            this.closeModal('login');
            this.showToast('✅ Logged in successfully!', 'success');
            this._executePendingAction();
            return result;
        } else {
            // Has key but not logged in yet (token will be obtained via loginWithKey)
            this.state.auth.otpStage = 'login_with_key';
        }

        this.saveToStorage();
        this.notify();
        return result;
    }

    /**
     * First-time key setup after OTP verification.
     */
    async setSafeKey(key) {
        const api = window.api;
        if (!api || typeof api.setSafeKey !== 'function') {
            throw new Error('Auth service not available');
        }

        const result = await api.setSafeKey(key);

        // Expect backend to return { user, token }
        if (result.user) {
            this.state.user = result.user;
        }
        this.state.isLoggedIn = !!this.state.user;
        // 15-minute session window from now
        this.state.sessionExpiresAt = Date.now() + 15 * 60 * 1000;
        this.state.auth.sessionWarningShown = false;
        this.state.auth.showSessionExtend = false;

        // Preload profile & orders for account view
        this.loadProfileAndOrders().catch(console.error);

        this.state.auth.otpStage = 'idle';
        this.saveToStorage();
        this.notify();

        this.closeModal('login');
        this.showToast('🔐 Key set. You are now logged in.', 'success');

        // Execute any action that was deferred because the user wasn't logged in
        this._executePendingAction();

        return result;
    }

    /**
     * Existing user login using identifier + key.
     */
    async loginWithKey(identifier, key) {
        const api = window.api;
        if (!api || typeof api.loginWithKey !== 'function') {
            throw new Error('Auth service not available');
        }

        const result = await api.loginWithKey(identifier, key);

        this.state.user = result.user || null;
        this.state.isLoggedIn = !!this.state.user;
        this.state.auth.otpStage = 'idle';
        this.state.auth.identifier = identifier;
        this.state.sessionExpiresAt = Date.now() + 15 * 60 * 1000;
        this.state.auth.sessionWarningShown = false;
        this.state.auth.showSessionExtend = false;

        // Preload profile & orders for account view
        this.loadProfileAndOrders().catch(console.error);

        this.saveToStorage();
        this.notify();

        this.closeModal('login');
        this.showToast('✅ Logged in successfully!', 'success');

        // Execute any action that was deferred because the user wasn't logged in
        this._executePendingAction();

        return result;
    }

    // ========== Account Data (Profile, Orders, Seller Dashboard) ==========

    async loadProfile() {
        if (!this.state.isLoggedIn) return;
        const api = window.api;
        if (!api || typeof api.getProfile !== 'function') return;

        this.state.account.loading.profile = true;
        this.notify();

        try {
            const result = await api.getProfile();
            this.state.account.profile = result.data;
            // Keep top-level user in sync
            this.state.user = result.data;
            this.saveToStorage();
        } catch (error) {
            console.error('❌ Load profile error:', error);
            this.showToast('Unable to load profile', 'error');
        } finally {
            this.state.account.loading.profile = false;
            this.notify();
        }
    }

    async loadOrders() {
        if (!this.state.isLoggedIn) return;
        const api = window.api;
        if (!api || typeof api.getOrders !== 'function') return;

        this.state.account.loading.orders = true;
        this.notify();

        try {
            const result = await api.getOrders();
            this.state.account.orders = result.data || [];
        } catch (error) {
            console.error('❌ Load orders error:', error);
            this.showToast('Unable to load orders', 'error');
        } finally {
            this.state.account.loading.orders = false;
            this.notify();
        }
    }

    async loadSellerDashboard() {
        if (!this.state.isLoggedIn) return;
        const api = window.api;
        if (!api || typeof api.getSellerProducts !== 'function') return;

        // Only if user is a seller
        const sellerId = this.state.user?.role === 'seller' ? this.state.user._id || this.state.user.id : null;
        if (!sellerId) return;

        this.state.account.loading.seller = true;
        this.notify();

        try {
            const result = await api.getSellerProducts(sellerId);
            this.state.account.sellerProducts = result.data || [];
        } catch (error) {
            console.error('❌ Load seller products error:', error);
            this.showToast('Unable to load seller products', 'error');
        } finally {
            this.state.account.loading.seller = false;
            this.notify();
        }
    }

    async loadProfileAndOrders() {
        await Promise.all([this.loadProfile(), this.loadOrders()]);
    }

    setAccountView(view) {
        this.state.account.view = view;
        this.notify();

        if (view === 'orders') {
            this.loadOrders().catch(console.error);
        } else if (view === 'seller') {
            this.loadSellerDashboard().catch(console.error);
        } else if (view === 'admin') {
            this.loadAdminDashboard().catch(console.error);
        }
    }

    async loadAdminDashboard() {
        if (!this.state.isLoggedIn || this.state.user?.role !== 'admin') return;
        const api = window.api;
        if (!api || typeof api.getAdminDashboard !== 'function' || typeof api.getPendingSellers !== 'function') return;

        this.state.account.loading.admin = true;
        this.notify();

        try {
            const [dashboard, pending] = await Promise.all([
                api.getAdminDashboard(),
                api.getPendingSellers()
            ]);
            this.state.account.adminDashboard = dashboard.data;
            this.state.account.pendingSellers = pending.data || [];
        } catch (error) {
            console.error('❌ Load admin dashboard error:', error);
            this.showToast('Unable to load admin dashboard', 'error');
        } finally {
            this.state.account.loading.admin = false;
            this.notify();
        }
    }

    /**
     * Extend the current session if token is still valid.
     */
    async extendSession() {
        const api = window.api;
        if (!api || typeof api.refreshToken !== 'function') {
            throw new Error('Auth service not available');
        }

        const result = await api.refreshToken();

        // Reset expiry window
        this.state.sessionExpiresAt = Date.now() + 15 * 60 * 1000;
        this.state.auth.sessionWarningShown = false;
        this.state.auth.showSessionExtend = false;

        this.saveToStorage();
        this.notify();

        this.showToast('⏱ Session extended by 15 minutes.', 'success');

        return result;
    }

    /**
     * Check for session expiry and trigger warnings/auto logout.
     * Intended to be called on an interval from the shell.
     */
    checkSessionExpiry() {
        if (!this.state.isLoggedIn || !this.state.sessionExpiresAt) return;

        const remaining = this.state.sessionExpiresAt - Date.now();

        if (remaining <= 0) {
            // Session expired
            this.logout();
            this.showToast('🔒 Session expired. Please login again.', 'info');
            return;
        }

        const threeMinutes = 3 * 60 * 1000;
        if (remaining <= threeMinutes && !this.state.auth.sessionWarningShown) {
            this.state.auth.sessionWarningShown = true;
            this.state.auth.showSessionExtend = true;
            this.notify();
        }
    }

    logout() {
        this.state.user = null;
        this.state.isLoggedIn = false;
        this.state.sessionExpiresAt = null;
        this.state.auth.sessionWarningShown = false;
        this.state.auth.showSessionExtend = false;
        // Close WebSocket on logout
        if (this._ws) { try { this._ws.close(); } catch {} this._ws = null; }
        localStorage.removeItem('emproium_user');
        if (window.api && typeof window.api.logout === 'function') {
            window.api.logout();
        }
        this.notify();
        this.showToast('👋 Logged out', 'info');
    }
    
    // ========== Orders ==========
    async placeOrder(orderData) {
        this.state.loading.order = true;
        this.notify();
        
        try {
            // Send to EmailJS
            const result = await EmailManager.submitOrderToGmail({
                customerName: orderData.name,
                customerEmail: orderData.email,
                customerPhone: orderData.phone,
                customerAddress: orderData.address,
                items: EmailManager.generateOrderSummary(this.state.cart),
                subtotal: this.getCartTotal(),
                shipping: this.getShipping(),
                discount: this.getDiscount(),
                total: this.getFinalTotal(),
                paymentMethod: orderData.paymentMethod,
                notes: orderData.notes
            });
            
            // Save last order
            this.state.lastOrder = {
                orderId: result.orderId,
                orderData,
                timestamp: new Date(),
                total: this.getFinalTotal()
            };
            
            this.state.loading.order = false;
            this.clearCart();
            this.closeModal('checkout');
            this.notify();
            
            this.showToast('✅ Order placed successfully!', 'success');
            return result;
            
        } catch (error) {
            this.state.loading.order = false;
            this.notify();
            this.showToast('❌ ' + error.message, 'error');
            throw error;
        }
    }
    
    // ========== Seller Registration ==========
    async registerSeller(formData) {
        this.state.loading.checkout = true;
        this.notify();
        
        try {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const newSeller = {
                id: this.state.sellers.length + 1,
                name: formData.businessName,
                desc: formData.description,
                status: 'pending',
                verified: false,
                avatar: '🏪'
            };
            
            this.state.sellers.push(newSeller);
            this.state.loading.checkout = false;
            this.closeModal('seller');
            this.notify();
            
            this.showToast('✅ Application submitted! Admin will review within 24 hours.', 'success');
            return newSeller;
            
        } catch (error) {
            this.state.loading.checkout = false;
            this.notify();
            this.showToast('❌ Registration failed', 'error');
            throw error;
        }
    }
    
    // ========== Notifications ==========
    showToast(message, type = 'info') {
        const toast = {
            id: Date.now(),
            message,
            type,
            visible: true
        };
        
        // Auto-hide after 4 seconds
        setTimeout(() => {
            const el = document.querySelector(`[data-toast="${toast.id}"]`);
            if (el) el.remove();
        }, 4000);
        
        return toast;
    }
    
    // ========== Mobile Menu ==========
    toggleMobileMenu() {
        this.state.mobileMenuOpen = !this.state.mobileMenuOpen;
        this.notify();
    }
    
    closeMobileMenu() {
        this.state.mobileMenuOpen = false;
        this.notify();
    }

    // ── Condition Filter ────────────────────────────────────────
    setConditionFilter(condition) {
        this.state.filters.condition = condition;
        this.filterProducts();
        this.saveToStorage();
    }

    // ── Wishlist (Optimistic) ───────────────────────────────────
    toggleWishlist(productId) {
        const idx      = this.state.wishlist.indexOf(productId);
        const snapshot = [...this.state.wishlist];
        if (idx === -1) {
            this.state.wishlist.push(productId);
            this.showToast('💛 Added to wishlist', 'success');
        } else {
            this.state.wishlist.splice(idx, 1);
        }
        this.saveToStorage();
        this.notify();

        const api = window.api;
        if (api && typeof api.toggleWishlist === 'function') {
            api.toggleWishlist(productId).catch(() => {
                this.state.wishlist = snapshot;
                this.saveToStorage();
                this.notify();
                this.showToast('Wishlist sync failed.', 'error');
            });
        }
    }

    isInWishlist(productId) {
        return this.state.wishlist.includes(productId);
    }

    // ── Location Service ────────────────────────────────────────
    async detectLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
            navigator.geolocation.getCurrentPosition(
                pos => {
                    this.state.location.lat = pos.coords.latitude;
                    this.state.location.lng = pos.coords.longitude;
                    this.notify();
                    resolve(this.state.location);
                },
                err => reject(err),
                { timeout: 10000, maximumAge: 300000 }
            );
        });
    }

    async loadNearbyProducts() {
        const { lat, lng, radius } = this.state.location;
        if (!lat || !lng) return;
        const api = window.api;
        if (!api || typeof api.getProductsByLocation !== 'function') return;
        try {
            const res = await api.getProductsByLocation(lat, lng, radius);
            const products = res?.data || [];
            if (products.length) { this.state.filteredProducts = products; this.notify(); }
        } catch (e) { console.warn('⚠️ Nearby products:', e.message); }
    }

    // ── Auctions ────────────────────────────────────────────────
    async loadAuctions(params = {}) {
        const api = window.api;
        if (!api || typeof api.getAuctions !== 'function') return;
        try {
            const res = await api.getAuctions(params);
            this.state.auctions = res?.data || [];
            this.notify();
        } catch (e) { console.warn('⚠️ Auctions fetch:', e.message); }
    }

    async placeBid(auctionId, amount) {
        const api = window.api;
        if (!api || typeof api.placeBid !== 'function') throw new Error('Auction service unavailable');
        const result = await api.placeBid(auctionId, amount);
        const auction = this.state.auctions.find(a => a._id === auctionId || a.id === auctionId);
        if (auction) { auction.currentBid = amount; auction.bidCount = (auction.bidCount || 0) + 1; this.notify(); }
        this.showToast('✅ Bid placed!', 'success');
        return result;
    }

    // ── WebSocket (Real-time order status) ──────────────────────
    initWebSocket() {
        const base = (typeof import_meta_env_VITE_API_URL !== 'undefined' ? import_meta_env_VITE_API_URL : '')
            .replace(/^http/, 'ws').replace('/api', '') + '/ws';
        if (!base.startsWith('ws')) return;
        try {
            if (this._ws && this._ws.readyState < 2) return;
            this._ws = new WebSocket(base);
            this._ws.addEventListener('message', ev => {
                try {
                    const d = JSON.parse(ev.data);
                    if (d.type === 'ORDER_STATUS_UPDATE') {
                        this.state.realtimeOrderStatus = d;
                        const o = this.state.account.orders.find(x => x._id === d.orderId || x.orderId === d.orderId);
                        if (o) o.status = d.status;
                        this.notify();
                    }
                    if (d.type === 'ESCROW_UPDATE') {
                        this.state.escrow = { ...this.state.escrow, ...d.escrow };
                        this.notify();
                    }
                } catch {}
            });
            this._ws.addEventListener('close', () => {
                if (this.state.isLoggedIn) setTimeout(() => this.initWebSocket(), 5000);
            });
        } catch (e) { console.warn('⚠️ WebSocket unavailable:', e.message); }
    }

    // ── Push Notifications ──────────────────────────────────────
    async requestPushPermission() {
        if (!('Notification' in window) || !navigator.serviceWorker) return;
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            this.showToast('🔔 Push notifications enabled.', 'success');
        } else {
            this.showToast('Push notifications blocked in browser settings.', 'warning');
        }
    }

    // ── Agent / Delivery ────────────────────────────────────────
    async loadDeliveryQueue() {
        if (this.state.user?.role !== 'agent') return;
        const api = window.api;
        if (!api || typeof api.getDeliveryQueue !== 'function') return;
        const agentId = this.state.user._id || this.state.user.id;
        try {
            const res = await api.getDeliveryQueue(agentId);
            this.state.agent.deliveryQueue = res?.data || [];
            this.notify();
        } catch (e) { console.warn('⚠️ Delivery queue:', e.message); }
    }

    async pingLocation(lat, lng) {
        const api = window.api;
        if (!api || typeof api.pingAgentLocation !== 'function') return;
        const agentId = this.state.user?._id || this.state.user?.id;
        if (!agentId || this.state.user?.role !== 'agent') return;
        try {
            await api.pingAgentLocation(agentId, lat, lng);
            this.state.agent.currentLocation = { lat, lng, updatedAt: Date.now() };
            this.notify();
        } catch (e) { console.warn('⚠️ Location ping:', e.message); }
    }

    // ── Escrow Tracker ──────────────────────────────────────────
    updateEscrowStatus(orderId, status) {
        this.state.escrow = {
            status, orderId,
            history: [
                ...this.state.escrow.history,
                { status, orderId, timestamp: Date.now() }
            ]
        };
        this.notify();
    }
}

// ============================================
// 2. INITIALIZE GLOBAL STORE
// ============================================
const store = new AppStore();

// ============================================
// 2b. CLIENT-SIDE ROUTER (Headless SPA)
// ============================================
class Router {
    constructor(appStore) {
        this._store   = appStore;
        this._routes  = [];
        this._before  = null;
        this._init();
    }

    _init() {
        window.addEventListener('popstate', () => this._resolve(location.pathname + location.search + location.hash));
        document.addEventListener('click', e => {
            const a = e.target.closest('a[href]');
            if (!a) return;
            const href = a.getAttribute('href');
            if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('mailto:')) return;
            e.preventDefault();
            this.navigate(href);
        });
        // Resolve initial URL (hash-based routing)
        this._resolve(location.hash || '/');
    }

    add(path, handler) {
        const keys = [];
        const pattern = path instanceof RegExp ? path
            : new RegExp('^' + path.replace(/:([^/]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
        this._routes.push({ pattern, keys, handler });
        return this;
    }

    before(fn) { this._before = fn; return this; }

    navigate(path, { replace = false } = {}) {
        if (replace) history.replaceState(null, '', path);
        else         history.pushState(null, '', path);
        this._resolve(path);
    }

    async _resolve(fullPath) {
        const clean  = fullPath.replace(/^#/, '');
        const [path, qs] = clean.split('?');
        const qParams = {};
        if (qs) qs.split('&').forEach(p => { const [k, v] = p.split('='); qParams[k] = decodeURIComponent(v || ''); });

        if (typeof this._before === 'function') {
            const ok = await this._before(path, qParams);
            if (ok === false) return;
        }

        for (const route of this._routes) {
            const match = path.match(route.pattern);
            if (!match) continue;
            const params = { ...qParams };
            route.keys.forEach((k, i) => { params[k] = decodeURIComponent(match[i + 1]); });
            this._store.state.currentRoute  = path;
            this._store.state.currentRouteParams = params;
            this._store.state.routeLoading  = true;
            this._store.notify();
            if (window.NProgress) window.NProgress.start();
            try   { await route.handler(params, this._store); }
            finally {
                this._store.state.routeLoading = false;
                this._store.notify();
                if (window.NProgress) window.NProgress.done();
            }
            return;
        }
        // No match → home
        this._store.state.currentRoute = '/';
        this._store.state.currentRouteParams = {};
        this._store.notify();
    }
}

const router = new Router(store);

// Register core routes
router
    .add('/', async () => { /* home — products already loaded */ })
    .add('/product/:id', async (params) => { await store.setSelectedProductById(params.id); })
    .add('/checkout', async () => { store.openModal('checkout'); })
    .add('/sellers', async () => { /* sellers section scroll */ })
    .add('/about', async () => { /* about section scroll */ });

window.router = router;

// ============================================
// 2c. HOVER PREFETCH — product cards
// ============================================
function setupProductPrefetch() {
    document.addEventListener('mouseover', e => {
        const card = e.target.closest('[data-product-id]');
        if (!card) return;
        const pid = card.dataset.productId;
        if (!pid || store.state._prefetchCache[pid]) return;
        store.state._prefetchCache[pid] = 'pending';

        const timer = setTimeout(async () => {
            const api = window.api;
            if (!api || typeof api.getProduct !== 'function') return;
            try {
                const res = await api.getProduct(pid);
                store.state._prefetchCache[pid] = res?.data;
                console.log(`[Prefetch] ✅ product ${pid}`);
            } catch { delete store.state._prefetchCache[pid]; }
        }, 500);

        card.addEventListener('mouseleave', () => {
            clearTimeout(timer);
            if (store.state._prefetchCache[pid] === 'pending') delete store.state._prefetchCache[pid];
        }, { once: true });
    });
}

// ============================================
// 3. SELLER ONBOARDING WIZARD (Alpine x-data)
// ============================================
window.sellerWizard = function() {
    return {
        step: 1,
        totalSteps: 7,
        errors: {},
        stepTitles: [
            'Personal Details',
            'Business Details',
            'Bank Account Setup',
            'Document Upload',
            'First Product Listing',
            'Seller Agreement',
            'Review & Submit'
        ],
        form: {
            // Step 1
            fullName: '', phone: '', email: '', city: '', state: '', pincode: '',
            // Step 2
            businessName: '', businessType: 'Individual', gst: '', pan: '', tagline: '',
            // Step 3
            accountHolderName: '', bankName: '', accountNumber: '', confirmAccountNumber: '', ifscCode: '', accountType: 'Savings',
            // Step 4
            profilePhotoUrl: '', aadhaarNumber: '', uploadDeclaration: false, govtIdType: 'Aadhaar', govtIdNumber: '',
            // Step 5
            productName: '', productCategory: 'Natural Products', productPrice: '', productStock: '', productDescription: '', productImageUrl: '',
            // Step 6
            acceptedTerms: false
        },

        closeModal() {
            window.store.closeModal('seller');
        },

        validate() {
            this.errors = {};
            const f = this.form;
            if (this.step === 1) {
                if (!f.fullName.trim()) this.errors.fullName = 'Full name is required';
                const phone = f.phone.trim();
                if (!phone || !/^\d{10}$/.test(phone)) this.errors.phone = 'Valid 10-digit phone required';
                if (!f.email.trim() || !/\S+@\S+\.\S+/.test(f.email)) this.errors.email = 'Valid email required';
                if (!f.city.trim()) this.errors.city = 'City is required';
                if (!f.state.trim()) this.errors.state = 'State is required';
                if (!f.pincode.trim() || !/^\d{6}$/.test(f.pincode)) this.errors.pincode = 'Valid 6-digit pincode required';
            } else if (this.step === 2) {
                if (!f.businessName.trim()) this.errors.businessName = 'Business name is required';
                if (!f.pan.trim() || !/^[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}$/.test(f.pan)) this.errors.pan = 'Valid PAN required (e.g. ABCDE1234F)';
            } else if (this.step === 3) {
                if (!f.accountHolderName.trim()) this.errors.accountHolderName = 'Account holder name is required';
                if (!f.bankName.trim()) this.errors.bankName = 'Bank name is required';
                if (!f.accountNumber.trim()) this.errors.accountNumber = 'Account number is required';
                if (f.accountNumber !== f.confirmAccountNumber) this.errors.confirmAccountNumber = 'Account numbers do not match';
                if (!f.ifscCode.trim() || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(f.ifscCode)) this.errors.ifscCode = 'Valid IFSC code required (e.g. SBIN0001234)';
            } else if (this.step === 4) {
                if (!f.aadhaarNumber.trim() || !/^\d{12}$/.test(f.aadhaarNumber)) this.errors.aadhaarNumber = 'Valid 12-digit Aadhaar number required';
                if (!f.uploadDeclaration) this.errors.uploadDeclaration = 'You must accept the document declaration';
                if (!f.govtIdNumber.trim()) this.errors.govtIdNumber = 'Government ID number is required';
            } else if (this.step === 5) {
                if (!f.productName.trim()) this.errors.productName = 'Product name is required';
                if (!f.productPrice || isNaN(f.productPrice) || Number(f.productPrice) <= 0) this.errors.productPrice = 'Valid price required';
                if (f.productStock === '' || isNaN(f.productStock) || Number(f.productStock) < 0) this.errors.productStock = 'Valid stock quantity required';
                if (!f.productDescription.trim()) this.errors.productDescription = 'Short description is required';
            } else if (this.step === 6) {
                if (!f.acceptedTerms) this.errors.acceptedTerms = 'You must accept the seller agreement';
            }
            return Object.keys(this.errors).length === 0;
        },

        nextStep() {
            if (this.validate()) this.step++;
        },

        prevStep() {
            if (this.step > 1) this.step--;
        },

        async submit() {
            if (!this.validate()) return;
            await window.handleSellerApplicationWizard(this.form);
        }
    };
};

// ============================================
// 3b. SELLER DASHBOARD (Alpine x-data)
// ============================================
window.sellerDashboard = function() {
    return {
        sellerTab: 'overview',
        showAddProductForm: false,
        newProduct: { name: '', category: 'Natural Products', price: '', mrp: '', stock: '', description: '', thumbnail: '', weight: '', brand: '' },
        _refreshInterval: null,

        products: [
            { _id: 'p1', name: 'Organic Turmeric Powder', category: 'Natural Products', price: 299, mrp: 399, stock: 124, status: 'active', sales: 567 },
            { _id: 'p2', name: 'Ashwagandha Root Powder',  category: 'Natural Products', price: 499, mrp: 599, stock: 76,  status: 'active', sales: 345 }
        ],

        orders: [
            { id: 'ORD-0191', customer: 'Priya Sharma',  product: 'Organic Turmeric Powder', qty: 2, amount: 598, status: 'shipped',   date: '2025-01-15' },
            { id: 'ORD-0192', customer: 'Rahul Kumar',   product: 'Ashwagandha Root Powder',  qty: 1, amount: 499, status: 'pending',   date: '2025-01-16' },
            { id: 'ORD-0193', customer: 'Anita Singh',   product: 'Organic Turmeric Powder', qty: 3, amount: 897, status: 'delivered',  date: '2025-01-10' }
        ],

        payouts: {
            balanceDue: 4230,
            history: [
                { date: '2025-01-01', amount: 8450, status: 'paid',       utr: 'UTR234567890' },
                { date: '2024-12-01', amount: 6200, status: 'paid',       utr: 'UTR123456789' },
                { date: '2024-11-01', amount: 5100, status: 'paid',       utr: 'UTR112345678' }
            ]
        },

        analytics: { views: 4820, conversionRate: '3.2%', avgOrderValue: 674, topProduct: 'Organic Turmeric Powder' },

        kpis: { totalRevenue: 89450, totalOrders: 178, totalProducts: 8, thisMonthEarnings: 12300 },

        // DASH-01: inventory health (predictive days-of-cover)
        inventoryHealth: [],

        init() {
            this.buildInventoryHealth();
            // DASH-01: auto-refresh stats every 60 seconds
            this._refreshInterval = setInterval(() => { this.refreshStats(); }, 60000);
        },

        destroy() {
            if (this._refreshInterval) clearInterval(this._refreshInterval);
        },

        async refreshStats() {
            try {
                const data = await window.api?.request('GET', '/sellers/dashboard');
                if (data?.kpis) Object.assign(this.kpis, data.kpis);
            } catch { /* silent refresh failure is acceptable */ }
        },

        buildInventoryHealth() {
            // Calculate days-of-cover from sales velocity (≥7 data points needed in production)
            // Using current snapshot: velocity ≈ sales/30 days
            this.inventoryHealth = this.products.map(p => {
                const velocity = p.sales > 0 ? p.sales / 30 : 0;
                const daysLeft  = velocity > 0 ? Math.floor(p.stock / velocity) : null;
                const leadTime  = p.leadTime || 7;
                return {
                    ...p,
                    daysLeft,
                    velocity:   velocity.toFixed(1),
                    isUrgent:   daysLeft !== null && daysLeft < leadTime,
                    isWarning:  daysLeft !== null && daysLeft < leadTime + 3,
                    leadTime,
                };
            });
        },

        async saveNewProduct() {
            if (!this.newProduct.name || !this.newProduct.price || this.newProduct.stock === '') {
                if (window.Toast) Toast.show('Please fill required fields', 'error');
                return;
            }
            const entry = {
                _id: String(Date.now()),
                name: this.newProduct.name,
                category: this.newProduct.category,
                price: Number(this.newProduct.price),
                mrp: Number(this.newProduct.mrp) || Number(this.newProduct.price),
                stock: Number(this.newProduct.stock),
                description: this.newProduct.description,
                thumbnail: this.newProduct.thumbnail,
                status: 'active',
                sales: 0
            };
            try {
                await window.api?.createProduct({ ...entry, brand: this.newProduct.brand, weight: this.newProduct.weight });
            } catch (e) { /* optimistic */ }
            this.products.unshift(entry);
            this.newProduct = { name: '', category: 'Natural Products', price: '', mrp: '', stock: '', description: '', thumbnail: '', weight: '', brand: '' };
            this.showAddProductForm = false;
            this.kpis.totalProducts++;
            this.buildInventoryHealth();
            if (window.Toast) Toast.show('✅ Product added!', 'success');
        },

        toggleProductStatus(productId) {
            const p = this.products.find(p => p._id === productId);
            if (p) p.status = p.status === 'active' ? 'inactive' : 'active';
        },

        deleteProduct(productId) {
            this.products = this.products.filter(p => p._id !== productId);
            this.kpis.totalProducts = Math.max(0, this.kpis.totalProducts - 1);
            this.buildInventoryHealth();
            if (window.Toast) Toast.show('Product removed', 'info');
        },

        updateOrderStatus(orderId, newStatus) {
            const o = this.orders.find(o => o.id === orderId);
            if (o) o.status = newStatus;
        },

        async requestPayout() {
            if (this.payouts.balanceDue <= 0) { if (window.Toast) Toast.show('No balance due', 'info'); return; }
            this.payouts.history.unshift({ date: new Date().toISOString().split('T')[0], amount: this.payouts.balanceDue, status: 'processing', utr: 'PENDING' });
            this.payouts.balanceDue = 0;
            if (window.Toast) Toast.show('Payout request submitted! Processing in 3–5 business days.', 'success');
        }
    };
};

// ============================================
// 3c. ALPINE:INIT — Global stores & components
// Registered here so they are ready before Alpine.start() fires.
// NOTE: app.js runs synchronously before deferred CDN scripts.
//       Alpine fires `alpine:init` after all deferred scripts have run,
//       so this listener is guaranteed to execute.
// ============================================
document.addEventListener('alpine:init', () => {

    // ── SEO store — keeps document.title and og:image in sync ──────────────
    Alpine.store('seo', {
        set(title, desc, image) {
            document.title = title ? `${title} | EmporiumVipani` : 'EmporiumVipani – Curated Objects';
            const d = document.querySelector('meta[name="description"]');
            if (d) d.setAttribute('content', desc || '');
            const og = document.querySelector('meta[property="og:image"]');
            if (og && image) og.setAttribute('content', image);
            const ogT = document.querySelector('meta[property="og:title"]');
            if (ogT) ogT.setAttribute('content', document.title);
            const ogD = document.querySelector('meta[property="og:description"]');
            if (ogD) ogD.setAttribute('content', desc || '');
        },
        reset() {
            document.title = 'EmporiumVipani – Curated Objects';
        },
    });

    // ── Search store — shared query between typed & voice search ───────────
    Alpine.store('search', {
        query: '',
    });

    // ── Interests store — hyper-personalised feed (manual localStorage) ────
    // Uses manual persistence so it works regardless of Alpine.plugin order.
    Alpine.store('interests', {
        scores: JSON.parse(localStorage.getItem('ev_interests') || '{}'),

        recordView(category, seconds) {
            if (!category || seconds <= 0) return;
            const points = Math.min(Math.floor(seconds / 5), 5); // 1 pt per 5s, cap 5
            this.scores[category] = (this.scores[category] || 0) + points;
            try { localStorage.setItem('ev_interests', JSON.stringify(this.scores)); } catch { /* quota */ }
        },

        getPrimaryCategory() {
            const keys = Object.keys(this.scores);
            if (!keys.length) return null;
            return keys.reduce((a, b) => this.scores[a] >= this.scores[b] ? a : b);
        },
    });

    // ── Consent store — DPDP Act 2023 ─────────────────────────────────────
    Alpine.store('consent', {
        accepted:    localStorage.getItem('ev_consent') === 'true',
        marketing:   localStorage.getItem('ev_consent_mkt') === 'true',
        personalise: localStorage.getItem('ev_consent_prs') === 'true',

        accept(marketing, personalise) {
            this.accepted    = true;
            this.marketing   = !!marketing;
            this.personalise = !!personalise;
            try {
                localStorage.setItem('ev_consent',     'true');
                localStorage.setItem('ev_consent_mkt', String(!!marketing));
                localStorage.setItem('ev_consent_prs', String(!!personalise));
            } catch { /* quota */ }
        },

        decline() {
            this.accepted = true; // banner dismissed — minimum required
            try {
                localStorage.setItem('ev_consent',     'false');
                localStorage.setItem('ev_consent_mkt', 'false');
                localStorage.setItem('ev_consent_prs', 'false');
            } catch { /* quota */ }
        },
    });

    // ── voiceSearch component ──────────────────────────────────────────────
    Alpine.data('voiceSearch', () => ({
        isListening:  false,
        isSupported:  !!(window.SpeechRecognition || window.webkitSpeechRecognition),
        recognition:  null,

        init() {
            if (!this.isSupported) return;
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SR();
            this.recognition.continuous     = false;
            this.recognition.interimResults = false;
            this.recognition.lang           = 'en-IN';

            this.recognition.onstart  = () => { this.isListening = true; };
            this.recognition.onend    = () => { this.isListening = false; };
            this.recognition.onerror  = (e) => { console.warn('Speech error:', e.error); this.isListening = false; };
            this.recognition.onresult = (e) => {
                const transcript = e.results[0][0].transcript;
                Alpine.store('search').query = transcript;
                this._executeSearch(transcript);
            };
        },

        toggleListening() {
            if (!this.recognition) return;
            this.isListening ? this.recognition.stop() : this.recognition.start();
        },

        _executeSearch(query) {
            // Update AppStore filter so the existing search pipeline triggers
            if (window.store) window.store.setFilter('search', query);
        },
    }));
});

// ── Commit any pending dwell time on tab/window close ──────────────────────
window.addEventListener('beforeunload', () => {
    if (window.store?._dwellStart && window.store?.state?.selectedProduct) {
        const seconds  = Math.floor((Date.now() - window.store._dwellStart) / 1000);
        const category = window.store.state.selectedProduct.category;
        if (seconds > 0 && category && window.Alpine) {
            const interests = window.Alpine.store('interests');
            if (interests) interests.recordView(category, seconds);
        }
    }
});

// ============================================
// 4. ALPINE.JS APP INITIALIZATION
// ============================================
function appData() {
    return {
        // Expose store state
        store: store.state,
        api: window.api,
        
        // Cart methods
        addToCart(productId) {
            store.addToCart(productId);
        },
        
        removeFromCart(productId) {
            store.removeFromCart(productId);
        },
        
        updateQuantity(productId, change) {
            store.updateQuantity(productId, change);
        },
        
        clearCart() {
            store.clearCart();
        },
        
        // Filter methods
        setCategory(category) {
            store.setFilter('category', category);
        },
        
        setSort(sortBy) {
            store.setFilter('sortBy', sortBy);
        },
        
        search(term) {
            store.setFilter('search', term);
        },
        
        // Modal methods
        openCart() {
            store.openModal('cart');
        },
        
        closeCart() {
            store.closeModal('cart');
        },
        
        openSellerModal() {
            // Guard: becoming a seller requires a verified account.
            store.requireAuth(
                'seller-application',
                'Please sign in to apply as a seller on our marketplace.',
                () => store.openModal('seller')
            );
        },
        
        closeSellerModal() {
            store.closeModal('seller');
        },
        
        openLoginModal() {
            store.openModal('login');
        },
        
        closeLoginModal() {
            store.closeModal('login');
        },
        
        openCheckoutModal() {
            // Guard: require login before entering the checkout flow.
            // If the user is a guest, open the login modal with context;
            // after successful login the checkout modal opens automatically.
            store.requireAuth(
                'checkout',
                'Please sign in to complete your order. Your cart is saved.',
                () => store.openModal('checkout')
            );
        },
        
        closeCheckoutModal() {
            store.closeModal('checkout');
        },
        
        // Calculations
        getCartTotal() {
            return store.getCartTotal();
        },
        
        getCartCount() {
            return store.getCartCount();
        },
        
        getShipping() {
            return store.getShipping();
        },
        
        getDiscount() {
            return store.getDiscount();
        },
        
        getFinalTotal() {
            return store.getFinalTotal();
        },
        
        getSeller(sellerId) {
            return store.getSeller(sellerId);
        },

        // Product detail
        async openProduct(productId) {
            await store.setSelectedProductById(productId);
            this.scrollTo('product-detail');
        },

        closeProductDetail() {
            store.clearSelectedProduct();
        },
        
        // Order methods
        async placeOrder(formData) {
            await store.placeOrder(formData);
        },
        
        // Auth methods (OTP + key)
        async startOtp(identifier, purpose = 'login') {
            return store.startOtpFlow(identifier, purpose);
        },

        async verifyOtp(otpCode) {
            return store.verifyOtpCode(otpCode);
        },

        async setSafeKey(key) {
            return store.setSafeKey(key);
        },

        async loginWithKey(identifier, key) {
            return store.loginWithKey(identifier, key);
        },

        async extendSession() {
            return store.extendSession();
        },

        // Account views
        setAccountView(view) {
            store.setAccountView(view);
        },

        async loadProfile() {
            await store.loadProfile();
        },

        async loadOrders() {
            await store.loadOrders();
        },

        async loadSellerDashboard() {
            await store.loadSellerDashboard();
        },

        async loadAdminDashboard() {
            await store.loadAdminDashboard();
        },

        logout() {
            store.logout();
        },
        
        // Seller registration
        async registerSeller(formData) {
            await store.registerSeller(formData);
        },
        
        // Mobile menu
        toggleMobileMenu() {
            store.toggleMobileMenu();
        },
        
        closeMobileMenu() {
            store.closeMobileMenu();
        },

        // Condition filter
        setCondition(condition) {
            store.setConditionFilter(condition);
        },

        // Wishlist (Optimistic)
        toggleWishlist(productId) {
            store.toggleWishlist(productId);
        },

        isInWishlist(productId) {
            return store.isInWishlist(productId);
        },

        // Location
        async detectLocation() {
            try {
                await store.detectLocation();
                await store.loadNearbyProducts();
                store.showToast('📍 Location detected!', 'success');
            } catch { store.showToast('Could not detect location.', 'warning'); }
        },

        // Auctions
        async loadAuctions() {
            return store.loadAuctions();
        },

        async placeBid(auctionId, amount) {
            return store.placeBid(auctionId, amount);
        },

        // Push notifications
        async requestPushPermission() {
            return store.requestPushPermission();
        },

        // SPA Navigation
        navigate(path) {
            router.navigate('#' + path);
        },

        // Escrow status helper
        isStatusReached(step) {
            const ORDER = ['Paid', 'Held', 'InTransit', 'Delivered', 'Released'];
            const cur   = store.state.escrow.status;
            return cur && ORDER.indexOf(step) <= ORDER.indexOf(cur);
        },

        // Scroll utilities
        scrollTo(elementId) {
            const element = document.getElementById(elementId);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        
        // Format currency
        formatPrice(price) {
            return '₹' + price.toLocaleString('en-IN');
        },
        
        // Format number
        formatNumber(num) {
            return num.toLocaleString('en-IN');
        },

        // Green checkout helpers
        getCartCarbonKg() { return store.getCartCarbonKg(); },
        getGreenOffset()  { return store.getGreenOffset(); },
        toggleGreenShipping() { store.toggleGreenShipping(); },
        
        // Subscribe to store updates
        init() {
            store.subscribe((newState) => {
                this.$data.store = newState;
            });

            // Start Web Vitals monitoring
            if (typeof window.initWebVitals === 'function') window.initWebVitals();

            // Set up hover prefetch
            setupProductPrefetch();

            // Set up lazy images via GlobalObserver
            document.querySelectorAll('img[data-src]').forEach(img => {
                if (window.GlobalObserver) window.GlobalObserver.lazyImage(img);
            });

            // Connect WebSocket if user is logged in
            if (store.state.isLoggedIn) {
                store.initWebSocket();
                store.loadDeliveryQueue().catch(() => {});
            }
        }
    };
}

// ============================================
// 4. DOCUMENT READY - Initialize App
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    if (window.Alpine && !window.appInitialized) {
        console.log('✅ EmporiumVipani App Initialized');
        console.log('🛒 Products:', store.state.products.length);
        console.log('👥 Sellers:', store.state.sellers.length);
        console.log('📧 EmailJS Configured:', !!window.EmailManager);
        window.appInitialized = true;
    }

    // Core Web Vitals monitoring
    if (typeof window.initWebVitals === 'function') window.initWebVitals();

    // Global API error handler — intercept fetch errors and show branded modals
    const _origFetch = window.fetch;
    window.fetch = async (...args) => {
        try {
            const res = await _origFetch(...args);
            if ([401, 403, 404, 500].includes(res.status) && window.GlobalErrorHandler) {
                if (res.status === 401) {
                    window.GlobalErrorHandler.show(401, () => store.openModal('login'));
                    store.logout();
                }
            }
            return res;
        } catch (err) {
            if (window.GlobalErrorHandler) window.GlobalErrorHandler.show(0);
            throw err;
        }
    };

    // Start periodic session expiry checks (every 30 seconds)
    setInterval(() => {
        if (typeof store.checkSessionExpiry === 'function') store.checkSessionExpiry();
    }, 30000);
});

// ============================================
// 5. SERVICE WORKER REGISTRATION (PWA)
// ============================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('✅ Service Worker registered'))
            .catch(err => console.log('⚠️ Service Worker error:', err));
    });
}

// ============================================
// 6. EXPORT FOR GLOBAL ACCESS
// ============================================
window.AppStore = AppStore;
window.store = store;
window.appData = appData;

window.downloadBookkeepingCSV = function() {
    const bk = window.store?.state?.account?.bookkeeping;
    if (!bk) return;
    const header = 'Month,Orders,Revenue,Commission,TDS,Net\n';
    const rows = bk.monthly.map(r =>
        `${r.month},${r.orders},${r.revenue},${r.commission},${r.tds},${r.net}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookkeeping-summary.csv';
    a.click();
    URL.revokeObjectURL(url);
};

console.log('🚀 App.js loaded successfully');
