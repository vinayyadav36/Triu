#!/usr/bin/env node
// =============================================================
// EmporiumVipani — scripts/json_data_service.js
// Thread-safe JSON-file CRUD service (Express + proper-lockfile)
// Run: node scripts/json_data_service.js
// =============================================================
'use strict';

const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');

const { execFile } = require('child_process');

const app  = express();
const PORT = process.env.PORT || 3001;

// Support both db/ (canonical) and data/ (legacy) directories
const DB_DIR   = path.join(__dirname, '..', 'db');
const DATA_DIR = path.join(__dirname, '..', 'data');
[DB_DIR, DATA_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Resolve file path: prefer db/, fallback to data/
function resolveDir(name) {
  const inDb   = path.join(DB_DIR,   `${name}.json`);
  const inData = path.join(DATA_DIR, `${name}.json`);
  if (fs.existsSync(inDb))   return DB_DIR;
  if (fs.existsSync(inData)) return DATA_DIR;
  return DB_DIR; // default: create in db/
}

// Legacy alias for callers that set DATA
const DATA = DB_DIR;

// ── Security: rate limiter ────────────────────────────────────
const _rateLimits = new Map(); // key → { count, resetAt }
function rateLimit(maxReqs, windowMs) {
  return (req, res, next) => {
    const key = req.ip + ':' + req.path;
    const now = Date.now();
    const entry = _rateLimits.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
    entry.count += 1;
    _rateLimits.set(key, entry);
    if (entry.count > maxReqs) return res.status(429).json({ ok: false, message: 'Too many requests. Try again later.' });
    next();
  };
}

// ── CORS: lock to Vercel domain in production ─────────────────
const ALLOWED_ORIGINS = [
  'https://emproiumvipani.vercel.app',
  'https://emproiumvipani.com',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
];
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  const allowed = process.env.NODE_ENV !== 'production' || ALLOWED_ORIGINS.includes(origin);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Security headers ──────────────────────────────────────────
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(express.json({ limit: '1mb' }));

// ── File helpers with advisory locking ───────────────────────
const _locks = new Map();

async function withLock(file, fn) {
  while (_locks.get(file)) await new Promise(r => setTimeout(r, 20));
  _locks.set(file, true);
  try   { return await fn(); }
  finally { _locks.delete(file); }
}

function readJSON(name) {
  const dir = resolveDir(name);
  const p   = path.join(dir, `${name}.json`);
  if (!fs.existsSync(p)) fs.writeFileSync(p, '[]', 'utf8');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
}

function writeJSON(name, data) {
  const dir = resolveDir(name);
  const p   = path.join(dir, `${name}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

// ── Generic CRUD factory ─────────────────────────────────────
function crud(router, collection) {
  // LIST
  router.get(`/${collection}`, (_, res) => {
    res.json({ ok: true, data: readJSON(collection) });
  });

  // GET ONE
  router.get(`/${collection}/:id`, (req, res) => {
    const items = readJSON(collection);
    const item  = items.find(i => String(i.id || i.agentId || i.invoice_no) === req.params.id);
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, data: item });
  });

  // CREATE
  router.post(`/${collection}`, async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, message: 'Invalid body' });
    await withLock(collection, () => {
      const items = readJSON(collection);
      if (!body.id) body.id = crypto.randomUUID();
      body.createdAt = new Date().toISOString();
      items.push(body);
      writeJSON(collection, items);
    });
    res.status(201).json({ ok: true, data: body });
  });

  // UPDATE
  router.put(`/${collection}/:id`, async (req, res) => {
    let updated = null;
    await withLock(collection, () => {
      const items = readJSON(collection);
      const idx   = items.findIndex(i => String(i.id || i.agentId) === req.params.id);
      if (idx === -1) return;
      items[idx] = { ...items[idx], ...req.body, updatedAt: new Date().toISOString() };
      updated = items[idx];
      writeJSON(collection, items);
    });
    if (!updated) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, data: updated });
  });

  // DELETE
  router.delete(`/${collection}/:id`, async (req, res) => {
    let removed = false;
    await withLock(collection, () => {
      const items  = readJSON(collection);
      const before = items.length;
      const next   = items.filter(i => String(i.id || i.agentId) !== req.params.id);
      removed = next.length < before;
      if (removed) writeJSON(collection, next);
    });
    if (!removed) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, message: 'Deleted' });
  });
}

const router = express.Router();

// Register all collections (supports both db/ and data/)
['partners_leads','partners_active','leads','partners','orders','inventory','inventory_master','payouts','sales_ledger'].forEach(c => crud(router, c));

// ── Partner Approval — special action ────────────────────────
router.post('/leads/:id/approve', async (req, res) => {
  let newPartner = null;
  // Support both 'leads' and 'partners_leads' collections
  await withLock('partners_leads', async () => {
    await withLock('partners_active', () => {
      const leadsA   = readJSON('partners_leads');
      const leadsB   = readJSON('leads');
      const partners = readJSON('partners_active');
      const idxA     = leadsA.findIndex(l => String(l.id) === req.params.id);
      const idxB     = leadsB.findIndex(l => String(l.id) === req.params.id);
      const idx      = idxA !== -1 ? idxA : idxB;
      const leads    = idxA !== -1 ? leadsA : leadsB;
      const coll     = idxA !== -1 ? 'partners_leads' : 'leads';
      if (idx === -1) return;

      const lead    = leads[idx];
      const seq     = partners.length + 1;
      const yr      = new Date().getFullYear();
      const agentId = `EV-AGNT-${yr}-${String(seq).padStart(3, '0')}`;

      newPartner = {
        ...lead,
        agentId,
        status:    'active',
        tier:      'Bronze',
        totalGmv:  0,
        commission:{ pending: 0, earned: 0, paid: 0 },
        approvedAt: new Date().toISOString(),
      };
      delete newPartner.id;

      partners.push(newPartner);
      leads.splice(idx, 1);
      writeJSON('partners_active', partners);
      writeJSON(coll, leads);
    });
  });

  if (!newPartner) return res.status(404).json({ ok: false, message: 'Lead not found' });
  res.json({ ok: true, data: newPartner });
});

// ── OTP Mock Auth ─────────────────────────────────────────────
const _otps = new Map(); // phone/email → { otp, expires, attempts }
const otpRateLimit = rateLimit(5, 10 * 60 * 1000); // 5 OTPs per 10 min per IP

router.post('/auth/otp/send', otpRateLimit, (req, res) => {
  const { identifier, agentId } = req.body || {};
  if (!identifier || !agentId) return res.status(400).json({ ok: false, message: 'identifier + agentId required' });

  const partners = [...readJSON('partners_active'), ...readJSON('partners')];
    p => p.agentId === agentId && (p.phone === identifier || p.email === identifier)
  );
  if (!partner) return res.status(404).json({ ok: false, message: 'Agent not found' });

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  _otps.set(identifier, { otp, expires: Date.now() + 5 * 60 * 1000, attempts: 0 });

  // In production: send via SMS/Email; here we return it for dev/mock
  console.log(`[OTP] ${identifier} → ${otp}`);
  res.json({ ok: true, message: 'OTP sent', _dev_otp: process.env.NODE_ENV !== 'production' ? otp : undefined });
});

router.post('/auth/otp/verify', (req, res) => {
  const { identifier, otp, agentId } = req.body || {};
  const record = _otps.get(identifier);

  if (!record)              return res.status(400).json({ ok: false, message: 'No OTP requested' });
  if (Date.now() > record.expires) { _otps.delete(identifier); return res.status(400).json({ ok: false, message: 'OTP expired' }); }
  if (record.attempts >= 3) return res.status(429).json({ ok: false, message: 'Too many attempts' });

  record.attempts += 1;
  if (record.otp !== String(otp)) return res.status(401).json({ ok: false, message: 'Invalid OTP' });

  _otps.delete(identifier);
  const token = Buffer.from(JSON.stringify({ agentId, identifier, exp: Date.now() + 2 * 3600 * 1000 })).toString('base64');
  // Return full partner data
  const all = [...readJSON('partners_active'), ...readJSON('partners')];
  const partnerData = all.find(p => p.agentId === agentId) || { agentId };
  res.json({ ok: true, token, agentId, data: { ...partnerData, token } });
});

// ── GST Sales Ledger — append sale ───────────────────────────
router.post('/sales', async (req, res) => {
  const body = req.body || {};
  const inventory = [...readJSON('inventory_master'), ...readJSON('inventory')];

  const items = (body.items || []).map(item => {
    const inv      = inventory.find(i => i.id === item.productId || i.name === item.name) || {};
    const gstRate  = inv.gstRate ?? 18;
    const price    = item.price || inv.mrp || 0;
    const taxable  = price * (item.qty || 1);
    const taxAmt   = taxable * (gstRate / 100);
    const intra    = (body.customer?.state || '').toLowerCase() === (body.sellerState || 'delhi').toLowerCase();
    return {
      hsn: inv.hsn || item.hsn || '9999',
      name: item.name || inv.name,
      price, qty: item.qty || 1, taxable, gstRate,
      cgst: intra ? taxAmt / 2 : 0,
      sgst: intra ? taxAmt / 2 : 0,
      igst: intra ? 0 : taxAmt,
    };
  });

  const taxable   = items.reduce((a, i) => a + i.taxable, 0);
  const totalGst  = items.reduce((a, i) => a + i.cgst + i.sgst + i.igst, 0);
  const commission = taxable * 0.05; // default 5%; adjusted by tier

  const sale = {
    invoice_no: `EV-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
    date:       new Date().toISOString().split('T')[0],
    agent_id:   body.agentId || null,
    source:     body.source  || 'Direct',
    customer:   body.customer || {},
    items,
    tax_breakup: {
      cgst:      items.reduce((a, i) => a + i.cgst, 0),
      sgst:      items.reduce((a, i) => a + i.sgst, 0),
      igst:      items.reduce((a, i) => a + i.igst, 0),
      total_gst: totalGst,
    },
    commission: Math.round(commission * 100) / 100,
    net_total:  Math.round((taxable + totalGst) * 100) / 100,
    createdAt:  new Date().toISOString(),
  };

  await withLock('sales_ledger', () => {
    const ledger = readJSON('sales_ledger');
    ledger.push(sale);
    writeJSON('sales_ledger', ledger);
  });

  // Update partner GMV + commission in both collections
  if (sale.agent_id) {
    for (const coll of ['partners_active', 'partners']) {
      await withLock(coll, () => {
        const partners = readJSON(coll);
        const p = partners.find(x => x.agentId === sale.agent_id);
        if (p) {
          p.totalGmv = (p.totalGmv || 0) + taxable;
          p.commission = p.commission || { pending: 0, earned: 0, paid: 0 };
          p.commission.pending += sale.commission;
          p.commission.earned  = (p.commission.earned  || 0) + sale.commission;
          writeJSON(coll, partners);
        }
      });
    }
  }

  res.status(201).json({ ok: true, data: sale });
});

