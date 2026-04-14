-- ============================================================
-- EmproiumVipani — PostgreSQL Master Schema
-- Run once on fresh database (idempotent via IF NOT EXISTS)
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram full-text search

-- ──────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role   AS ENUM ('admin','seller','customer','agent','partner');
  CREATE TYPE user_status AS ENUM ('active','inactive','suspended','pending_kyc');
  CREATE TYPE order_status AS ENUM ('pending','confirmed','packed','shipped','delivered','cancelled','refunded');
  CREATE TYPE payment_method AS ENUM ('cod','razorpay','upi','bank_transfer','wallet');
  CREATE TYPE payment_status AS ENUM ('pending','paid','failed','refunded','partial');
  CREATE TYPE gst_type       AS ENUM ('CGST_SGST','IGST','exempt');
  CREATE TYPE ledger_type    AS ENUM ('credit','debit');
  CREATE TYPE invoice_status AS ENUM ('draft','issued','paid','cancelled','overdue');
  CREATE TYPE ticket_status  AS ENUM ('open','in_progress','resolved','closed');
  CREATE TYPE seller_status  AS ENUM ('pending','approved','rejected','suspended');
  CREATE TYPE badge_category AS ENUM ('compliance','sales','milestone','devops','gamified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────────────────────────
-- 2. USERS & AUTH
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  email         CITEXT      NOT NULL UNIQUE,
  phone         VARCHAR(15),
  password_hash TEXT,
  key_hash      TEXT,                        -- personal passkey (optional)
  role          user_role   NOT NULL DEFAULT 'customer',
  status        user_status NOT NULL DEFAULT 'active',
  avatar_seed   TEXT,                        -- pixel-art avatar seed
  xp            INT         NOT NULL DEFAULT 0,
  level         SMALLINT    NOT NULL DEFAULT 1,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);

-- Refresh tokens (JWT rotation store)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,  -- SHA-256 of the raw refresh token
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rt_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_rt_expires ON refresh_tokens(expires_at);

-- OTP store
CREATE TABLE IF NOT EXISTS otp_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      CITEXT      NOT NULL,
  otp_code   VARCHAR(6)  NOT NULL,
  purpose    TEXT        NOT NULL DEFAULT 'login',
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_requests(email, expires_at);

-- Audit log (every action recorded)
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID,
  action     TEXT        NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  ip_address INET,
  meta       JSONB       DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- 3. SELLERS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sellers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name   TEXT NOT NULL,
  description     TEXT,
  gst_number      VARCHAR(20) UNIQUE,
  pan_number      VARCHAR(10),
  category        TEXT,
  business_type   TEXT,
  status          seller_status NOT NULL DEFAULT 'pending',
  verified        BOOLEAN       NOT NULL DEFAULT FALSE,
  bank_account    JSONB,         -- { bank, ifsc, account_no, holder }
  address         JSONB,         -- { street, city, state, pincode }
  kyc_docs        JSONB DEFAULT '[]',
  commission_rate NUMERIC(5,2)  NOT NULL DEFAULT 10.00, -- %
  applied_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_user ON sellers(user_id);
CREATE INDEX        IF NOT EXISTS idx_sellers_status ON sellers(status);

-- ──────────────────────────────────────────────────────────────
-- 4. PRODUCTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     UUID        NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  description   TEXT,
  category      TEXT        NOT NULL,
  subcategory   TEXT,
  price         NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  mrp           NUMERIC(12,2),
  cost_price    NUMERIC(12,2),
  stock         INT         NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sku           TEXT        UNIQUE,
  hsn_code      VARCHAR(8),
  gst_rate      NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  thumbnail     TEXT,
  images        JSONB       DEFAULT '[]',
  attributes    JSONB       DEFAULT '{}',
  tags          TEXT[]      DEFAULT '{}',
  sales         INT         NOT NULL DEFAULT 0,
  views         INT         NOT NULL DEFAULT 0,
  rating_avg    NUMERIC(3,2) DEFAULT 0,
  rating_count  INT         NOT NULL DEFAULT 0,
  status        TEXT        NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','inactive','draft','rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_seller   ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_status   ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING GIN (name gin_trgm_ops);

-- ──────────────────────────────────────────────────────────────
-- 5. ORDERS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         TEXT        NOT NULL UNIQUE,  -- human-readable e.g. ORD-ABC123
  user_id          UUID        NOT NULL REFERENCES users(id),
  customer_name    TEXT        NOT NULL,
  customer_email   TEXT        NOT NULL,
  customer_phone   TEXT,
  items            JSONB       NOT NULL DEFAULT '[]',
  subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping         NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_total        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  delivery_address JSONB,
  payment_method   payment_method NOT NULL DEFAULT 'cod',
  payment_status   payment_status NOT NULL DEFAULT 'pending',
  payment_ref      TEXT,
  status           order_status   NOT NULL DEFAULT 'pending',
  notes            TEXT,
  tracking_id      TEXT,
  shipped_at       TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user    ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date    ON orders(created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- 6. GST ENGINE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hsn_gst_rates (
  hsn_code    VARCHAR(8) PRIMARY KEY,
  description TEXT,
  gst_rate    NUMERIC(5,2) NOT NULL,
  category    TEXT,
  sub_slab    TEXT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gst_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID        REFERENCES orders(id),
  invoice_id   UUID,
  seller_id    UUID        REFERENCES sellers(id),
  hsn_code     VARCHAR(8),
  taxable_amt  NUMERIC(12,2) NOT NULL,
  gst_rate     NUMERIC(5,2)  NOT NULL,
  cgst         NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst         NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_gst    NUMERIC(12,2) NOT NULL,
  gst_type     gst_type    NOT NULL DEFAULT 'CGST_SGST',
  seller_state TEXT,
  buyer_state  TEXT,
  period       CHAR(6),     -- MMYYYY e.g. '042025'
  filed        BOOLEAN     NOT NULL DEFAULT FALSE,
  filed_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gst_seller_period ON gst_transactions(seller_id, period);
CREATE INDEX IF NOT EXISTS idx_gst_order         ON gst_transactions(order_id);

-- GST compliance badges tracker
CREATE TABLE IF NOT EXISTS gst_compliance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  period      CHAR(6) NOT NULL,   -- MMYYYY
  due_date    DATE    NOT NULL,
  filed_at    TIMESTAMPTZ,
  on_time     BOOLEAN,
  penalty_amt NUMERIC(10,2) DEFAULT 0,
  badge_awarded TEXT,             -- e.g. 'gold_filer'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seller_id, period)
);

