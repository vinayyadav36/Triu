# EmproiumVipani — Master Architecture & Platform Blueprint

> Made in India · For India · By India  
> Inspired by Airbnb + Zomato · Production-ready from day one

---

## 1. Business Model

**Three-sided marketplace:**

| Side | Role |
|------|------|
| **Demand** | Guests/customers discovering, booking, ordering |
| **Supply** | Hosts/vendors/restaurants/service providers listing and fulfilling |
| **Operator** | Platform managing trust, payments, GST, operations, settlements |

**Revenue streams:** commissions on bookings/orders, convenience fees, featured listing slots, merchant subscriptions.

---

## 2. Core Product Rules (Non-negotiable)

1. **Public browsing without login** — Home, search, listings, menus, profiles, maps
2. **OTP only on protected actions** — Booking, ordering, checkout, chat, review, wishlist sync, seller onboarding, dashboard
3. **Guest session upgrade** — Cart, favorites, draft bookings transfer to verified account after OTP
4. **Admin-only-UI operations** — Every platform action executable from the admin panel; no raw DB edits needed
5. **GST-aware from day one** — CGST/SGST for intra-state, IGST for inter-state; all amounts tracked for returns
6. **No demo data** — Real Indian product data, real addresses, real business flows from first seed

---

## 3. Technology Stack

```
Frontend  : Vite + Alpine.js (current) | Next.js + TypeScript (target upgrade)
Backend   : Express.js + Node.js
Database  : MongoDB + Mongoose (current) | PostgreSQL + Prisma (target)
Cache     : Redis (rate limiting, OTP tokens, session coordination)
Realtime  : Socket.io (chat, booking availability, order status)
Documents : HTML templates → PDF via headless Chromium (puppeteer)
Payments  : Razorpay (INR, UPI, cards, net banking)
SMS/OTP   : Twilio / MSG91 / Fast2SMS (with console fallback in dev)
CI/CD     : GitHub Actions (ci.yml, e2e.yml, cd-staging.yml, cd-production.yml)
E2E Tests : Playwright (local + CI) + LambdaTest (cross-browser grid)
```

---

## 4. Repository Structure

```
/
├── src/                          # Frontend (Vite + Alpine.js)
│   ├── index.html                # Main customer-facing SPA
│   ├── admin.html                # Admin panel
│   ├── supplier.html             # Seller/partner portal
│   ├── app.js                    # AppStore (Alpine global state, auth, cart, wishlist)
│   ├── api-service.js            # All API calls (REST client)
│   ├── form-handlers.js          # Form submit handlers
│   ├── components.js             # Shared Alpine components
│   └── email-config.js           # EmailJS integration
│
├── server/                       # Backend (Express + MongoDB)
│   ├── server.js                 # Express app entry point
│   ├── models/
│   │   ├── User.js               # users (customers, sellers, admins)
│   │   ├── Product.js            # products/listings
│   │   ├── Order.js              # orders + order_items
│   │   ├── OtpToken.js           # OTP requests & verification
│   │   ├── Settlement.js         # vendor settlement batches
│   │   ├── SupportTicket.js      # support tickets
│   │   └── GeneratedDocument.js  # document generation history
│   ├── routes/
│   │   ├── auth.js               # OTP request, verify, register, login
│   │   ├── products.js           # listing CRUD + search
│   │   ├── orders.js             # order lifecycle
│   │   ├── sellers.js            # seller onboarding
│   │   ├── users.js              # user profile
│   │   ├── payments.js           # Razorpay integration
│   │   ├── search.js             # full-text search
│   │   └── admin.js              # admin panel APIs
│   ├── middleware/
│   │   └── auth.js               # JWT verify + role guard
│   ├── utils/
│   │   ├── validators.js         # input validation helpers
│   │   └── auditLogger.js        # DPDP-compliant audit logging
│   ├── scripts/
│   │   ├── db-seed.js            # seed real Indian data
│   │   ├── db-reset.js           # drop + reseed
│   │   └── db-migrate.js         # ensure indexes
│   └── tests/
│       ├── unit/                 # Jest unit tests
│       └── integration/          # Jest + supertest + MongoMemoryServer
│
├── tests/
│   ├── e2e/                      # Playwright E2E tests
│   │   ├── guest-browsing.spec.js
│   │   ├── auth-guard.spec.js
│   │   ├── cart.spec.js
│   │   └── smoke.spec.js
│   ├── smoke/
│   │   └── smoke.test.js         # Post-deploy HTTP smoke test (no browser)
│   └── browser/
│       └── lambdatest-runner.js  # LambdaTest cross-browser Playwright
│
├── scripts/
│   ├── setup.sh                  # One-command local dev setup
│   └── smoke-test.sh             # Shell-based smoke check
│
├── .github/
│   └── workflows/
│       ├── ci.yml                # Lint + unit + integration + build (on PR)
│       ├── e2e.yml               # Playwright + LambdaTest (on PR + main push)
│       ├── cd-staging.yml        # Auto-deploy to staging after CI passes
│       └── cd-production.yml     # Manual production deploy with approval gate
│
├── playwright.config.js
├── vite.config.js
├── package.json                  # Root scripts: all npm run commands
└── ARCHITECTURE.md               # This file
```

