// ============================================
// EMPROIUMVIPANI - components.js
// Reusable UI utilities for the frontend
// ============================================

// 1) Toast / Notification Manager
const Toast = (() => {
  const CONTAINER_ID = 'toast-container';

  function ensureContainer() {
    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = CONTAINER_ID;
      container.style.position = 'fixed';
      container.style.top = '20px';
      container.style.right = '20px';
      container.style.zIndex = '9999';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '12px';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);
    }
    return container;
  }

  function createToastElement(message, type) {
    const el = document.createElement('div');
    el.dataset.toast = Date.now().toString();
    el.style.minWidth = '240px';
    el.style.maxWidth = '320px';
    el.style.padding = '12px 16px';
    el.style.borderRadius = '999px';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
    el.style.pointerEvents = 'auto';
    el.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
    el.style.transform = 'translateX(0)';
    el.style.opacity = '1';
    el.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    el.style.fontSize = '14px';

    let bg = '#111827';
    let color = '#f9fafb';
    let icon = 'ℹ️';

    if (type === 'success') {
      bg = '#047857';
      color = '#ecfdf5';
      icon = '✅';
    } else if (type === 'error') {
      bg = '#b91c1c';
      color = '#fee2e2';
      icon = '⚠️';
    } else if (type === 'warning') {
      bg = '#92400e';
      color = '#fffbeb';
      icon = '⚠️';
    }

    el.style.background = bg;
    el.style.color = color;

    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    iconSpan.style.marginRight = '8px';

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    msgSpan.style.flex = '1';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.marginLeft = '8px';
    closeBtn.style.border = 'none';
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = color;
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.lineHeight = '1';

    closeBtn.addEventListener('click', () => hideToast(el));

    el.appendChild(iconSpan);
    el.appendChild(msgSpan);
    el.appendChild(closeBtn);

    return el;
  }

  function show(message, type = 'info', duration = 4000) {
    const container = ensureContainer();
    const toastEl = createToastElement(message, type);
    container.appendChild(toastEl);

    const timer = setTimeout(() => hideToast(toastEl), duration);
    toastEl.dataset.timer = timer;
  }

  function hideToast(el) {
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    const timer = el.dataset.timer;
    if (timer) clearTimeout(Number(timer));
    setTimeout(() => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 200);
  }

  return { show };
})();

// 2) Loading Overlay
const LoadingOverlay = (() => {
  const ID = 'global-loading-overlay';

  function show(message = 'Processing your request...') {
    if (document.getElementById(ID)) return;
    const overlay = document.createElement('div');
    overlay.id = ID;
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15,23,42,0.65)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9998';
    overlay.style.backdropFilter = 'blur(4px)';

    const box = document.createElement('div');
    box.style.background = '#0b1120';
    box.style.borderRadius = '24px';
    box.style.padding = '24px 28px';
    box.style.boxShadow = '0 25px 50px rgba(0,0,0,0.4)';
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.alignItems = 'center';
    box.style.color = '#e5e7eb';
    box.style.minWidth = '260px';

    const spinner = document.createElement('div');
    spinner.style.width = '36px';
    spinner.style.height = '36px';
    spinner.style.borderRadius = '999px';
    spinner.style.border = '3px solid rgba(16,185,129,0.2)';
    spinner.style.borderTopColor = '#10b981';
    spinner.style.animation = 'spin 0.75s linear infinite';

    const label = document.createElement('div');
    label.textContent = message;
    label.style.marginTop = '12px';
    label.style.fontSize = '14px';
    label.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    box.appendChild(spinner);
    box.appendChild(label);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function hide() {
    const overlay = document.getElementById(ID);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  return { show, hide };
})();

// 3) Simple Modal Helper (for non-Alpine modals if needed)
const ModalHelper = (() => {
  function openById(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'flex';
  }

  function closeById(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'none';
  }

  function bindCloseOnBackdrop(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      if (e.target === el) closeById(id);
    });
  }

  return { openById, closeById, bindCloseOnBackdrop };
})();

// 4) Basic Form Validation Helpers
const FormValidator = (() => {
  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).toLowerCase());
  }

  function isPhone(value) {
    return /^[0-9+\-\s]{7,15}$/.test(String(value));
  }

  function isNotEmpty(value) {
    return String(value || '').trim().length > 0;
  }

  function validateOrderForm(formData) {
    const errors = {};

    if (!isNotEmpty(formData.name)) {
      errors.name = 'Name is required';
    }
    if (!isEmail(formData.email)) {
      errors.email = 'Valid email is required';
    }
    if (!isPhone(formData.phone)) {
      errors.phone = 'Valid phone number is required';
    }
    if (!isNotEmpty(formData.address)) {
      errors.address = 'Delivery address is required';
    }

    return errors;
  }

  return { isEmail, isPhone, isNotEmpty, validateOrderForm };
})();