// ── BI Export — CSV for PowerBI ───────────────────────────────
router.get('/export/powerbi', (_, res) => {
  const ledger = readJSON('sales_ledger');
  const rows   = ledger.map(s => ({
    InvoiceNo:        s.invoice_no,
    Date:             s.date,
    AgentID:          s.agent_id || '',
    CustomerName:     s.customer?.name || '',
    CustomerState:    s.customer?.state || '',
    Source:           s.source || '',
    TaxableAmount:    s.tax_breakup ? (s.net_total - s.tax_breakup.total_gst).toFixed(2) : '0',
    CGST:             (s.tax_breakup?.cgst || 0).toFixed(2),
    SGST:             (s.tax_breakup?.sgst || 0).toFixed(2),
    IGST:             (s.tax_breakup?.igst || 0).toFixed(2),
    TotalGST:         (s.tax_breakup?.total_gst || 0).toFixed(2),
    Commission:       (s.commission || 0).toFixed(2),
    NetTotal:         (s.net_total || 0).toFixed(2),
  }));

  if (!rows.length) return res.json({ ok: true, data: [] });

  const headers = Object.keys(rows[0]).join(',');
  const csv     = [headers, ...rows.map(r => Object.values(r).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="emproiumvipani_powerbi.csv"');
  res.send(csv);
});

// ── Market Status — calls Python market_sync.py ──────────────
router.get('/market-status', (req, res) => {
  const scriptPath = path.join(__dirname, 'market_sync.py');
  if (!fs.existsSync(scriptPath)) {
    // Return cached or mock data
    const cache = path.join(DB_DIR, 'market_cache.json');
    if (fs.existsSync(cache)) return res.json({ ok: true, data: JSON.parse(fs.readFileSync(cache, 'utf8')) });
    return res.json({ ok: true, data: { name:'NIFTY 50', price:24547.80, change:0.42, source:'mock', updated: new Date().toLocaleTimeString() } });
  }
  execFile('python3', [scriptPath, '--output', 'json', '--index', req.query.index || '^NSEI'], { timeout: 12000 }, (err, stdout) => {
    if (err) {
      const cache = path.join(DB_DIR, 'market_cache.json');
      if (fs.existsSync(cache)) return res.json({ ok: true, data: JSON.parse(fs.readFileSync(cache, 'utf8')) });
      return res.json({ ok: false, message: 'yfinance unavailable. Run: pip3 install yfinance' });
    }
    try { res.json({ ok: true, data: JSON.parse(stdout) }); }
    catch { res.json({ ok: false, message: 'Parse error' }); }
  });
});

// ── Run Python business_iq.py simulation ─────────────────────
router.post('/run-research', (req, res) => {
  const scriptPath = path.join(__dirname, 'business_iq.py');
  if (!fs.existsSync(scriptPath)) return res.json({ ok: false, message: 'business_iq.py not found' });
  const priceChange = Number(req.body?.priceChange || 0);
  const args = ['python3', scriptPath];
  if (priceChange !== 0) args.splice(1, 0, `--simulate-price-increase`, String(priceChange));
  execFile(args[0], args.slice(1), { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) return res.json({ ok: false, message: stderr || err.message });
    res.json({ ok: true, data: { output: stdout } });
  });
});

// ── Simulation report CSV ─────────────────────────────────────
router.get('/export/simulation', (req, res) => {
  const ledger = readJSON('sales_ledger');
  const priceChange  = Number(req.query.price  || 0);
  const commChange   = Number(req.query.comm   || 5);
  const elasticity   = -0.5;
  const demandMult   = 1 + (priceChange * elasticity / 100);
  const priceMult    = 1 + priceChange / 100;
  const rows = ledger.map(s => {
    const base = s.net_total || 0;
    return {
      InvoiceNo:      s.invoice_no,
      Date:           s.date,
      ActualRevenue:  base.toFixed(2),
      SimulatedRev:   (base * priceMult * demandMult).toFixed(2),
      PriceChangePct: priceChange,
      CommissionRate: commChange,
      Source:         s.source || 'Direct',
    };
  });
  const headers = Object.keys(rows[0] || {}).join(',');
  const csv     = [headers, ...rows.map(r => Object.values(r).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="simulation_report.csv"');
  res.send(csv || headers);
});

app.use('/api', router);
app.listen(PORT, () => console.log(`✅ EmproiumVipani JSON Data Service running on port ${PORT}
   Admin: http://localhost:${PORT}/api/partners_active
   Market: http://localhost:${PORT}/api/market-status
   Export: http://localhost:${PORT}/api/export/powerbi`));