---

## 5. Domain Modules

### 5.1 Auth — Guest + OTP

| Aspect | Detail |
|--------|--------|
| Guest session | Auto-generated UUID in localStorage, passed as `x-guest-id` header |
| Guarded actions | Checkout, Order, Chat, Review, Wishlist sync, Seller dashboard |
| OTP flow | Phone/email → `POST /api/auth/request-otp` → 6-digit code → `POST /api/auth/verify-otp` |
| Guest upgrade | After OTP success, cart/favorites/draft bookings merged from guest ID into verified user |
| Rate limiting | 5 requests / 10 min per IP on OTP endpoints |
| Session | JWT (15 min expiry) + refresh token (7 days) |

### 5.2 Discovery & Search

| Endpoint | Description |
|----------|-------------|
| `GET /api/products` | Listings with category, price, rating, location filters |
| `GET /api/search?q=` | Full-text search across products + seller names |
| `GET /api/products/:id` | Listing detail with seller info |

### 5.3 Cart & Orders

| State | Behavior |
|-------|----------|
| Guest cart | Stored in `localStorage` under `emproium_cart` |
| Checkout | Requires OTP — triggers contextual auth modal, not page redirect |
| Order creation | `POST /api/orders` (JWT required) |
| Guest merge | On OTP success, localStorage cart POSTed to API to create order |

### 5.4 Admin Panel APIs

| Route | Method | Description |
|-------|--------|-------------|
| `/api/admin/dashboard` | GET | KPIs: GMV, orders, users, GST |
| `/api/admin/users` | GET | List + search users |
| `/api/admin/users/:id/status` | PUT | Activate / suspend user |
| `/api/admin/sellers` | GET | List sellers by status |
| `/api/admin/sellers/:id/approve` | PUT | Approve seller |
| `/api/admin/sellers/:id/reject` | PUT | Reject with reason |
| `/api/admin/sellers/:id/suspend` | PUT | Suspend seller |
| `/api/admin/orders` | GET | All marketplace orders |
| `/api/admin/orders/:id/status` | PUT | Update order status |
| `/api/admin/orders/:id/refund` | PUT | Process refund |
| `/api/admin/finance/gst-summary` | GET | GST liability by period |
| `/api/admin/finance/sales-register` | GET | Itemised sales register |
| `/api/admin/settlements` | GET | Vendor settlement batches |
| `/api/admin/settlements/:id/freeze` | PUT | Freeze payout |
| `/api/admin/settlements/:id/release` | PUT | Release frozen payout |
| `/api/admin/settlements/:id/pay` | PUT | Mark as paid with UTR |
| `/api/admin/tickets` | GET/POST | Support tickets |
| `/api/admin/tickets/:id/resolve` | PUT | Resolve ticket |
| `/api/admin/tickets/:id/message` | POST | Add admin reply |
| `/api/admin/documents/generate` | POST | Generate document |
| `/api/admin/documents` | GET | Document history |
| `/api/admin/documents/:id/html` | GET | Render document as HTML |
| `/api/admin/settings` | GET/PUT | Platform configuration |

### 5.5 GST Bookkeeping

- **Intra-state** (buyer state = seller state): CGST + SGST (equal split)
- **Inter-state**: IGST only
- **Registers**: Sales register (per-order), GST summary (by period), commission register
- **Rates**: 0% Books, 5% Natural Products, 12% Stationery/Fashion, 18% Electronics/Home/Health, 28% Toys
- **Compliance note**: E-invoicing (IRN/QR) applies above prescribed turnover thresholds per GST Act 2017 — schema designed to support future e-invoice fields (GSTIN, HSN/SAC, place of supply)

### 5.6 Document Generator

**Supported types:** Tax Invoice, Receipt, Credit Note, Debit Note, Order Confirmation, Booking Confirmation, Cancellation Receipt, Refund Receipt, Settlement Statement, Payout Summary, Commission Statement

**Output:** HTML (printable) → PDF via browser print or headless Chromium

**Each document includes:** Platform name, GSTIN, document number, date, customer details, line items with HSN/SAC, taxable value, CGST/SGST/IGST breakdown, total, payment method, place of supply, compliance footer

---

## 6. CI/CD Pipeline