// ─────────────────────────────────────────────────────────────
// 5) NProgress — Lightweight top loading bar for route changes
// ─────────────────────────────────────────────────────────────
const NProgress = (() => {
  const BAR_ID = 'nprogress-bar';
  let _timer = null;
  let _value  = 0;

  function _bar() {
    let el = document.getElementById(BAR_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = BAR_ID;
      Object.assign(el.style, {
        position: 'fixed', top: '0', left: '0', height: '2px', width: '0%',
        background: 'linear-gradient(to right, #16a34a, #facc6b)',
        zIndex: '99999', transition: 'width 0.2s ease, opacity 0.4s ease',
        pointerEvents: 'none', boxShadow: '0 0 8px rgba(22,163,74,0.7)',
      });
      document.documentElement.appendChild(el);
    }
    return el;
  }

  function _set(n) {
    _value = Math.min(Math.max(n, 0.08), 1);
    const b = _bar();
    b.style.opacity = '1';
    b.style.width   = `${_value * 100}%`;
  }

  function start() {
    _set(0.08);
    clearInterval(_timer);
    _timer = setInterval(() => { if (_value < 0.9) _set(_value + (0.9 - _value) * 0.15 + 0.005); }, 200);
  }

  function done() {
    clearInterval(_timer);
    _set(1);
    const b = _bar();
    setTimeout(() => { b.style.opacity = '0'; setTimeout(() => { b.style.width = '0%'; }, 400); }, 200);
  }

  return { start, done };
})();

// ─────────────────────────────────────────────────────────────
// 6) MetaTags — Dynamic SEO meta + canonical + noindex manager
// ─────────────────────────────────────────────────────────────
const MetaTags = (() => {
  const SITE_NAME = 'EmproiumVipani';
  const BASE_URL  = 'https://emproiumvipani.com';
  const DEFAULTS  = {
    title: 'EmproiumVipani – Curated Objects',
    description: 'Curated objects for desks, rituals, and learning. A single interface for many independent makers.',
    image: `${BASE_URL}/icon-512.png`,
    url: BASE_URL,
  };

  function _upsert(selector, tag, attrKey, attrVal, contentAttr, content) {
    let el = document.querySelector(selector);
    if (!el) { el = document.createElement(tag); el.setAttribute(attrKey, attrVal); document.head.appendChild(el); }
    el.setAttribute(contentAttr, content);
  }

  function update({ title, description, image, url, noindex } = {}) {
    const t = title ? `${title} – ${SITE_NAME}` : DEFAULTS.title;
    const d = description || DEFAULTS.description;
    const img = image || DEFAULTS.image;
    const u   = url   || DEFAULTS.url;
    const robots = noindex ? 'noindex, nofollow' : 'index, follow';

    document.title = t;
    _upsert('meta[name="description"]',    'meta', 'name',     'description',    'content', d);
    _upsert('meta[property="og:title"]',   'meta', 'property', 'og:title',       'content', t);
    _upsert('meta[property="og:description"]','meta','property','og:description', 'content', d);
    _upsert('meta[property="og:image"]',   'meta', 'property', 'og:image',       'content', img);
    _upsert('meta[property="og:url"]',     'meta', 'property', 'og:url',         'content', u);
    _upsert('meta[name="twitter:title"]',  'meta', 'name',     'twitter:title',  'content', t);
    _upsert('meta[name="twitter:description"]','meta','name','twitter:description','content',d);
    _upsert('meta[name="twitter:image"]',  'meta', 'name',     'twitter:image',  'content', img);
    _upsert('meta[name="robots"]',         'meta', 'name',     'robots',         'content', robots);
    _upsert('link[rel="canonical"]',       'link', 'rel',      'canonical',      'href',    u);
  }

  function reset() { update(DEFAULTS); }

  return { update, reset, DEFAULTS };
})();

