-- ══════════════════════════════════════════════════════════════════════════════
-- EMPROIUM VIPANI — MULTI-SECTOR BILLING ENGINE SCHEMA
-- Covers: Retail, Food Delivery, Petrol Pump, Hotel
-- ══════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- SHARED: BILLING SESSIONS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector        TEXT NOT NULL CHECK (sector IN ('retail','food','petrol','hotel')),
  outlet_id     UUID,                         -- FK to outlets table (optional)
  cashier_id    UUID,                         -- FK to users table
  customer_id   UUID,                         -- FK to users (nullable for walk-in)
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','hold','paid','voided','refunded')),
  currency      TEXT NOT NULL DEFAULT 'INR',
  subtotal      NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amt  NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amt       NUMERIC(14,2) NOT NULL DEFAULT 0,
  surcharge_amt NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amt     NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amt      NUMERIC(14,2) NOT NULL DEFAULT 0,
  change_due    NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method TEXT,                        -- cash, card, upi, wallet, mixed
  notes         TEXT,
  meta          JSONB DEFAULT '{}',
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_sessions_sector   ON billing_sessions(sector, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_sessions_customer ON billing_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_billing_sessions_status   ON billing_sessions(status);

-- ──────────────────────────────────────────────────────────────
-- SHARED: BILLING LINE ITEMS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES billing_sessions(id) ON DELETE CASCADE,
  line_no       INT  NOT NULL,
  item_code     TEXT,
  item_name     TEXT NOT NULL,
  category      TEXT,
  unit          TEXT DEFAULT 'pcs',
  quantity      NUMERIC(14,4) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(14,4) NOT NULL,
  discount_pct  NUMERIC(6,4)  NOT NULL DEFAULT 0,
  discount_amt  NUMERIC(14,4) NOT NULL DEFAULT 0,
  taxable_amt   NUMERIC(14,4) NOT NULL DEFAULT 0,
  gst_rate      NUMERIC(6,4)  NOT NULL DEFAULT 0,
  cgst_amt      NUMERIC(14,4) NOT NULL DEFAULT 0,
  sgst_amt      NUMERIC(14,4) NOT NULL DEFAULT 0,
  igst_amt      NUMERIC(14,4) NOT NULL DEFAULT 0,
  line_total    NUMERIC(14,4) NOT NULL,
  hsn_code      TEXT,
  barcode       TEXT,
  meta          JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_items_session ON billing_items(session_id, line_no);

-- ──────────────────────────────────────────────────────────────
-- SHARED: DISCOUNT / PROMO RULES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_discounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES billing_sessions(id) ON DELETE CASCADE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('flat','percent','loyalty','coupon','promo','staff')),
  code          TEXT,
  description   TEXT,
  amount        NUMERIC(14,4) NOT NULL DEFAULT 0,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- SHARED: PAYMENT SPLITS (for mixed payment modes)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES billing_sessions(id) ON DELETE CASCADE,
  method        TEXT NOT NULL CHECK (method IN ('cash','card','upi','wallet','credit','loyalty_points','cheque','neft')),
  reference     TEXT,
  amount        NUMERIC(14,4) NOT NULL,
  paid_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- SECTOR 1: RETAIL
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retail_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode         TEXT UNIQUE,
  sku             TEXT UNIQUE,
  name            TEXT NOT NULL,
  category        TEXT,
  brand           TEXT,
  unit            TEXT DEFAULT 'pcs',
  mrp             NUMERIC(14,4) NOT NULL,
  selling_price   NUMERIC(14,4) NOT NULL,
  purchase_price  NUMERIC(14,4),
  gst_rate        NUMERIC(6,4)  NOT NULL DEFAULT 18,
  hsn_code        TEXT,
  stock_qty       NUMERIC(14,4) NOT NULL DEFAULT 0,
  reorder_level   NUMERIC(14,4) DEFAULT 10,
  image_url       TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  meta            JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_retail_products_barcode ON retail_products(barcode);
