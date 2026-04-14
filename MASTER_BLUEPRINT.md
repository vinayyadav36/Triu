# EMPROIUM VIPANI — MASTER BLUEPRINT

**Version:** 2.0  
**Last Updated:** 2025  
**Status:** Production-Ready Architecture Specification

---

## TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Database Schema Reference](#3-database-schema-reference)
4. [API Endpoint Reference](#4-api-endpoint-reference)
5. [AI/ML Bot Suite](#5-aiml-bot-suite)
6. [Billing Engine — Multi-Sector](#6-billing-engine--multi-sector)
7. [Authentication Flow](#7-authentication-flow)
8. [Deployment Roadmap](#8-deployment-roadmap)
9. [Gamification System](#9-gamification-system)
10. [Data Pipeline & Validation](#10-data-pipeline--validation)
11. [Monitoring & Observability](#11-monitoring--observability)
12. [Trading Bot Strategy Spec](#12-trading-bot-strategy-spec)
13. [Security Architecture](#13-security-architecture)
14. [Frontend Component Map](#14-frontend-component-map)
15. [Environment Configuration](#15-environment-configuration)

---

## 1. System Overview

EmproiumVipani is a **multi-vendor marketplace platform** built for small and medium businesses in India. It supports:

- **Vendor/Seller Management** — onboarding, KYC, product listings, inventory
- **Order Lifecycle** — cart → checkout → payment → fulfilment → invoice
- **GST-Compliant Billing** — CGST, SGST, IGST, HSN codes, e-invoicing
- **Multi-Sector Billing Engine** — Retail, Food Delivery, Petrol Pump, Hotel
- **AI/ML Bots** — Digital marketing, financial planning, trading, data science, forecasting
- **Gamification** — XP/levels/badge system for admin engagement
- **Retro CRT UI** — Scanline effects, pixel art badges, Web Audio sound effects

### Technology Stack

| Layer          | Technology                              |
|----------------|-----------------------------------------|
| Frontend       | Vanilla JS + Alpine.js + Tailwind CSS   |
| Backend        | Node.js + Express.js                    |
| Storage        | JSON flat-file DB (dev) + PostgreSQL    |
| Cache          | Redis (optional) with in-memory fallback|
| Auth           | JWT (Access 15m + Refresh 7d)           |
| Email          | SMTP via Nodemailer                     |
| ML Scripts     | Python 3.x (stdlib + pandas optional)  |
| Deployment     | Docker + Vercel + GitHub Actions        |
| Monitoring     | Prometheus + Grafana                    |

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                  │
│                                                                       │
│   ┌───────────────┐  ┌───────────────┐  ┌──────────────────────┐   │
│   │  index.html   │  │  admin.html   │  │  partner.html        │   │
│   │  (Storefront) │  │  (Nexus)      │  │  (Seller Portal)     │   │
│   │  Alpine.js    │  │  Alpine.js    │  │  Alpine.js           │   │
│   │  Tailwind CSS │  │  XP/Badges    │  │                      │   │
│   └───────┬───────┘  └───────┬───────┘  └──────────┬───────────┘   │
│           │                  │                       │               │
│           └──────────────────┼───────────────────────┘               │
│                              │  HTTPS / REST API                     │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                       API GATEWAY LAYER                              │
│                                                                       │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │              Express.js Server (server/index.js)           │    │
│   │                                                            │    │
│   │  Middleware:  JWT Auth │ Rate Limit │ Helmet │ CORS        │    │
│   │               Body Parser │ Audit Logger                   │    │
│   └─────────────────────────┬──────────────────────────────────┘    │
│                              │                                        │
│   ┌──────────────────────────▼──────────────────────────────────┐   │
│   │                      ROUTE HANDLERS                          │   │
│   │                                                              │   │
│   │  /api/auth      /api/products   /api/orders   /api/billing  │   │
│   │  /api/sellers   /api/gst        /api/admin    /api/ledger   │   │
│   │  /api/users     /api/payments   /api/search   /api/jarvis   │   │
│   └──────────────────────────┬──────────────────────────────────┘   │
└─────────────────────────────-┼──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                       SERVICE LAYER                                  │
│                                                                       │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│  │ billingEngine│ │ gstEngine    │ │invoiceService│ │ledgerSvc   │  │
│  │ (multi-      │ │ (CGST/SGST/  │ │ (PDF + HTML) │ │(double-    │  │
│  │  sector)     │ │  IGST)       │ │              │ │ entry)     │  │
│  └─────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│  │ taxEngine   │ │ emailService │ │settlemntSvc  │ │ eventQueue │  │
│  │ (HSN/GST)   │ │ (SMTP/OTP)   │ │ (vendor pay) │ │ (async)    │  │
│  └─────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                       DATA LAYER                                     │
│                                                                       │
│  ┌──────────────────┐  ┌─────────────────┐  ┌────────────────────┐  │
│  │  PostgreSQL DB   │  │  Redis Cache    │  │  JSON Flat Files   │  │
│  │  (schema.sql)    │  │  (in-memory     │  │  (dev / fallback)  │  │
│  │                  │  │   fallback)     │  │                    │  │
│  │  • users         │  │  • sessions     │  │  • billing_sess    │  │
│  │  • sellers       │  │  • rate limits  │  │  • audit_log       │  │
│  │  • products      │  │  • OTP cache    │  │  • billing_history │  │
│  │  • orders        │  │  • search idx   │  │                    │  │
│  │  • invoices      │  └─────────────────┘  └────────────────────┘  │
│  │  • trades        │                                                 │
│  │  • settlements   │                                                 │
│  └──────────────────┘                                                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    ML / PYTHON BOT LAYER                             │
│                                                                       │
│  digital_marketer_bot.py   →  Campaign plan JSON                     │
│  financial_planner_bot.py  →  Budget plan + text report              │
│  trading_bot.py            →  Backtest + trades log JSON             │
│  data_science_bot.py       →  Clean CSV + quality report             │
│  visualization_bot.py      →  PNG charts / ASCII fallback            │
│  forecasting.py            →  90-day forecast JSON                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema Reference

### 3.1 users

| Column        | Type        | Description                              |
|---------------|-------------|------------------------------------------|
| id            | UUID PK     | Unique identifier                        |
| email         | TEXT UNIQUE | Login email (indexed)                    |
| passwordHash  | TEXT        | bcrypt hash (excluded from API responses)|
| keyHash       | TEXT        | Recovery key hash                        |
| name          | TEXT        | Display name                             |
| role          | ENUM        | admin / seller / buyer / support / bot   |
| phone         | TEXT        | Mobile number (optional)                 |
| is_active     | BOOLEAN     | Soft-delete flag                         |
| meta          | JSONB       | Arbitrary profile data                   |
| created_at    | TIMESTAMPTZ | Record creation timestamp                |
| updated_at    | TIMESTAMPTZ | Auto-updated on change                   |

### 3.2 sellers

| Column         | Type     | Description                               |
|----------------|----------|-------------------------------------------|
| id             | UUID PK  | Unique seller ID                          |
| user_id        | UUID FK  | References users(id)                      |
| business_name  | TEXT     | Registered business name                  |
| gstin          | TEXT     | GST Identification Number                 |
| pan            | TEXT     | Permanent Account Number                  |
| bank_account   | TEXT     | Bank account (encrypted)                  |
| ifsc           | TEXT     | IFSC code                                 |
| address        | JSONB    | Full address object                       |
| category       | TEXT[]   | Product categories sold                   |
| commission_pct | NUMERIC  | Platform commission percentage            |
| status         | TEXT     | pending / active / suspended / rejected   |
| kyc_docs       | JSONB    | KYC document references                   |
| created_at     | TIMESTAMPTZ | Onboarding timestamp                   |

### 3.3 products

| Column        | Type     | Description                               |
|---------------|----------|-------------------------------------------|
| id            | UUID PK  | Unique product ID                         |
| seller_id     | UUID FK  | References sellers(id)                    |
| name          | TEXT     | Product title                             |
| description   | TEXT     | Full description                          |
| category      | TEXT     | Primary category                          |
| brand         | TEXT     | Brand name                                |
| mrp           | NUMERIC  | Maximum retail price                      |
| selling_price | NUMERIC  | Actual selling price                      |
| gst_rate      | NUMERIC  | GST rate (0/5/12/18/28)                   |
| hsn_code      | TEXT     | HSN code for GST classification           |
| sku           | TEXT     | Seller's SKU                              |
| barcode       | TEXT     | EAN/UPC barcode                           |
| stock_qty     | NUMERIC  | Available inventory                       |
| images        | TEXT[]   | Array of image URLs                       |
| is_active     | BOOLEAN  | Listing visibility                        |
| meta          | JSONB    | Tags, variants, dimensions etc.           |

### 3.4 orders

| Column         | Type     | Description                               |
|----------------|----------|-------------------------------------------|
| id             | UUID PK  | Order ID                                  |
| buyer_id       | UUID FK  | References users(id)                      |
| seller_id      | UUID FK  | References sellers(id)                    |
| invoice_id     | UUID FK  | References invoices(id)                   |
| status         | TEXT     | pending/confirmed/shipped/delivered/cancelled/refunded |
| payment_status | TEXT     | unpaid/paid/partial/refunded              |
| subtotal       | NUMERIC  | Pre-tax amount                            |
| discount_amt   | NUMERIC  | Discounts applied                         |
| tax_amt        | NUMERIC  | Total GST                                 |
| shipping_fee   | NUMERIC  | Delivery charge                           |
| total_amt      | NUMERIC  | Final payable amount                      |
| items          | JSONB    | Line items snapshot                       |
| shipping_addr  | JSONB    | Delivery address                          |
| tracking_no    | TEXT     | Courier tracking number                   |
| notes          | TEXT     | Special instructions                      |
| created_at     | TIMESTAMPTZ | Order placement time                   |
| updated_at     | TIMESTAMPTZ | Last status change                     |

### 3.5 invoices

| Column         | Type     | Description                               |
|----------------|----------|-------------------------------------------|
| id             | UUID PK  | Invoice ID                                |
| invoice_no     | TEXT     | Human-readable number (INV-2024-001234)   |
| order_id       | UUID FK  | References orders(id)                     |
| seller_id      | UUID FK  | References sellers(id)                    |
| buyer_id       | UUID FK  | References users(id)                      |
| irn            | TEXT     | e-Invoice Reference Number (GSTN)         |
| invoice_type   | TEXT     | B2B / B2C / export                        |
| place_of_supply| TEXT     | State code for IGST/SGST determination    |
| items          | JSONB    | Full line items with HSN and GST breakdown|
| subtotal       | NUMERIC  | Taxable value                             |
| cgst_amt       | NUMERIC  | Central GST                               |
| sgst_amt       | NUMERIC  | State GST                                 |
| igst_amt       | NUMERIC  | Integrated GST (inter-state)              |
| total_amt      | NUMERIC  | Total including tax                       |
| due_date       | DATE     | Payment due date                          |
| paid_at        | TIMESTAMPTZ | Payment timestamp                      |
| pdf_url        | TEXT     | Stored PDF path                           |

### 3.6 settlements

| Column         | Type     | Description                               |
|----------------|----------|-------------------------------------------|
| id             | UUID PK  | Settlement ID                             |
| seller_id      | UUID FK  | References sellers(id)                    |
| period_start   | DATE     | Settlement cycle start                    |
| period_end     | DATE     | Settlement cycle end                      |
| gross_sales    | NUMERIC  | Total sales in period                     |
| returns_amt    | NUMERIC  | Refunded amounts                          |
| commission_amt | NUMERIC  | Platform commission                       |
| tds_amt        | NUMERIC  | TDS deducted (1% on seller payments)      |
| net_payable    | NUMERIC  | Final amount to transfer                  |
| utr_no         | TEXT     | Bank transfer reference                   |
| status         | TEXT     | pending/processing/paid/failed            |
| paid_at        | TIMESTAMPTZ | Payout timestamp                       |

### 3.7 trades

| Column         | Type     | Description                               |
|----------------|----------|-------------------------------------------|
| id             | UUID PK  | Trade ID                                  |
| user_id        | UUID FK  | References users(id)                      |
| symbol         | TEXT     | Trading symbol (e.g. RELIANCE, BTC-USD)   |
| trade_type     | TEXT     | buy / sell / short / cover                |
| quantity       | NUMERIC  | Number of units/shares                    |
| entry_price    | NUMERIC  | Price at trade entry                      |
| exit_price     | NUMERIC  | Price at trade exit (nullable)            |
| stop_loss      | NUMERIC  | Stop loss price level                     |
| take_profit    | NUMERIC  | Take profit price level                   |
| status         | TEXT     | open / closed / cancelled                 |
| pnl            | NUMERIC  | Profit or loss in currency                |
| pnl_pct        | NUMERIC  | PnL as percentage                         |
| strategy       | TEXT     | Strategy name (e.g. SMA_CROSSOVER)        |
| broker_order_id| TEXT     | Broker's order reference                  |
| exchange       | TEXT     | BSE / NSE / BINANCE / etc.               |
| asset_class    | TEXT     | equity/crypto/forex/commodity/derivatives |
| meta           | JSONB    | Additional trade metadata                 |
| opened_at      | TIMESTAMPTZ | Trade open timestamp                   |
| closed_at      | TIMESTAMPTZ | Trade close timestamp                  |

### 3.8 ml_predictions

| Column        | Type     | Description                               |
|---------------|----------|-------------------------------------------|
| id            | UUID PK  | Prediction record ID                      |
| model_name    | TEXT     | Model identifier                          |
| entity_id     | TEXT     | Seller/product/platform being predicted   |
| entity_type   | TEXT     | seller / product / platform               |
| forecast_date | DATE     | Date being forecasted                     |
| prediction    | NUMERIC  | Predicted value                           |
| lower_bound   | NUMERIC  | 95% confidence interval lower             |
| upper_bound   | NUMERIC  | 95% confidence interval upper             |
| confidence    | NUMERIC  | Model confidence 0.0–1.0                  |
| model_meta    | JSONB    | Model parameters and metadata             |

### 3.9 billing_sessions (billing_schema.sql)

All billing sessions across sectors share this table:

| Column         | Type     | Description                               |
|----------------|----------|-------------------------------------------|
| id             | UUID PK  | Session UUID                              |
| sector         | TEXT     | retail / food / petrol / hotel            |
| outlet_id      | UUID     | Physical outlet reference                 |
| cashier_id     | UUID     | Staff member processing bill              |
| customer_id    | UUID     | Customer (null for walk-in)               |
| customer_name  | TEXT     | Walk-in customer name                     |
| status         | TEXT     | open/hold/paid/voided/refunded            |
| subtotal       | NUMERIC  | Pre-tax, pre-discount total               |
| discount_amt   | NUMERIC  | Total discounts applied                   |
| tax_amt        | NUMERIC  | Total GST collected                       |
| total_amt      | NUMERIC  | Final payable amount                      |
| paid_amt       | NUMERIC  | Amount actually paid                      |
| change_due     | NUMERIC  | Change to return                          |
| payment_method | TEXT     | cash/card/upi/wallet/mixed                |

---

## 4. API Endpoint Reference

### 4.1 Authentication (`/api/auth`)

| Method | Path              | Auth  | Description                     |
|--------|-------------------|-------|---------------------------------|
| POST   | /register         | None  | Register new user               |
| POST   | /login            | None  | Login → returns token pair      |
| POST   | /logout           | JWT   | Invalidate refresh token        |
| POST   | /refresh          | None  | Exchange refresh for new access |
| POST   | /forgot-password  | None  | Send password reset OTP         |
| POST   | /reset-password   | None  | Reset password with OTP         |
| POST   | /verify-otp       | None  | Verify email OTP                |
| GET    | /me               | JWT   | Get current user profile        |

**Sample: POST /api/auth/login**
```json
// Request
{ "email": "admin@emproium.com", "password": "SecurePass@1!" }

// Response 200
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": { "id": "uuid", "email": "...", "role": "admin", "name": "..." }
  }
}
```

### 4.2 Products (`/api/products`)

| Method | Path          | Auth         | Description                    |
|--------|---------------|--------------|--------------------------------|
| GET    | /             | None         | List products (paginated)      |
| GET    | /:id          | None         | Get product details            |
| POST   | /             | seller/admin | Create product listing         |
| PUT    | /:id          | seller/admin | Update product                 |
| DELETE | /:id          | seller/admin | Remove listing                 |
| GET    | /search       | None         | Full-text search               |
| POST   | /:id/stock    | seller/admin | Update inventory               |

**Sample: POST /api/products**
```json
// Request (JWT: seller)
{
  "name": "Wireless Headphones",
  "category": "Electronics",
  "mrp": 3999,
  "selling_price": 2999,
  "gst_rate": 18,
  "hsn_code": "8518",
  "stock_qty": 50
}

// Response 201
{
  "success": true,
  "data": { "id": "uuid", "name": "Wireless Headphones", "sku": "EL-001", ... }
}
```

### 4.3 Orders (`/api/orders`)

| Method | Path              | Auth  | Description                    |
|--------|-------------------|-------|--------------------------------|
| GET    | /                 | admin | List all orders (paginated)    |
| GET    | /my               | JWT   | Get user's own orders          |
| POST   | /                 | JWT   | Place new order                |
| GET    | /:id              | JWT   | Get order details              |
| PUT    | /:id/status       | admin | Update order status            |
| POST   | /:id/cancel       | JWT   | Cancel order                   |
| POST   | /:id/return       | JWT   | Initiate return                |

### 4.4 Billing Engine (`/api/billing`)

| Method | Path                    | Auth    | Description                      |
|--------|-------------------------|---------|----------------------------------|
| POST   | /session                | staff   | Create billing session           |
| GET    | /session/:id            | staff   | Get session details              |
| POST   | /session/:id/item       | staff   | Add line item                    |
| POST   | /session/:id/discount   | staff   | Apply discount                   |
| GET    | /session/:id/totals     | staff   | Recalculate totals               |
| POST   | /session/:id/checkout   | staff   | Finalise and pay                 |
| GET    | /session/:id/slip       | staff   | Get plain-text receipt           |
| POST   | /session/:id/fuel       | staff   | Add fuel reading (petrol)        |
| POST   | /session/:id/room       | staff   | Add room charge (hotel)          |
| POST   | /session/:id/rider      | staff   | Attach rider (food)              |
| GET    | /history                | admin   | Past bills (paginated)           |

**Sample: POST /api/billing/session**
```json
// Request
{ "sector": "retail", "customerName": "John Doe", "customerPhone": "9876543210" }

// Response 201
{
  "success": true,
  "data": {
    "id": "sess_uuid",
    "sector": "retail",
    "status": "open",
    "items": [],
    "subtotal": 0,
    "totalAmt": 0
  }
}
```

**Sample: POST /api/billing/session/:id/checkout**
```json
// Request
{
  "method": "upi",
  "amount": 1180,
  "reference": "UPI_TXN_12345"
}

// Response 200
{
  "success": true,
  "data": {
    "status": "paid",
    "totalAmt": 1180,
    "paidAmt": 1180,
    "changeDue": 0,
    "closedAt": "2025-01-15T10:30:00Z"
  }
}
```

### 4.5 GST (`/api/gst`)

| Method | Path          | Auth  | Description                       |
|--------|---------------|-------|-----------------------------------|
| POST   | /calculate    | JWT   | Calculate GST for line items      |
| GET    | /rates        | None  | Get HSN/GST rate table            |
| GET    | /returns      | admin | List GST return periods           |
| POST   | /returns/file | admin | File GST return                   |

### 4.6 Sellers (`/api/sellers`)

| Method | Path              | Auth    | Description                    |
|--------|-------------------|---------|--------------------------------|
| GET    | /                 | admin   | List all sellers               |
| POST   | /register         | None    | Seller self-registration       |
| GET    | /:id              | seller  | Get seller profile             |
| PUT    | /:id              | seller  | Update seller info             |
| POST   | /:id/kyc          | seller  | Upload KYC documents           |
| PUT    | /:id/status       | admin   | Approve / suspend seller       |
| GET    | /:id/settlement   | seller  | Get settlement history         |

### 4.7 Admin (`/api/admin`)

| Method | Path                 | Auth  | Description                    |
|--------|----------------------|-------|--------------------------------|
| GET    | /dashboard           | admin | Platform metrics overview      |
| GET    | /users               | admin | User management list           |
| PUT    | /users/:id/role      | admin | Change user role               |
| GET    | /settings            | admin | Platform settings              |
| PUT    | /settings            | admin | Update settings                |
| GET    | /audit-log           | admin | Security audit trail           |
| GET    | /documents           | admin | Generated documents            |
| POST   | /documents/generate  | admin | Generate invoice/receipt       |

### 4.8 Jarvis AI Assistant (`/api/jarvis`)

| Method | Path    | Auth | Description                         |
|--------|---------|------|-------------------------------------|
| POST   | /chat   | JWT  | Send message, get AI response       |
| GET    | /history| JWT  | Get conversation history            |
| DELETE | /history| JWT  | Clear conversation                  |

---

## 5. AI/ML Bot Suite

### 5.1 Digital Marketer Bot (`scripts/ml/digital_marketer_bot.py`)

**Purpose:** Analyzes product engagement data and generates campaign strategies.

**Algorithm:**
1. Load product engagement JSON (views, add-to-cart, purchases, revenue, ratings)
2. Compute per-product metrics: CTR, CVR, AOV, return rate, engagement score
   - `engagement_score = CTR × 0.3 + CVR × 0.4 + rating × 6 × 0.3`
3. Aggregate metrics by category
4. Generate 5 campaign types:
   - **Top Performers Flash Sale** — boost high-engagement products
   - **Cart Abandonment Recovery** — retarget high-CTR/low-CVR products
   - **Category Spotlight** — feature top 2 revenue categories
   - **Customer Retention** — loyalty points for high-return-rate items
5. Output: `campaign_plan.json` with budget, timeline, creative brief

**Input Schema:**
```json
[{ "product_id": "P001", "name": "...", "category": "Electronics",
   "views": 4200, "add_to_cart": 820, "purchases": 310,
   "revenue": 155000, "returns": 12, "rating": 4.5 }]
```

**Key Metrics:**
- CTR = (add_to_cart / views) × 100
- CVR = (purchases / add_to_cart) × 100
- AOV = revenue / purchases
- Return Rate = returns / purchases × 100

---

### 5.2 Financial Planner Bot (`scripts/ml/financial_planner_bot.py`)

**Purpose:** Generates a personalised monthly budget plan and savings roadmap.

**Algorithm:**
1. Load income sources + monthly expenses JSON
2. Classify expenses as needs/wants/savings
3. Apply **50-30-20 Rule** analysis:
   - 50% → Needs (housing, food, transport, insurance, EMIs)
   - 30% → Wants (entertainment, dining out, shopping)
   - 20% → Savings/investments
4. Suggest savings allocation:
   - Priority 1: Emergency fund (6 months expenses, liquid FD)
   - Priority 2: Tax-saving instruments (ELSS/PPF/NPS, ₹1.5L/yr under 80C)
   - Priority 3: Equity mutual funds SIP (12% CAGR target)
   - Priority 4: Goal-based investments
5. Flag cost-cutting opportunities (30% trim on wants > ₹2000/month)
6. Output: `financial_plan.json` + `financial_report.txt`

**Emergency Fund Formula:**
```
target = monthly_income × 6
months_to_reach = (target - current_emergency) / monthly_allocation
```

**10-Year SIP Projection:**
```
FV = P × ((1 + r)^n - 1) / r
where r = 0.01 (1% monthly), n = 120 months
```

---

### 5.3 Trading Bot (`scripts/ml/trading_bot.py`)

Full spec in [Section 12](#12-trading-bot-strategy-spec).

---

### 5.4 Data Science Bot (`scripts/ml/data_science_bot.py`)

**Purpose:** Automated data cleaning and ETL pipeline.

**Processing Steps:**
1. **Load** CSV file (or sample data)
2. **Type Inference** — detect int/float/date/email/text columns
3. **Duplicate Removal** — exact row deduplication
4. **Null Handling** — median fill for numeric, mode fill for categorical
5. **Negative Clamping** — set negative prices/quantities to 0
6. **Type Validation** — flag rows where values don't match inferred type
7. **IQR Outlier Detection** — flag values outside [Q1 - 1.5×IQR, Q3 + 1.5×IQR]
8. **Output** — clean CSV + quality report JSON

**IQR Formula:**
```
Q1 = 25th percentile
Q3 = 75th percentile
IQR = Q3 - Q1
lower_fence = Q1 - 1.5 × IQR
upper_fence = Q3 + 1.5 × IQR
```

---

### 5.5 Visualization Bot (`scripts/ml/visualization_bot.py`)

**Purpose:** Generates chart PNGs (or ASCII fallback) from sales data.

**Charts Generated:**
1. **Bar Chart** — Monthly revenue (₹K) with conditional colour (green if >80% of max)
2. **Pie Chart** — GST collected breakdown by rate slab (5%/12%/18%/28%)
3. **Line + Dual-Axis** — Revenue trend + order count overlay
4. **Horizontal Bar** — Revenue by product category

**Fallback (no matplotlib):** ASCII bar/pie/line charts written to `ascii_charts.txt`

---

### 5.6 Forecasting Bot (`scripts/ml/forecasting.py`)

**Purpose:** 90-day sales revenue forecasting.

**Algorithm:**
1. Load historical daily sales JSON
2. Compute descriptive statistics (mean, std, min, max, linear trend slope)
3. If `statsmodels` available: ARIMA(2,1,2) with 95% confidence intervals
4. Fallback: **Holt's Double Exponential Smoothing** (pure Python)
   - Deseasonalise using 7-day seasonal factors
   - Apply exponential smoothing: `s_t = α×y_t + (1-α)×(s_{t-1} + b_{t-1})`
   - Trend: `b_t = β×(s_t - s_{t-1}) + (1-β)×b_{t-1}`
   - Re-apply seasonal factors for final forecast
5. Generate 90 forecast points with lower/upper 95% CI bounds
6. Output: `forecast.json` with per-day predictions + summary

---

## 6. Billing Engine — Multi-Sector

### 6.1 Architecture

```
billingEngine.js (server/services/)
        │
        ├── createBillingSession(sector, data)
        │       └─ Returns session with id, sector, status:'open'
        │
        ├── addItem(sessionId, item)
        │       └─ Computes lineTotal = (qty × price - discount) + GST
        │
        ├── applyDiscount(sessionId, discount)
        │       └─ flat | percent | loyalty | coupon
        │
        ├── calculateTotals(sessionId)
        │       └─ subtotal + taxAmt - discountAmt + surcharge = totalAmt
        │
        ├── checkout(sessionId, paymentData)
        │       └─ Marks paid, archives to billing_history
        │
        ├── generateSlip(sessionId)
        │       └─ Returns formatted text receipt
        │
        ├── addFuelReading(sessionId, nozzleData)     [petrol sector]
        ├── addRoomCharge(sessionId, roomData)        [hotel sector]
        └── addRiderInfo(sessionId, riderData)        [food sector]
```

### 6.2 Sector: Retail

**Key Features:**
- Barcode lookup (via `retail_products` table)
- Loyalty points: earn 1 pt per ₹10 spent; redeem at ₹0.50/pt
- Multi-tier discounts: flat / percent / coupon code / staff discount
- GST breakdown per line: CGST + SGST (intra-state) or IGST (inter-state)
- Weighted average stock method for COGS

**GST Calculation:**
```
taxable_value = (unit_price × quantity) - discount
cgst = taxable_value × gst_rate / 200   (half of total GST)
sgst = taxable_value × gst_rate / 200
line_total = taxable_value + cgst + sgst
```

### 6.3 Sector: Food Delivery

**Key Features:**
- Menu management (time-based: breakfast/lunch/dinner)
- Order types: dine-in / takeaway / delivery / pickup
- Kitchen status flow: pending → accepted → preparing → ready → dispatched → delivered
- Rider assignment with delivery fee calculation
- Packaging fee + platform fee as separate line items
- GST: 5% for restaurants (non-AC), 18% for restaurants with AC seating

**Rider Slip Fields:**
- Pickup address, drop address, distance (km)
- OTP verification for delivery confirmation
- Rider earnings: delivery_fee + tip
- Signature capture (base64)

### 6.4 Sector: Petrol Pump

**Key Features:**
- Nozzle meter readings: opening → closing → volume dispensed
- Fuel types: Petrol (MS), Diesel (HSD), CNG (kg), Premium (XP95)
- Daily Sales Report (DSR): opening stock + receipts - sales = closing stock
- Vehicle registration number capture
- Petrol/diesel outside GST regime; dealer commission taxed at 18%

**Volume Calculation:**
```
volume_dispensed = closing_reading - opening_reading
fuel_amount = volume_dispensed × rate_per_litre
bill_total = fuel_amount + service_charge
```

### 6.5 Sector: Hotel

**Key Features:**
- Room types with base/weekend pricing tiers
- GST tiers: 12% for rooms ≤ ₹7,500/night; 18% for rooms > ₹7,500/night
- Multi-day folios: room rent + room service + restaurant + laundry + minibar
- Meal plans: EP (room only) / CP (+ breakfast) / MAP (+ lunch) / AP (all meals)
- Booking sources: walk-in / phone / online / OTA / travel agent
- Guest check-in/check-out with folio generation

**Folio Balance:**
```
total_charges = Σ(room_rent + all_services)
balance_due = total_charges - total_payments
```

---

## 7. Authentication Flow

```
  CLIENT                              SERVER
    │                                    │
    │ POST /api/auth/login               │
    │ { email, password }                │
    ├───────────────────────────────────►│
    │                                    │ 1. Find user by email
    │                                    │ 2. bcrypt.compare(password, hash)
    │                                    │ 3. Issue JWT pair:
    │                                    │    accessToken  (15 min, HS256)
    │                                    │    refreshToken (7 days, HS512)
    │                                    │ 4. Store refreshToken in sessions DB
    │                                    │ 5. Audit log: LOGIN_SUCCESS
    │◄───────────────────────────────────┤
    │ { accessToken, refreshToken, user }│
    │                                    │
    │ [Store tokens in memory/cookie]    │
    │                                    │
    │ GET /api/products                  │
    │ Authorization: Bearer {accessToken}│
    ├───────────────────────────────────►│
    │                                    │ 1. Verify JWT signature
    │                                    │ 2. Check expiry (exp claim)
    │                                    │ 3. Extract userId, role
    │                                    │ 4. Attach to req.user
    │◄───────────────────────────────────┤
    │ 200 { products: [...] }            │
    │                                    │
    │ [Access token expires]             │
    │                                    │
    │ POST /api/auth/refresh             │
    │ { refreshToken }                   │
    ├───────────────────────────────────►│
    │                                    │ 1. Verify refresh token signature
    │                                    │ 2. Lookup in sessions DB
    │                                    │ 3. Check not expired/revoked
    │                                    │ 4. Issue new accessToken
    │                                    │ 5. Optionally rotate refreshToken
    │◄───────────────────────────────────┤
    │ { accessToken (new) }              │
    │                                    │
    │ POST /api/auth/logout              │
    │ { refreshToken }                   │
    ├───────────────────────────────────►│
    │                                    │ 1. Delete session record
    │                                    │ 2. Audit log: LOGOUT
    │◄───────────────────────────────────┤
    │ 200 { success: true }              │

Role Hierarchy:
  admin > seller > buyer > support > bot
  
  admin  → all routes
  seller → own products, own orders, own settlements
  buyer  → own orders, own profile
  support→ read-only admin + order management
  bot    → designated API endpoints only (API key based)
```

---

## 8. Deployment Roadmap

### Stage 1: Local Development

```bash
# 1. Clone and install
git clone https://github.com/org/emproium-vipani
cd emproium-vipani
npm install

# 2. Configure environment
cp .env.example .env
# Edit: JWT_SECRET, SMTP_*, REDIS_URL, DATABASE_URL

# 3. Run
npm run dev       # starts Express on :3000
# or
node server/index.js
```

### Stage 2: Docker Containerisation

```dockerfile
# Dockerfile (multi-stage)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["node", "server/index.js"]
```

```yaml
# docker-compose.yml
version: '3.9'
services:
  api:
    build: .
    ports: ["3000:3000"]
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:pass@db:5432/emproium
      - REDIS_URL=redis://cache:6379
    depends_on: [db, cache]

  db:
    image: postgres:16-alpine
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: emproium
      POSTGRES_USER: emproium
      POSTGRES_PASSWORD: securepass

  cache:
    image: redis:7-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru

volumes:
  pgdata:
```

### Stage 3: GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy EmproiumVipani
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test
      - run: node scripts/chaos-test.sh || true

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -t emproium-vipani:${{ github.sha }} .
      - name: Push to registry
        run: |
          docker tag emproium-vipani:${{ github.sha }} ghcr.io/org/emproium-vipani:latest
          docker push ghcr.io/org/emproium-vipani:latest

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Vercel
        run: npx vercel --prod --token=${{ secrets.VERCEL_TOKEN }}
```

### Stage 4: Vercel (Frontend + Serverless)

```json
// vercel.json
{
  "version": 2,
  "builds": [
    { "src": "server/index.js", "use": "@vercel/node" },
    { "src": "public/**", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "server/index.js" },
    { "src": "/(.*)", "dest": "public/$1" }
  ]
}
```

### Stage 5: Production Hardening

- [ ] Enable PostgreSQL SSL (`ssl: { rejectUnauthorized: true }`)
- [ ] Set up automated DB backups (pg_dump → S3, daily)
- [ ] Configure Redis persistence (AOF mode)
- [ ] Set `NODE_ENV=production` to enable security headers
- [ ] Enable Sentry error tracking
- [ ] Set up Cloudflare WAF in front of origin
- [ ] Configure auto-scaling (Kubernetes / ECS Fargate)
- [ ] Rotate JWT secrets via env var management (Vault / AWS Secrets Manager)

---

## 9. Gamification System

### 9.1 XP Formula

```
XP Source                     | Amount
------------------------------|--------
First login                   | +50 XP
Order processed               | +10 XP
Seller action                 | +15 XP
Product updated               | +8 XP
Admin action                  | +5 XP
Badge panel viewed            | +50 XP (demo)
Night owl (post-midnight use) | +25 XP
7-day login streak            | +200 XP
```

### 9.2 Level Thresholds

| Level | Name        | XP Range       | Unlock                     |
|-------|-------------|----------------|----------------------------|
| 1     | Novice      | 0 – 99         | Basic dashboard access     |
| 2     | Apprentice  | 100 – 299      | Advanced reports           |
| 3     | Expert      | 300 – 699      | Bulk operations            |
| 4     | Master      | 700 – 1,499    | API key management         |
| 5     | Legend      | 1,500+         | Full system control        |

**Level-Up Check:**
```javascript
const THRESHOLDS = [0, 100, 300, 700, 1500];
level = THRESHOLDS.findLastIndex(t => xp >= t) + 1;
xpToNext = THRESHOLDS[level] - THRESHOLDS[level - 1];
xpProgress = (xp - THRESHOLDS[level - 1]) / xpToNext;
```

### 9.3 Badge Catalogue

| Badge ID      | Emoji | Name             | Unlock Condition                     | XP Award |
|---------------|-------|------------------|--------------------------------------|----------|
| first_login   | 🚀    | First Login      | First admin login                    | 50       |
| ten_orders    | 📦    | Order Wrangler   | Process 10 orders                    | 100      |
| seller_added  | 🏪    | Merchant King    | Add first seller                     | 80       |
| lv2           | ⭐    | Rising Star      | Reach Level 2                        | 0        |
| lv3           | 💫    | Power User       | Reach Level 3                        | 0        |
| lv4           | 🔥    | Elite Admin      | Reach Level 4                        | 0        |
| lv5           | 👑    | Legend           | Reach Level 5                        | 0        |
| night_owl     | 🦉    | Night Owl        | Use admin panel between 0–5am        | 25       |
| speed_demon   | ⚡    | Speed Demon      | 5 actions in 60 seconds              | 75       |
| data_wizard   | 🧙    | Data Wizard      | Generate 10 reports                  | 120      |
| streak_7      | 🔗    | 7-Day Streak     | Log in 7 consecutive days            | 200      |
| gst_filed     | 📋    | GST Champion     | File a GST return                    | 150      |

### 9.4 Persistence

XP state is stored in `localStorage` key `ev_xp_state`:
```json
{
  "xp": 450,
  "level": 3,
  "unlockedBadges": ["first_login", "lv2", "lv3", "night_owl"]
}
```

### 9.5 Sound Effects (sounds.js)

| Method       | Description                               | Notes                        |
|--------------|-------------------------------------------|------------------------------|
| SoundFX.click()   | Mechanical keyboard clack            | Low sine + noise transient   |
| SoundFX.success() | Mario-style ascending chime          | C5→E5→G5→C6 square wave     |
| SoundFX.error()   | Buzzer / harsh tone                  | Sawtooth 110Hz triple buzz   |
| SoundFX.dialup()  | Modem handshake snippet              | DTMF + carrier + noise       |
| SoundFX.badge()   | Achievement jingle                   | Rising arp + chord swell     |
| SoundFX.floppy()  | Disk seek simulation                 | Noise bursts + motor hum     |

---

## 10. Data Pipeline & Validation

### 10.1 Input Validation Rules

| Field Type   | Validation                                              |
|--------------|---------------------------------------------------------|
| Email        | RFC 5322 format; MX record check (optional)             |
| Phone        | E.164 format; must start with country code              |
| Price        | Positive NUMERIC; max ₹99,99,999 (99 lakh)             |
| GST Rate     | Must be in {0, 0.1, 0.25, 1, 1.5, 3, 5, 7.5, 12, 18, 28} |
| HSN Code     | 4–8 digit numeric string                               |
| GSTIN        | 15-character: 2-digit state + 10-char PAN + 1 + Z + checksum |
| UUID         | RFC 4122 v4 format                                      |
| Date         | ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)          |

**GSTIN Validation:**
```javascript
/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)
```

### 10.2 Deduplication Logic

Orders, invoices, and billing sessions use composite unique keys:

```sql
-- Prevent duplicate invoice generation for same order
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id)
  WHERE invoice_type != 'credit_note';

-- Prevent double payment recording
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_ref ON billing_payments(reference)
  WHERE reference IS NOT NULL AND reference != '';
```

Application-level deduplication:
1. Check for idempotency key in request headers (`X-Idempotency-Key`)
2. Cache result in Redis for 24 hours
3. Return cached result for duplicate requests

### 10.3 Data Quality Score

The `data_science_bot.py` computes a quality score:
```
quality_score = 100
  - (null_rate × 20)         // max penalty: 20 for >100% nulls
  - (duplicate_rate × 15)    // max penalty: 15
  - (type_error_rate × 10)   // max penalty: 10
  - (outlier_rate × 5)       // max penalty: 5
```

---

## 11. Monitoring & Observability

### 11.1 Prometheus Metrics

Key metrics to expose at `/metrics`:

| Metric Name                          | Type      | Description                    |
|--------------------------------------|-----------|--------------------------------|
| `http_requests_total`                | Counter   | Requests by method/route/status|
| `http_request_duration_seconds`      | Histogram | Request latency p50/p95/p99    |
| `billing_sessions_created_total`     | Counter   | By sector                      |
| `billing_checkout_total`             | Counter   | By payment method              |
| `auth_login_attempts_total`          | Counter   | Success/failure                |
| `orders_created_total`               | Counter   | By seller                      |
| `orders_revenue_inr`                 | Counter   | Total revenue processed        |
| `cache_hits_total`                   | Counter   | Redis hits vs misses           |
| `db_query_duration_seconds`          | Histogram | Query performance              |
| `active_billing_sessions`            | Gauge     | Open sessions by sector        |

**Implementation:**
```javascript
const promClient = require('prom-client');
const register   = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### 11.2 Grafana Dashboard Description

**Dashboard: EmproiumVipani Operations**

- **Row 1: Traffic** — req/sec, p95 latency, error rate
- **Row 2: Orders** — orders/hour, revenue/hour, cancellation rate
- **Row 3: Billing** — active sessions by sector, checkout rate, avg bill value
- **Row 4: Auth** — login attempts, failed logins (anomaly detection)
- **Row 5: Infrastructure** — CPU, memory, DB connections, cache hit rate

**Alerting Rules:**
```yaml
# Error rate alert
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
  for: 2m
  annotations:
    summary: "Error rate > 5% for 2 minutes"

# Login bruteforce detection
- alert: BruteForceDetected
  expr: rate(auth_login_attempts_total{result="failure"}[5m]) > 10
  for: 1m
  annotations:
    summary: "High login failure rate — possible brute force"
```

### 11.3 Application Logging

Log levels and structured JSON format:
```javascript
logger.info({
  event:    'ORDER_CREATED',
  orderId:  order.id,
  sellerId: order.seller_id,
  amount:   order.total_amt,
  userId:   req.user.userId,
  ip:       req.ip,
  timestamp: new Date().toISOString(),
});
```

Log retention: 30 days (application), 90 days (audit/security), 1 year (financial).

---

## 12. Trading Bot Strategy Spec

### 12.1 Strategy: SMA Crossover

**Signal Logic:**
```
BUY  (Long Entry):  fast_SMA crosses ABOVE slow_SMA (golden cross)
SELL (Long Exit):   fast_SMA crosses BELOW slow_SMA (death cross)
                    OR price hits stop_loss
                    OR price hits take_profit

SHORT (Short Entry): fast_SMA crosses BELOW slow_SMA
COVER (Short Exit):  fast_SMA crosses ABOVE slow_SMA
                     OR price hits stop_loss
                     OR price hits take_profit
```

**Default Parameters:**
| Parameter          | Default | Description                       |
|--------------------|---------|-----------------------------------|
| fast_period        | 20      | Fast SMA window                   |
| slow_period        | 50      | Slow SMA window                   |
| risk_per_trade     | 2%      | Max capital risked per trade      |
| stop_loss_mult     | 2.0×ATR | ATR-based stop loss               |
| take_profit_mult   | 4.0×ATR | Risk/reward = 1:2                 |
| atr_period         | 14      | ATR calculation period            |

### 12.2 Position Sizing

```python
risk_amount = capital × risk_per_trade  # e.g. 100,000 × 0.02 = ₹2,000
stop_distance = ATR × stop_loss_mult    # e.g. 50 × 2 = ₹100
quantity = int(risk_amount / stop_distance)  # e.g. 2,000 / 100 = 20 shares
```

### 12.3 Performance Metrics

| Metric          | Formula                                         |
|-----------------|-------------------------------------------------|
| Win Rate        | winning_trades / total_trades × 100            |
| Profit Factor   | sum(winning_pnl) / abs(sum(losing_pnl))        |
| Sharpe Ratio    | (mean_daily_return / std_daily_return) × √252   |
| Max Drawdown    | max((peak - equity) / peak) over equity curve   |
| Total Return    | (final_equity - initial_capital) / initial_capital |
| Expectancy      | (win_rate × avg_win) - (loss_rate × avg_loss)  |

### 12.4 Backtesting Methodology

1. **Data**: OHLCV (Open, High, Low, Close, Volume) daily candles
2. **Walk-forward**: No look-ahead bias — signals computed only from past data
3. **Slippage**: Not modelled (conservative; add 0.1% per trade for realistic)
4. **Commissions**: Not modelled (add 0.05% per trade for NSE brokerage)
5. **Survivorship bias**: Use point-in-time data to avoid
6. **Minimum data**: Requires `slow_period + 10` candles to start

### 12.5 Risk Warnings

> **DISCLAIMER:** This trading bot is for educational and research purposes only.
> Past backtesting performance does not guarantee future results.
> Never risk more than you can afford to lose.
> All trading involves substantial risk of loss.

---

## 13. Security Architecture

### 13.1 Authentication Security

- Passwords hashed with **bcrypt** (cost factor 12)
- JWT signed with `HS256` (access) and `HS512` (refresh)
- Refresh tokens stored in DB for revocation capability
- OTP: 6-digit, valid 10 minutes, max 3 attempts
- Rate limiting: 5 login attempts per IP per 15 minutes
- Session purge: expired refresh tokens cleaned hourly

### 13.2 API Security Headers

```javascript
// Helmet.js configuration
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "cdn.jsdelivr.net", "cdn.tailwindcss.com"],
      styleSrc:   ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      imgSrc:     ["'self'", "data:", "https:"],
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
})
```

### 13.3 Input Sanitisation

- All user inputs validated with `validators.js` before DB operations
- SQL queries use parameterised statements only (no string concatenation)
- JSON bodies size-limited to 1MB via `express.json({ limit: '1mb' })`
- File uploads: type whitelist, size limit 5MB, stored outside webroot

### 13.4 OWASP Top 10 Coverage

| Vulnerability              | Mitigation                                    |
|----------------------------|-----------------------------------------------|
| Injection (SQL/NoSQL/XSS)  | Parameterised queries, input validation, CSP  |
| Broken Authentication       | JWT + refresh tokens, rate limiting, bcrypt   |
| Sensitive Data Exposure    | HTTPS only, no PW in logs, field exclusion    |
| XML External Entities      | No XML parsing used                           |
| Broken Access Control      | Role-based middleware on all protected routes |
| Security Misconfiguration  | Helmet, env-based secrets, no default creds   |
| XSS                        | CSP, output encoding, sanitise-html           |
| Insecure Deserialisation   | No eval, JSON.parse with try/catch only       |
| Known Vulnerabilities      | `npm audit` in CI, Dependabot enabled         |
| Insufficient Logging       | Structured audit log, anomaly alerts          |

---

## 14. Frontend Component Map

```
src/
├── index.html         — Customer storefront (product grid, cart, checkout)
├── admin.html         — Admin Nexus (orders, sellers, products, reports)
│   └── XP/Badge system (gamification overlay)
├── partner.html       — Seller dashboard (inventory, orders, settlements)
├── supplier.html      — Supplier/distributor portal
├── billing-engine.js  — Client-side billing UI components
├── app.js             — Main Alpine.js app data + API service
├── api-service.js     — Centralised fetch wrapper with auth headers
├── components.js      — Shared Alpine.js components
├── form-handlers.js   — Form validation and submission
├── gst_billing.js     — GST calculation helpers
├── email-config.js    — Email template configurations
├── sounds.js          — Web Audio API retro sound effects
├── styles.css         — Tailwind + custom + CRT retro effects
└── legal/             — Legal pages (ToS, Privacy, Refund)
```

---

## 15. Environment Configuration

```bash
# Server
NODE_ENV=production
PORT=3000

# JWT
JWT_SECRET=your-super-secure-access-secret-min-64-chars
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-min-64-chars
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/emproium

# Redis (optional — falls back to in-memory)
REDIS_URL=redis://localhost:6379

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@emproium.com
SMTP_PASS=app-specific-password
SMTP_FROM=EmproiumVipani <noreply@emproium.com>

# Storage
STORAGE_PATH=./data
MAX_UPLOAD_SIZE_MB=5

# GST
DEFAULT_STATE_CODE=27          # Maharashtra
PLATFORM_GSTIN=27ABCDE1234F1Z5

# Trading Bot
DEFAULT_INITIAL_CAPITAL=100000
DEFAULT_FAST_SMA=20
DEFAULT_SLOW_SMA=50

# Monitoring
PROMETHEUS_ENABLED=true
LOG_LEVEL=info

# Security
RATE_LIMIT_WINDOW_MS=900000    # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
CORS_ORIGINS=https://emproium.com,https://admin.emproium.com

# Feature Flags
ENABLE_GAMIFICATION=true
ENABLE_RETRO_SOUNDS=true
ENABLE_TRADING_BOT=true
ENABLE_BILLING_ENGINE=true
```

---

*End of MASTER BLUEPRINT — EmproiumVipani v2.0*

*For questions or contributions, see ARCHITECTURE.md and the GitHub repository.*