// ─────────────────────────────────────────────────────────────
// 7) StructuredData — JSON-LD schema injector (Product + site)
// ─────────────────────────────────────────────────────────────
const StructuredData = (() => {
  function _upsert(id, schema) {
    let s = document.getElementById(id);
    if (!s) { s = document.createElement('script'); s.id = id; s.type = 'application/ld+json'; document.head.appendChild(s); }
    s.textContent = JSON.stringify(JSON.parse(JSON.stringify(schema)));
  }

  function injectProduct(product, seller) {
    _upsert('json-ld-product', {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.description || product.name,
      image: product.image && product.image.startsWith('http') ? product.image : undefined,
      offers: {
        '@type': 'Offer', price: product.price, priceCurrency: 'INR',
        availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: `https://emproiumvipani.com/#product-${product.id}`,
        seller: seller ? { '@type': 'Organization', name: seller.name } : undefined,
      },
      aggregateRating: product.rating > 0 ? {
        '@type': 'AggregateRating',
        ratingValue: String(product.rating), reviewCount: String(product.sales || 1),
        bestRating: '5', worstRating: '1',
      } : undefined,
    });
  }

  function removeProduct() { document.getElementById('json-ld-product')?.remove(); }

  return { injectProduct, removeProduct };
})();

// ─────────────────────────────────────────────────────────────
// 8) TrustScore — Seller trust calculator & badge
// ─────────────────────────────────────────────────────────────
const TrustScore = (() => {
  function calculate(seller) {
    if (!seller) return 0;
    const r = ((seller.rating || 0) / 5) * 40;
    const s = Math.min((seller.sales || seller.totalSales || 0) / 1000, 1) * 30;
    const v = seller.verified ? 20 : 0;
    const p = seller.responseRate ? (seller.responseRate / 100) * 10 : 5;
    return Math.round(r + s + v + p);
  }

  function badge(score) {
    if (score >= 80) return { label: 'Highly Trusted', color: '#16a34a' };
    if (score >= 60) return { label: 'Trusted',        color: '#22c55e' };
    if (score >= 40) return { label: 'Growing',        color: '#eab308' };
    return               { label: 'New Seller',        color: '#6b7280' };
  }

  return { calculate, badge };
})();

// ─────────────────────────────────────────────────────────────
// 9) AuctionTimer — Live countdown for auction listings
// ─────────────────────────────────────────────────────────────
const AuctionTimer = (() => {
  const _t = new Map();

  function _fmt(ms) {
    if (ms <= 0) return '00:00:00';
    const s = Math.floor(ms / 1000);
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(v => String(v).padStart(2, '0')).join(':');
  }

  function start(id, endsAt, onTick, onEnd) {
    stop(id);
    const end = new Date(endsAt).getTime();
    const tick = () => {
      const rem = end - Date.now();
      if (rem <= 0) { stop(id); onEnd?.(); onTick?.('00:00:00', 0); return; }
      onTick?.(_fmt(rem), rem);
    };
    tick();
    _t.set(id, setInterval(tick, 1000));
  }

  function stop(id) { if (_t.has(id)) { clearInterval(_t.get(id)); _t.delete(id); } }
  function stopAll() { _t.forEach((_, id) => stop(id)); }

  return { start, stop, stopAll };
})();

// ─────────────────────────────────────────────────────────────
// 10) GlobalObserver — IntersectionObserver (lazy images + data)
// ─────────────────────────────────────────────────────────────
const GlobalObserver = (() => {
  const _reg = new Map();
  const _io  = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const cb = _reg.get(e.target);
            if (cb) { cb(e.target); _io.unobserve(e.target); _reg.delete(e.target); }
          }
        });
      }, { rootMargin: '200px 0px', threshold: 0 })
    : null;

  function observe(el, cb) {
    if (!_io || !el) { cb?.(el); return; }
    _reg.set(el, cb);
    _io.observe(el);
  }

  // Blur-up lazy image: set data-src on <img>; call this after mounting.
  function lazyImage(img) {
    if (!img || img.dataset.loaded) return;
    const hires = img.dataset.src;
    if (!hires) return;
    // Show tiny placeholder / blur while waiting
    img.style.filter     = 'blur(8px)';
    img.style.transition = 'filter 0.5s ease';
    observe(img, () => {
      const hi = new Image();
      hi.src = hires;
      hi.onload = () => { img.src = hires; img.style.filter = 'none'; img.dataset.loaded = '1'; };
    });
  }

  return { observe, lazyImage };
})();

