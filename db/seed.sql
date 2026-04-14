-- ============================================================
-- EmproiumVipani — Seed Data
-- ============================================================

-- HSN code → GST rate reference data
INSERT INTO hsn_gst_rates (hsn_code, description, gst_rate, category) VALUES
  ('8471', 'Computers & laptops',          18, 'Electronics'),
  ('8517', 'Mobile phones',                18, 'Electronics'),
  ('8528', 'Monitors & TVs',               28, 'Electronics'),
  ('6109', 'T-shirts & casual wear',       12, 'Garments'),
  ('6203', 'Men''s suits & trousers',      12, 'Garments'),
  ('0901', 'Coffee',                        5, 'Grocery'),
  ('1905', 'Bread & pastries',              5, 'Grocery'),
  ('4901', 'Books',                         0, 'Books'),
  ('4903', 'Children''s books',             0, 'Books'),
  ('6401', 'Waterproof footwear',          12, 'Footwear'),
  ('9401', 'Seats & chairs',               18, 'Furniture'),
  ('7113', 'Jewellery (precious metal)',    3, 'Jewellery'),
  ('3004', 'Medicaments',                  12, 'Pharma'),
  ('8703', 'Motor cars',                   28, 'Automobile'),
  ('9503', 'Toys & games',                 12, 'Toys'),
  ('3301', 'Essential oils & perfumes',    18, 'Beauty'),
  ('4820', 'Notebooks & stationery',       12, 'Stationery')
ON CONFLICT (hsn_code) DO NOTHING;

-- Platform badges
INSERT INTO badges (slug, name, description, icon, category, xp_reward) VALUES
  ('gst_gold_filer',   'GST Gold Filer',   'Filed GST returns on time for 6 consecutive months', '🥇', 'compliance', 500),
  ('gst_silver_filer', 'GST Silver Filer', 'Filed GST returns on time for 3 consecutive months', '🥈', 'compliance', 250),
  ('first_order',      'First Order',      'Received your first order',                           '🛍️', 'milestone',  100),
  ('century_orders',   '100 Orders',       'Received 100 orders',                                 '💯', 'milestone',  300),
  ('super_seller',     'Super Seller',     'Achieved ₹1L+ in monthly revenue',                    '⭐', 'sales',      400),
  ('zero_returns',     'Zero Returns',     'Zero returns in a calendar month',                    '🎯', 'sales',      200),
  ('kyc_complete',     'KYC Complete',     'Completed full KYC verification',                     '✅', 'milestone',  150),
  ('hundred_deploys',  '100 Builds',       '100 CI/CD pipeline deployments completed',            '🚀', 'devops',     300),
  ('speed_demon',      'Speed Demon',      'Build completed in under 60 seconds',                 '⚡', 'devops',     100),
  ('compliance_hero',  'Compliance Hero',  'All product listings pass GST norm checks',           '🛡️', 'gamified',   350)
ON CONFLICT (slug) DO NOTHING;