-- ──────────────────────────────────────────────────────────────
-- 7. INVOICES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT NOT NULL UNIQUE,   -- e.g. INV-2025-0001
  order_id        UUID REFERENCES orders(id),
  seller_id       UUID REFERENCES sellers(id),
  buyer_id        UUID REFERENCES users(id),
  buyer_name      TEXT NOT NULL,
  buyer_email     TEXT NOT NULL,
  buyer_gstin     TEXT,
  buyer_address   JSONB,
  items           JSONB NOT NULL DEFAULT '[]',
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxable_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  cgst            NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst            NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_gst       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          invoice_status NOT NULL DEFAULT 'draft',
  due_date        DATE,
  paid_at         TIMESTAMPTZ,
  pdf_url         TEXT,
  qr_code_url     TEXT,
  notes           TEXT,
  template        TEXT NOT NULL DEFAULT 'retro',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_seller ON invoices(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_buyer  ON invoices(buyer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- ──────────────────────────────────────────────────────────────
-- 8. DOUBLE-ENTRY LEDGER
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID,            -- user_id or seller_id; NULL = platform account
  owner_type  TEXT,            -- 'user' | 'seller' | 'platform'
  name        TEXT NOT NULL,
  description TEXT,
  currency    CHAR(3) NOT NULL DEFAULT 'INR',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_accounts_owner ON accounts(owner_id);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id          BIGSERIAL PRIMARY KEY,
  account_id  UUID        NOT NULL REFERENCES accounts(id),
  type        ledger_type NOT NULL,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description TEXT        NOT NULL,
  ref_id      TEXT,        -- order_id, invoice_id, settlement_id etc.
  ref_type    TEXT,        -- 'order' | 'invoice' | 'settlement' | 'payout'
  balance     NUMERIC(14,2),   -- running balance (denormalised for speed)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_ref     ON ledger_entries(ref_id, ref_type);

-- ──────────────────────────────────────────────────────────────
-- 9. SETTLEMENTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    UUID NOT NULL REFERENCES sellers(id),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission   NUMERIC(12,2) NOT NULL DEFAULT 0,
  tds          NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_on_comm  NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','processing','paid','failed')),
  utr_number   TEXT,
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settlements_seller ON settlements(seller_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- 10. GAMIFICATION — XP + BADGES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,    -- e.g. 'gst_gold_filer', '100_orders'
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,                    -- emoji or URL
  category    badge_category NOT NULL DEFAULT 'milestone',
  xp_reward   INT  NOT NULL DEFAULT 50,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id   UUID NOT NULL REFERENCES badges(id),
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);

CREATE TABLE IF NOT EXISTS xp_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta_xp   INT  NOT NULL,
  reason     TEXT NOT NULL,
  ref_id     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xp_user ON xp_events(user_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- 11. SUPPORT TICKETS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      ticket_status NOT NULL DEFAULT 'open',
  priority    TEXT NOT NULL DEFAULT 'normal'
              CHECK (priority IN ('low','normal','high','critical')),
  assigned_to UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- 12. FORECASTING DATA (ML predictions store)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ml_predictions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name    TEXT        NOT NULL,   -- 'arima_sales', 'prophet_gst', 'build_predictor'
  entity_id     TEXT,                   -- seller_id, product_id, etc.
  entity_type   TEXT,                   -- 'seller', 'product', 'platform'
  forecast_date DATE        NOT NULL,
  prediction    NUMERIC(14,4),
  lower_bound   NUMERIC(14,4),
  upper_bound   NUMERIC(14,4),
  confidence    NUMERIC(5,4),           -- 0.0–1.0
  model_meta    JSONB       DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ml_entity  ON ml_predictions(entity_id, model_name, forecast_date);

-- ──────────────────────────────────────────────────────────────
-- 13. TRIGGERS — auto-update updated_at
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'users','sellers','products','orders','invoices','settlements'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON %I;
       CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t, t);
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 14. TRADES TABLE (for trading bot / financial tracking)
-- ──────────────────────────────────────────────────────────────

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  symbol          TEXT NOT NULL,
  trade_type      TEXT NOT NULL CHECK (trade_type IN ('buy','sell','short','cover')),
  quantity        NUMERIC(16,4) NOT NULL,
  entry_price     NUMERIC(16,4) NOT NULL,
  exit_price      NUMERIC(16,4),
  stop_loss       NUMERIC(16,4),
  take_profit     NUMERIC(16,4),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
  pnl             NUMERIC(16,4),
  pnl_pct         NUMERIC(8,4),
  strategy        TEXT,
  broker_order_id TEXT,
  exchange        TEXT,
  asset_class     TEXT NOT NULL DEFAULT 'equity' CHECK (asset_class IN ('equity','crypto','forex','commodity','derivatives')),
  meta            JSONB DEFAULT '{}',
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trades_user    ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol  ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_status  ON trades(status);