// ─────────────────────────────────────────────────────────────
// 11) GlobalErrorHandler — Branded 401 / 404 / 500 error modals
// ─────────────────────────────────────────────────────────────
const GlobalErrorHandler = (() => {
  const ID = 'ev-error-modal';
  const INFO = {
    401: { icon: '🔒', title: 'Session Expired',   body: 'Please sign in again to continue.',                cta: 'Sign in' },
    403: { icon: '⛔', title: 'Access Denied',     body: "You don't have permission to view this.",          cta: 'Go home' },
    404: { icon: '🔍', title: 'Not Found',         body: 'The page or resource you requested was not found.', cta: 'Go home' },
    500: { icon: '⚠️', title: 'Server Error',      body: 'Something went wrong on our end. Try again shortly.', cta: 'Retry' },
    0:   { icon: '📡', title: 'No Connection',     body: 'Check your internet connection and try again.',     cta: 'Retry' },
  };

  function show(code, onCta) {
    document.getElementById(ID)?.remove();
    const i   = INFO[code] || INFO[500];
    const div = document.createElement('div');
    div.id = ID;
    div.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.78);backdrop-filter:blur(10px);padding:1rem';
    div.innerHTML = `
      <div style="background:#0b1020;border:1px solid #1f2937;border-radius:1.5rem;padding:2rem 1.75rem;max-width:380px;width:100%;text-align:center;color:#f1f5f9;font-family:system-ui,sans-serif;box-shadow:0 25px 60px rgba(0,0,0,0.5)">
        <div style="font-size:2.8rem;margin-bottom:0.75rem">${i.icon}</div>
        <div style="font-size:1.1rem;font-weight:700;margin-bottom:0.5rem">${i.title}</div>
        <p style="font-size:0.8rem;color:#94a3b8;margin-bottom:1.5rem;line-height:1.5">${i.body}</p>
        <div style="display:flex;gap:0.5rem;justify-content:center">
          <button id="${ID}-cta" style="background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;border:none;border-radius:999px;padding:0.5rem 1.25rem;font-size:0.8rem;cursor:pointer;font-weight:600">${i.cta}</button>
          <button id="${ID}-cls" style="background:transparent;color:#94a3b8;border:1px solid #374151;border-radius:999px;padding:0.5rem 1.25rem;font-size:0.8rem;cursor:pointer">Dismiss</button>
        </div>
      </div>`;
    document.body.appendChild(div);
    document.getElementById(`${ID}-cta`).onclick = () => {
      div.remove();
      if (typeof onCta === 'function') { onCta(); return; }
      if (code === 401) window.store?.openModal('login');
      else              window.location.href = '/';
    };
    document.getElementById(`${ID}-cls`).onclick = () => div.remove();
  }

  function dismiss() { document.getElementById(ID)?.remove(); }

  return { show, dismiss };
})();

// ─────────────────────────────────────────────────────────────
// 12) GSTBilling — Indian tax invoice logic (inline; see also gst_billing.js)
// ─────────────────────────────────────────────────────────────
const GSTBilling = (() => {
  // HSN codes by category (simplified)
  const HSN = {
    'Natural Products': '0910', 'Stationery': '4820', 'Worksheets': '4901',
    'Books': '4901', 'Electronics': '8471', 'Fashion': '6211',
    'Home & Kitchen': '7323', 'Health & Beauty': '3304', 'Toys & Games': '9503',
    'Art & Crafts': '9608', 'Sports & Outdoors': '9506', 'Other': '9999',
  };

  // GST rates by category (%)
  const GST_RATE = {
    'Natural Products': 5, 'Worksheets': 0, 'Books': 0, 'Stationery': 12,
    'Electronics': 18, 'Fashion': 12, 'Home & Kitchen': 18, 'Health & Beauty': 18,
    'Toys & Games': 28, 'Art & Crafts': 12, 'Sports & Outdoors': 18, 'Other': 18,
  };

  /**
   * Calculate GST for a cart item.
   * buyerState === sellerState → CGST + SGST (each half); else → IGST.
   */
  function calculateItemTax(item, buyerState, sellerState = 'Delhi') {
    const rate    = (GST_RATE[item.category] || 18) / 100;
    const taxable = item.price * item.quantity;
    const total   = taxable * rate;
    const intra   = buyerState && buyerState.toLowerCase() === sellerState.toLowerCase();
    return {
      hsn:      HSN[item.category] || '9999',
      taxable,
      gstRate:  rate * 100,
      cgst:     intra ? total / 2 : 0,
      sgst:     intra ? total / 2 : 0,
      igst:     intra ? 0 : total,
      totalTax: total,
      grandTotal: taxable + total,
    };
  }

  /** Generate a complete GST invoice object from cart + buyer info. */
  function generateInvoice({ cart, buyerName, buyerAddress, buyerState, buyerGST, invoiceNo, sellerState }) {
    const date  = new Date();
    const lines = cart.map(item => ({ ...item, tax: calculateItemTax(item, buyerState, sellerState) }));
    const totals = lines.reduce((acc, l) => ({
      taxable:  acc.taxable  + l.tax.taxable,
      cgst:     acc.cgst     + l.tax.cgst,
      sgst:     acc.sgst     + l.tax.sgst,
      igst:     acc.igst     + l.tax.igst,
      totalTax: acc.totalTax + l.tax.totalTax,
      grand:    acc.grand    + l.tax.grandTotal,
    }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, grand: 0 });

    return {
      invoiceNo:  invoiceNo || `EV-INV-${Date.now()}`,
      invoiceDate: date.toLocaleDateString('en-IN'),
      seller:     { name: 'EmproiumVipani', gstin: 'PENDING', state: sellerState || 'Delhi' },
      buyer:      { name: buyerName, address: buyerAddress, state: buyerState, gstin: buyerGST || '' },
      lines,
      totals,
    };
  }

  return { calculateItemTax, generateInvoice, HSN, GST_RATE };
})();