```
PR opened / push to main
        │
        ▼
  ci.yml runs
  ├── Lint (frontend + backend)
  ├── Unit tests (Jest — no DB)
  ├── Integration tests (Jest + MongoMemoryServer)
  └── Vite build
        │
        ▼ (on merge to main)
  cd-staging.yml
  ├── CI gate (reuses ci.yml)
  ├── Build with staging env secrets
  ├── Deploy to staging
  └── Smoke tests against staging URL
        │
        ▼ (manual workflow_dispatch with "DEPLOY" confirmation)
  cd-production.yml
  ├── CI gate
  ├── Build with production env secrets
  ├── Requires 'production' GitHub environment (reviewer approval)
  ├── Deploy to production
  └── Smoke tests against production URL
```

**Concurrency:** `cancel-in-progress: true` for CI/E2E, `false` for CD (never cancel in-flight deploys)

**LambdaTest matrix** (runs on main push):
- Chrome latest / Windows 10
- Edge latest / Windows 10
- Safari 16 / macOS Ventura
- Firefox latest / Windows 10
- Pixel 5 / Android 12 / Chrome
- iPhone 14 / iOS 16 / Safari

---

## 7. NPM Scripts Reference

```bash
# Root
npm run dev           # Start Vite dev server (frontend)
npm run build         # Production Vite build
npm run preview       # Preview production build locally
npm run start         # Serve production build on port 4173
npm run lint          # ESLint frontend JS
npm run test          # Run all backend tests
npm run test:unit     # Backend unit tests only
npm run test:integration  # Backend integration tests (MongoMemoryServer)
npm run test:e2e      # Playwright E2E tests
npm run test:e2e:ci   # Playwright in CI mode (GitHub reporter)
npm run test:browser  # LambdaTest cross-browser suite
npm run db:seed       # Seed database with real Indian data
npm run db:reset      # Drop all data and reseed
npm run db:migrate    # Ensure DB indexes
npm run smoke:test    # Post-deploy HTTP smoke tests

# Backend (server/)
cd server && npm run dev       # Nodemon dev server (port 5000)
cd server && npm test          # All Jest tests
cd server && npm run test:unit
cd server && npm run test:integration
```

---

## 8. Environment Variables

### Frontend (.env)
```
VITE_API_URL=http://localhost:5000/api
VITE_RAZORPAY_KEY_ID=rzp_test_...
VITE_EMAILJS_PUBLIC_KEY=...
VITE_EMAILJS_SERVICE_ID=...
VITE_EMAILJS_TEMPLATE_ID=...
```

### Backend (server/.env)
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/emproiumvipani
JWT_SECRET=<strong-random-string>
JWT_EXPIRE=15m
CLIENT_URL=http://localhost:5173
NODE_ENV=development
OTP_PROVIDER=console       # console | twilio | msg91 | fast2sms
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE=+1...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
```

### GitHub Secrets (per environment)
```
# staging environment
STAGING_API_URL, STAGING_RAZORPAY_KEY_ID, MONGODB_URI_TEST

# production environment  
PRODUCTION_API_URL, PRODUCTION_RAZORPAY_KEY_ID, MONGODB_URI

# LambdaTest
LT_USERNAME, LT_ACCESS_KEY
```

---

## 9. Local Development Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/vinayyadav36/Triu.git
cd Triu
bash scripts/setup.sh        # installs deps, copies .env, seeds DB

# 2. Start backend
cd server && npm run dev      # http://localhost:5000

# 3. Start frontend (new terminal)
npm run dev                   # http://localhost:5173

# 4. Open admin panel
# http://localhost:5173/admin.html
# Set MKT API to http://localhost:5000/api in Data Settings

# 5. Run tests
npm run test:unit
npm run test:integration
npm run test:e2e
```

---

## 10. Acceptance Criteria

The platform is production-ready when:

- [ ] Public browsing works without any login prompt
- [ ] OTP is triggered only on protected actions (checkout, order, chat, review)
- [ ] Guest cart/data merges correctly into verified account after OTP
- [ ] Admin can perform all operations from the UI only (no DB access needed)
- [ ] GST summary and sales register reflect real order data
- [ ] Documents (invoice, receipt, credit note) generate with correct GST breakdown
- [ ] Settlement freeze/release/pay workflow functions end-to-end
- [ ] Support tickets can be created, replied to, and resolved from admin UI
- [ ] All CI/CD workflows pass on a clean push
- [ ] Playwright E2E tests pass across Chromium, Firefox, WebKit
- [ ] LambdaTest cross-browser suite shows no critical failures
- [ ] Smoke tests pass against staging deployment
- [ ] Database is seeded with real Indian data (no placeholder text)
- [ ] Zero hardcoded secrets in source code