CREATE INDEX IF NOT EXISTS idx_retail_products_sku     ON retail_products(sku);
CREATE INDEX IF NOT EXISTS idx_retail_products_cat     ON retail_products(category);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL,
  points_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
  lifetime_earned NUMERIC(14,2) NOT NULL DEFAULT 0,
  tier            TEXT NOT NULL DEFAULT 'bronze'
                    CHECK (tier IN ('bronze','silver','gold','platinum')),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES loyalty_accounts(id),
  session_id  UUID REFERENCES billing_sessions(id),
  txn_type    TEXT NOT NULL CHECK (txn_type IN ('earn','redeem','expire','adjustment')),
  points      NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- SECTOR 2: FOOD DELIVERY
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS food_menus (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     UUID,
  menu_name     TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from    TIME,
  valid_until   TIME,
  days_active   TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS food_menu_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id       UUID NOT NULL REFERENCES food_menus(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(14,4) NOT NULL,
  prep_time_min INT DEFAULT 15,
  is_veg        BOOLEAN NOT NULL DEFAULT TRUE,
  is_available  BOOLEAN NOT NULL DEFAULT TRUE,
  allergens     TEXT[],
  calories      INT,
  image_url     TEXT,
  gst_rate      NUMERIC(6,4) NOT NULL DEFAULT 5,
  meta          JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_food_items_menu ON food_menu_items(menu_id, category);

CREATE TABLE IF NOT EXISTS food_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES billing_sessions(id),
  order_type      TEXT NOT NULL CHECK (order_type IN ('dine_in','takeaway','delivery','pickup')),
  table_no        TEXT,
  delivery_address JSONB,
  rider_id        UUID,
  delivery_fee    NUMERIC(14,4) NOT NULL DEFAULT 0,
  packaging_fee   NUMERIC(14,4) NOT NULL DEFAULT 0,
  platform_fee    NUMERIC(14,4) NOT NULL DEFAULT 0,
  estimated_delivery TIMESTAMPTZ,
  actual_delivery    TIMESTAMPTZ,
  kitchen_status  TEXT NOT NULL DEFAULT 'pending'
                    CHECK (kitchen_status IN ('pending','accepted','preparing','ready','dispatched','delivered','cancelled')),
  special_instructions TEXT,
  rating          INT CHECK (rating BETWEEN 1 AND 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS food_rider_slips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES food_orders(id),
  rider_id      UUID NOT NULL,
  rider_name    TEXT,
  rider_phone   TEXT,
  pickup_address TEXT,
  drop_address  TEXT,
  distance_km   NUMERIC(8,3),
  delivery_fee  NUMERIC(14,4),
  tip_amount    NUMERIC(14,4) DEFAULT 0,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  picked_up_at  TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  signature     TEXT,
  otp_verified  BOOLEAN DEFAULT FALSE
);

-- ──────────────────────────────────────────────────────────────
-- SECTOR 3: PETROL PUMP
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS petrol_fuel_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT 'litre' CHECK (unit IN ('litre','kg')),
  current_price NUMERIC(14,4) NOT NULL,
  tax_rate    NUMERIC(6,4) NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO petrol_fuel_types (code, name, unit, current_price, tax_rate) VALUES
  ('MS',   'Petrol (MS)',       'litre', 102.92, 0),
  ('HSD',  'Diesel (HSD)',      'litre',  89.62, 0),
  ('CNG',  'CNG',               'kg',     76.59, 0),
  ('XP95', 'Premium Petrol 95', 'litre', 111.50, 0)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS petrol_nozzles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pump_no     INT  NOT NULL,
  nozzle_no   INT  NOT NULL,
  fuel_code   TEXT NOT NULL REFERENCES petrol_fuel_types(code),
  current_reading NUMERIC(14,3) NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (pump_no, nozzle_no)
);

CREATE TABLE IF NOT EXISTS petrol_nozzle_readings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nozzle_id     UUID NOT NULL REFERENCES petrol_nozzles(id),
  session_id    UUID REFERENCES billing_sessions(id),
  opening_reading NUMERIC(14,3) NOT NULL,
  closing_reading NUMERIC(14,3) NOT NULL,
  volume_dispensed NUMERIC(14,3) GENERATED ALWAYS AS (closing_reading - opening_reading) STORED,
  unit_price    NUMERIC(14,4) NOT NULL,
  amount        NUMERIC(14,4) NOT NULL,
  vehicle_no    TEXT,
  fuel_code     TEXT NOT NULL,
  attendant_id  UUID,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nozzle_readings_nozzle  ON petrol_nozzle_readings(nozzle_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_nozzle_readings_session ON petrol_nozzle_readings(session_id);

CREATE TABLE IF NOT EXISTS petrol_fuel_bills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES billing_sessions(id),
  vehicle_no    TEXT,
  vehicle_type  TEXT,
  fuel_code     TEXT NOT NULL,
  nozzle_id     UUID REFERENCES petrol_nozzles(id),
  litres        NUMERIC(14,3) NOT NULL,
  rate_per_litre NUMERIC(14,4) NOT NULL,
  fuel_amount   NUMERIC(14,4) NOT NULL,
  service_charge NUMERIC(14,4) DEFAULT 0,
  total_amount  NUMERIC(14,4) NOT NULL,
  payment_method TEXT,
  bill_no       TEXT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS petrol_dsr (                -- Daily Sales Report
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date          DATE NOT NULL,
  fuel_code     TEXT NOT NULL,
  opening_stock NUMERIC(14,3),
  receipts      NUMERIC(14,3) DEFAULT 0,
  total_sales   NUMERIC(14,3) DEFAULT 0,
  closing_stock NUMERIC(14,3),
  revenue       NUMERIC(14,4) DEFAULT 0,
  UNIQUE (date, fuel_code)
);

-- ──────────────────────────────────────────────────────────────
-- SECTOR 4: HOTEL
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_room_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_code       TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  base_price      NUMERIC(14,4) NOT NULL,
  weekend_price   NUMERIC(14,4),
  max_occupancy   INT NOT NULL DEFAULT 2,
  amenities       TEXT[],
  gst_rate        NUMERIC(6,4) NOT NULL DEFAULT 12,
  image_url       TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO hotel_room_types (type_code, name, base_price, max_occupancy, gst_rate) VALUES
  ('STD',   'Standard Room',    1500, 2, 12),
  ('DLX',   'Deluxe Room',      2500, 2, 18),
  ('SUITE', 'Suite',            5000, 4, 18),
  ('EXEC',  'Executive Room',   3500, 2, 18)
ON CONFLICT (type_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS hotel_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_no     TEXT UNIQUE NOT NULL,
  floor       INT NOT NULL DEFAULT 1,
  type_code   TEXT NOT NULL REFERENCES hotel_room_types(type_code),
  status      TEXT NOT NULL DEFAULT 'available'
                CHECK (status IN ('available','occupied','maintenance','housekeeping','reserved')),
  last_cleaned TIMESTAMPTZ,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS hotel_reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_ref     TEXT UNIQUE NOT NULL,
  guest_name      TEXT NOT NULL,
  guest_phone     TEXT,
  guest_email     TEXT,
  guest_id_type   TEXT,
  guest_id_no     TEXT,
  room_id         UUID NOT NULL REFERENCES hotel_rooms(id),
  check_in_date   DATE NOT NULL,
  check_out_date  DATE NOT NULL,
  nights          INT  GENERATED ALWAYS AS (check_out_date - check_in_date) STORED,
  adults          INT  NOT NULL DEFAULT 1,
  children        INT  NOT NULL DEFAULT 0,
  room_rate       NUMERIC(14,4) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('enquiry','confirmed','checked_in','checked_out','cancelled','no_show')),
  source          TEXT DEFAULT 'walk_in'
                    CHECK (source IN ('walk_in','phone','online','ota','agent')),
  special_requests TEXT,
  meal_plan       TEXT DEFAULT 'EP' CHECK (meal_plan IN ('EP','CP','MAP','AP')),
  session_id      UUID REFERENCES billing_sessions(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hotel_res_room   ON hotel_reservations(room_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_hotel_res_dates  ON hotel_reservations(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_hotel_res_status ON hotel_reservations(status);

CREATE TABLE IF NOT EXISTS hotel_room_charges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  UUID NOT NULL REFERENCES hotel_reservations(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES billing_sessions(id),
  charge_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  charge_type     TEXT NOT NULL CHECK (charge_type IN (
                    'room_rent','room_service','restaurant','laundry',
                    'minibar','spa','parking','telephone','internet','misc')),
  description     TEXT NOT NULL,
  quantity        NUMERIC(14,4) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(14,4) NOT NULL,
  amount          NUMERIC(14,4) NOT NULL,
  gst_rate        NUMERIC(6,4) NOT NULL DEFAULT 0,
  gst_amount      NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(14,4) NOT NULL,
  is_complimentary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hotel_charges_res ON hotel_room_charges(reservation_id, charge_date);

CREATE TABLE IF NOT EXISTS hotel_folios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  UUID NOT NULL REFERENCES hotel_reservations(id),
  folio_no        TEXT UNIQUE NOT NULL,
  guest_name      TEXT NOT NULL,
  room_no         TEXT NOT NULL,
  check_in        TIMESTAMPTZ,
  check_out       TIMESTAMPTZ,
  total_charges   NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_payments  NUMERIC(14,4) NOT NULL DEFAULT 0,
  balance_due     NUMERIC(14,4) NOT NULL DEFAULT 0,
  gst_summary     JSONB DEFAULT '{}',
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- SHARED: TAX SUMMARY PER SESSION
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_tax_summary (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES billing_sessions(id) ON DELETE CASCADE,
  gst_rate      NUMERIC(6,4) NOT NULL,
  taxable_value NUMERIC(14,4) NOT NULL DEFAULT 0,
  cgst_amt      NUMERIC(14,4) NOT NULL DEFAULT 0,
  sgst_amt      NUMERIC(14,4) NOT NULL DEFAULT 0,
  igst_amt      NUMERIC(14,4) NOT NULL DEFAULT 0,
  cess_amt      NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_tax     NUMERIC(14,4) NOT NULL DEFAULT 0
);

-- ──────────────────────────────────────────────────────────────
-- TRIGGERS: auto-update updated_at
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION billing_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'billing_sessions','food_orders','hotel_reservations'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_billing_updated_at ON %I;
       CREATE TRIGGER trg_billing_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION billing_set_updated_at();', t, t);
  END LOOP;
END $$;