// ─────────────────────────────────────────────────────────────
// 13) PartnerStore — Gromo-style partner/agent state & logic
// ─────────────────────────────────────────────────────────────
const PartnerStore = (() => {
  const KEY = 'ev_partner';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  }

  function save(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
  function clear()    { localStorage.removeItem(KEY); }

  /** Generate agent ID: EV-AGNT-YYYY-NNN */
  function generateAgentId(seq = 1) {
    const yr  = new Date().getFullYear();
    const num = String(seq).padStart(3, '0');
    return `EV-AGNT-${yr}-${num}`;
  }

  /**
   * Commission tiers:
   *  Bronze  (< ₹10 000 GMV)  → 5 %
   *  Silver  (₹10 000–₹50 000) → 8 %
   *  Gold    (₹50 000–₹2 00 000) → 10 %
   *  Platinum (> ₹2 00 000)    → 12 %
   */
  function commissionRate(totalGmv = 0) {
    if (totalGmv >= 200000) return { tier: 'Platinum', rate: 0.12 };
    if (totalGmv >= 50000)  return { tier: 'Gold',     rate: 0.10 };
    if (totalGmv >= 10000)  return { tier: 'Silver',   rate: 0.08 };
    return                         { tier: 'Bronze',   rate: 0.05 };
  }

  return { load, save, clear, generateAgentId, commissionRate };
})();

// ─────────────────────────────────────────────────────────────
// 14) WebVitals — Core Web Vitals monitoring (LCP / CLS / FID)
// ─────────────────────────────────────────────────────────────
function initWebVitals() {
  if (!('PerformanceObserver' in window)) return;
  // LCP
  try {
    new PerformanceObserver(list => {
      const e = list.getEntries().at(-1);
      const ms = Math.round(e.startTime);
      console.log(`[WebVitals] LCP: ${ms}ms`, ms < 1200 ? '✅ Good' : ms < 2500 ? '⚠️ Improve' : '❌ Poor');
      window.dataLayer?.push({ event: 'web_vital', metric: 'LCP', value: ms });
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  // CLS
  let cls = 0;
  try {
    new PerformanceObserver(list => {
      list.getEntries().forEach(e => { if (!e.hadRecentInput) cls += e.value; });
      console.log(`[WebVitals] CLS: ${cls.toFixed(4)}`, cls < 0.1 ? '✅ Good' : cls < 0.25 ? '⚠️ Improve' : '❌ Poor');
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  // FID / INP
  try {
    new PerformanceObserver(list => {
      list.getEntries().forEach(e => {
        const d = Math.round(e.processingStart - e.startTime);
        console.log(`[WebVitals] FID: ${d}ms`, d < 100 ? '✅ Good' : d < 300 ? '⚠️ Improve' : '❌ Poor');
      });
    }).observe({ type: 'first-input', buffered: true });
  } catch {}
}

// ─────────────────────────────────────────────────────────────
// 15) Global Helpers — attach to window
// ─────────────────────────────────────────────────────────────
window.UIComponents = {
  Toast, LoadingOverlay, ModalHelper, FormValidator,
  NProgress, MetaTags, StructuredData, TrustScore, AuctionTimer,
  GlobalObserver, GlobalErrorHandler, GSTBilling, PartnerStore,
};

// Convenience globals
window.NProgress         = NProgress;
window.MetaTags          = MetaTags;
window.StructuredData    = StructuredData;
window.TrustScore        = TrustScore;
window.AuctionTimer      = AuctionTimer;
window.GlobalObserver    = GlobalObserver;
window.GlobalErrorHandler= GlobalErrorHandler;
window.GSTBilling        = GSTBilling;
window.PartnerStore      = PartnerStore;
window.initWebVitals     = initWebVitals;

console.log('✅ components.js loaded — all utilities available on window.UIComponents');
