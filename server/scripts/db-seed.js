#!/usr/bin/env node
// server/scripts/db-seed.js
// Seeds the database with realistic Indian marketplace data.
// Safe to re-run: skips seeding if data already exists.

'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/emproiumvipani';

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const adminUsers = [
  {
    name: 'Rajesh Kumar Sharma',
    email: 'rajesh.admin@emproiumvipani.com',
    phone: '+919876543210',
    password: 'Admin@1234',
    role: 'admin',
    isVerified: true,
    address: { street: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', country: 'India' }
  },
  {
    name: 'Priya Nair',
    email: 'priya.admin@emproiumvipani.com',
    phone: '+919812345678',
    password: 'Admin@1234',
    role: 'admin',
    isVerified: true,
    address: { street: '45 Anna Salai', city: 'Chennai', state: 'Tamil Nadu', pincode: '600002', country: 'India' }
  },
  {
    name: 'Amit Verma',
    email: 'amit.admin@emproiumvipani.com',
    phone: '+919911223344',
    password: 'Admin@1234',
    role: 'admin',
    isVerified: true,
    address: { street: '7 Connaught Place', city: 'Delhi', state: 'Delhi', pincode: '110001', country: 'India' }
  }
];

const sellerUsers = [
  {
    name: 'Suresh Patel',
    email: 'suresh.seller@gmail.com',
    phone: '+919823456789',
    password: 'Seller@1234',
    role: 'seller',
    isVerified: true,
    address: { street: '22 CG Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380006', country: 'India' },
    seller: {
      businessName: 'Patel General Stores',
      gstin: '24AAACG1234F1ZV',
      pan: 'AAACG1234F',
      bankAccount: { accountNumber: '1234567890', ifsc: 'SBIN0001234', bankName: 'State Bank of India' },
      status: 'approved',
      commissionRate: 5
    }
  },
  {
    name: 'Kavitha Reddy',
    email: 'kavitha.seller@gmail.com',
    phone: '+919934567890',
    password: 'Seller@1234',
    role: 'seller',
    isVerified: true,
    address: { street: '88 Banjara Hills', city: 'Hyderabad', state: 'Telangana', pincode: '500034', country: 'India' },
    seller: {
      businessName: 'Kavitha Fashion House',
      gstin: '36AAACK5678G1ZP',
      pan: 'AAACK5678G',
      bankAccount: { accountNumber: '9876543210', ifsc: 'HDFC0002345', bankName: 'HDFC Bank' },
      status: 'approved',
      commissionRate: 5
    }
  },
  {
    name: 'Mohammed Farooq',
    email: 'farooq.seller@gmail.com',
    phone: '+919845678901',
    password: 'Seller@1234',
    role: 'seller',
    isVerified: true,
    address: { street: '14 Linking Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400054', country: 'India' },
    seller: {
      businessName: 'Farooq Electronics',
      gstin: '27AAACF9012H1ZK',
      pan: 'AAACF9012H',
      bankAccount: { accountNumber: '1122334455', ifsc: 'ICIC0003456', bankName: 'ICICI Bank' },
      status: 'approved',
      commissionRate: 5
    }
  },
  {
    name: 'Deepa Iyer',
    email: 'deepa.seller@gmail.com',
    phone: '+919856789012',
    password: 'Seller@1234',
    role: 'seller',
    isVerified: true,
    address: { street: '5 FC Road', city: 'Pune', state: 'Maharashtra', pincode: '411004', country: 'India' },
    seller: {
      businessName: 'Deepa Home Essentials',
      gstin: '27AAACD3456I1ZQ',
      pan: 'AAACD3456I',
      bankAccount: { accountNumber: '5566778899', ifsc: 'AXIS0004567', bankName: 'Axis Bank' },
      status: 'approved',
      commissionRate: 5
    }
  },
  {
    name: 'Sanjay Gupta',
    email: 'sanjay.seller@gmail.com',
    phone: '+919867890123',
    password: 'Seller@1234',
    role: 'seller',
    isVerified: true,
    address: { street: '33 Park Street', city: 'Kolkata', state: 'West Bengal', pincode: '700016', country: 'India' },
    seller: {
      businessName: 'Gupta Books & Stationery',
      gstin: '19AAACG7890J1ZR',
      pan: 'AAACG7890J',
      bankAccount: { accountNumber: '6677889900', ifsc: 'PUNB0005678', bankName: 'Punjab National Bank' },
      status: 'approved',
      commissionRate: 5
    }
  }
];

const customerUsers = [
  { name: 'Ananya Krishnan', email: 'ananya.k@gmail.com', phone: '+919700112233', city: 'Chennai', state: 'Tamil Nadu', pincode: '600020' },
  { name: 'Vikram Singh', email: 'vikram.s@gmail.com', phone: '+919700223344', city: 'Delhi', state: 'Delhi', pincode: '110025' },
  { name: 'Meera Pillai', email: 'meera.p@gmail.com', phone: '+919700334455', city: 'Bengaluru', state: 'Karnataka', pincode: '560034' },
  { name: 'Rohan Joshi', email: 'rohan.j@gmail.com', phone: '+919700445566', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
  { name: 'Sunita Agarwal', email: 'sunita.a@gmail.com', phone: '+919700556677', city: 'Lucknow', state: 'Uttar Pradesh', pincode: '226001' },
  { name: 'Arjun Mehta', email: 'arjun.m@gmail.com', phone: '+919700667788', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
  { name: 'Pooja Sharma', email: 'pooja.s@gmail.com', phone: '+919700778899', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
  { name: 'Karthik Balaji', email: 'karthik.b@gmail.com', phone: '+919700889900', city: 'Hyderabad', state: 'Telangana', pincode: '500082' },
  { name: 'Neha Desai', email: 'neha.d@gmail.com', phone: '+919700990011', city: 'Surat', state: 'Gujarat', pincode: '395001' },
  { name: 'Rahul Mishra', email: 'rahul.m@gmail.com', phone: '+919701001122', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001' }
];

// Products will be assigned seller IDs after sellers are created
const productTemplates = [
  {
    name: 'Himalaya Purifying Neem Face Wash 150ml',
    description: 'Himalaya Purifying Neem Face Wash prevents pimples and blackheads with the natural properties of Neem and Turmeric. Specially formulated for oily and acne-prone skin, it gently cleanses and leaves skin feeling refreshed.',
    category: 'Health & Beauty',
    subcategory: 'Face Care',
    price: 120,
    mrp: 150,
    stock: 500,
    images: ['https://placehold.co/400x400/16a34a/ffffff?text=Himalaya+Face+Wash'],
    tags: ['face wash', 'neem', 'himalaya', 'skincare', 'acne'],
    gstRate: 18,
    hsnCode: '33051090',
    brand: 'Himalaya',
    sellerIndex: 0
  },
  {
    name: 'Casio FX-991ES Plus Scientific Calculator',
    description: 'Casio FX-991ES Plus is a 2nd edition scientific calculator with 417 functions. Features natural textbook display, matrix and vector calculations, equation solver, and runs on both solar and battery power.',
    category: 'Electronics',
    subcategory: 'Calculators',
    price: 950,
    mrp: 1195,
    stock: 200,
    images: ['https://placehold.co/400x400/1d4ed8/ffffff?text=Casio+Calculator'],
    tags: ['calculator', 'scientific', 'casio', 'exam', 'student'],
    gstRate: 18,
    hsnCode: '84702100',
    brand: 'Casio',
    sellerIndex: 2
  },
  {
    name: 'Allen Solly Formal Shirt — Sky Blue, Size M',
    description: 'Allen Solly classic slim fit formal shirt in sky blue. Made from 100% premium cotton fabric with a semi-spread collar. Machine washable. Ideal for office and semi-formal occasions.',
    category: 'Clothing',
    subcategory: 'Men\'s Shirts',
    price: 1299,
    mrp: 1999,
    stock: 150,
    images: ['https://placehold.co/400x400/0284c7/ffffff?text=Allen+Solly+Shirt'],
    tags: ['shirt', 'formal', 'allen solly', 'men', 'office wear'],
    gstRate: 5,
    hsnCode: '62051000',
    brand: 'Allen Solly',
    sellerIndex: 1
  },
  {
    name: 'Nilkamal Plastic Chair Set of 4 — Marble Brown',
    description: 'Nilkamal heavy-duty plastic chairs suitable for home, office, and outdoor use. Made from virgin polypropylene for superior strength. Stackable design saves space. Weight capacity 150 kg per chair.',
    category: 'Furniture',
    subcategory: 'Chairs',
    price: 2199,
    mrp: 2800,
    stock: 80,
    images: ['https://placehold.co/400x400/92400e/ffffff?text=Nilkamal+Chairs'],
    tags: ['chair', 'plastic chair', 'nilkamal', 'furniture', 'set of 4'],
    gstRate: 18,
    hsnCode: '94019000',
    brand: 'Nilkamal',
    sellerIndex: 3
  },
  {
    name: 'Prestige PKPW 1.8 Litre Electric Kettle — Silver',
    description: 'Prestige PKPW 1800W electric kettle with 1.8 litre capacity. Borosilicate glass body with stainless steel base. Auto shut-off and boil-dry protection. 360° rotation cordless base. BPA-free.',
    category: 'Kitchen Appliances',
    subcategory: 'Kettles',
    price: 899,
    mrp: 1299,
    stock: 120,
    images: ['https://placehold.co/400x400/6b7280/ffffff?text=Prestige+Kettle'],
    tags: ['kettle', 'electric kettle', 'prestige', 'kitchen', 'boiler'],
    gstRate: 18,
    hsnCode: '85162910',
    brand: 'Prestige',
    sellerIndex: 3
  },
  {
    name: 'Amul Butter 500g — Pasteurised',
    description: 'Amul pasteurised butter made from fresh cream. Rich in vitamins A, D, E and K. No artificial colours or preservatives. Ideal for cooking, baking, and spreading. Refrigerate after opening.',
    category: 'Grocery',
    subcategory: 'Dairy',
    price: 265,
    mrp: 280,
    stock: 300,
    images: ['https://placehold.co/400x400/fbbf24/000000?text=Amul+Butter'],
    tags: ['butter', 'amul', 'dairy', 'grocery', 'cooking'],
    gstRate: 5,
    hsnCode: '04051000',
    brand: 'Amul',
    sellerIndex: 0
  },
  {
    name: 'Pigeon Aluminium Non-Stick Cookware Set — 5 Pieces',
    description: 'Pigeon 5-piece aluminium non-stick cookware set including kadai, fry pan, saucepan with lids. PFOA-free non-stick coating. Hard anodised exterior for durability. Induction and gas compatible.',
    category: 'Kitchen',
    subcategory: 'Cookware',
    price: 1449,
    mrp: 2499,
    stock: 95,
    images: ['https://placehold.co/400x400/171717/ffffff?text=Pigeon+Cookware'],
    tags: ['cookware', 'non-stick', 'pigeon', 'kadai', 'kitchen set'],
    gstRate: 18,
    hsnCode: '73239300',
    brand: 'Pigeon',
    sellerIndex: 3
  },
  {
    name: 'Classmate Premium Spiral Notebook A4 — 180 Pages',
    description: 'Classmate premium quality spiral notebook with 180 ruled pages. 90 GSM paper for smear-free writing. Laminated cover for durability. Suitable for college and office use.',
    category: 'Stationery',
    subcategory: 'Notebooks',
    price: 85,
    mrp: 110,
    stock: 1000,
    images: ['https://placehold.co/400x400/7c3aed/ffffff?text=Classmate+Notebook'],
    tags: ['notebook', 'classmate', 'stationery', 'spiral', 'college'],
    gstRate: 12,
    hsnCode: '48201000',
    brand: 'Classmate',
    sellerIndex: 4
  },
  {
    name: 'Wildcraft Unisex Laptop Backpack 30L — Navy Blue',
    description: 'Wildcraft 30 litre backpack with dedicated 15.6-inch laptop compartment. Ergonomic padded shoulder straps and back panel. Water-resistant fabric. Multiple organiser pockets. Ideal for college and travel.',
    category: 'Bags',
    subcategory: 'Backpacks',
    price: 1799,
    mrp: 2599,
    stock: 75,
    images: ['https://placehold.co/400x400/1e3a8a/ffffff?text=Wildcraft+Backpack'],
    tags: ['backpack', 'wildcraft', 'laptop bag', 'travel', 'college bag'],
    gstRate: 18,
    hsnCode: '42029200',
    brand: 'Wildcraft',
    sellerIndex: 1
  },
  {
    name: 'Tata Tea Gold 500g — Premium Assam & Darjeeling Blend',
    description: 'Tata Tea Gold is a unique blend of fine Assam and Darjeeling tea leaves. Long leaf collection for a rich, golden brew. Packed with antioxidants. Strong, aromatic flavour for the perfect Indian chai.',
    category: 'Grocery',
    subcategory: 'Tea & Coffee',
    price: 249,
    mrp: 270,
    stock: 400,
    images: ['https://placehold.co/400x400/b45309/ffffff?text=Tata+Tea+Gold'],
    tags: ['tea', 'tata tea', 'chai', 'grocery', 'assam'],
    gstRate: 5,
    hsnCode: '09021000',
    brand: 'Tata Tea',
    sellerIndex: 0
  },
  {
    name: 'boAt Rockerz 450 Bluetooth Headphone — Luscious Black',
    description: 'boAt Rockerz 450 on-ear wireless headphone with 15 hours playback, 40mm dynamic drivers, and padded ear cushions. Integrated mic for hands-free calls. Compatible with all Bluetooth devices.',
    category: 'Electronics',
    subcategory: 'Headphones',
    price: 1299,
    mrp: 3490,
    stock: 180,
    images: ['https://placehold.co/400x400/111827/ffffff?text=boAt+Headphone'],
    tags: ['headphone', 'boat', 'bluetooth', 'wireless', 'music'],
    gstRate: 18,
    hsnCode: '85183000',
    brand: 'boAt',
    sellerIndex: 2
  },
  {
    name: 'Sundaram Textiles Pure Cotton Saree — Kanchi Border',
    description: 'Handwoven pure cotton saree with traditional Kanchipuram border in contrasting colour. 5.5 metres length with 0.8 metre blouse piece. Machine washable. Ideal for daily wear and festive occasions.',
    category: 'Clothing',
    subcategory: 'Women\'s Sarees',
    price: 799,
    mrp: 1200,
    stock: 60,
    images: ['https://placehold.co/400x400/be185d/ffffff?text=Cotton+Saree'],
    tags: ['saree', 'cotton', 'kanchi', 'women', 'traditional'],
    gstRate: 5,
    hsnCode: '52089090',
    brand: 'Sundaram Textiles',
    sellerIndex: 1
  },
  {
    name: 'Godrej Aer Twist Car Freshener — Morning Misty Meadows',
    description: 'Godrej Aer Twist clip-on car air freshener with innovative twist mechanism to control fragrance intensity. Lasts up to 45 days. Unique Morning Misty Meadows fragrance. Attaches to car AC vents.',
    category: 'Automotive',
    subcategory: 'Car Accessories',
    price: 139,
    mrp: 165,
    stock: 350,
    images: ['https://placehold.co/400x400/059669/ffffff?text=Godrej+Aer'],
    tags: ['car freshener', 'godrej', 'aer', 'fragrance', 'auto'],
    gstRate: 18,
    hsnCode: '33074900',
    brand: 'Godrej',
    sellerIndex: 0
  },
  {
    name: 'Dabur Honey 500g — 100% Pure NMR Tested',
    description: 'Dabur Honey is 100% pure and NMR tested for authenticity. Rich source of natural energy. Contains antioxidants. No added sugar or artificial flavours. Sourced from natural beehives across India.',
    category: 'Health & Beauty',
    subcategory: 'Health Foods',
    price: 219,
    mrp: 265,
    stock: 280,
    images: ['https://placehold.co/400x400/d97706/000000?text=Dabur+Honey'],
    tags: ['honey', 'dabur', 'pure honey', 'health', 'organic'],
    gstRate: 5,
    hsnCode: '04090000',
    brand: 'Dabur',
    sellerIndex: 0
  },
  {
    name: 'Orient Electric 1200mm Ceiling Fan — Apex-FX White',
    description: 'Orient Electric Apex-FX 1200mm ceiling fan with double ball bearings for silent operation. 72W power consumption. 3 speed settings. Includes capacitor for energy efficiency. 2-year warranty.',
    category: 'Electrical',
    subcategory: 'Fans',
    price: 2299,
    mrp: 3200,
    stock: 45,
    images: ['https://placehold.co/400x400/e5e7eb/111827?text=Orient+Fan'],
    tags: ['ceiling fan', 'orient', 'fan', 'electrical', 'home'],
    gstRate: 18,
    hsnCode: '84145100',
    brand: 'Orient Electric',
    sellerIndex: 2
  },
  {
    name: 'Asian Paints Royale Luxury Emulsion — 4 Litre — Brilliant White',
    description: 'Asian Paints Royale Luxury Emulsion for interior walls with 2x sheen, stain guard, and anti-algal technology. Smooth, rich finish. Coverage 130-160 sq ft per litre. Low VOC formulation.',
    category: 'Home Improvement',
    subcategory: 'Paints',
    price: 2349,
    mrp: 2799,
    stock: 35,
    images: ['https://placehold.co/400x400/f8fafc/111827?text=Asian+Paints'],
    tags: ['paint', 'asian paints', 'royale', 'interior', 'white'],
    gstRate: 18,
    hsnCode: '32081090',
    brand: 'Asian Paints',
    sellerIndex: 3
  },
  {
    name: 'Garnier Micellar Cleansing Water 400ml — All Skin Types',
    description: 'Garnier SkinActive Micellar Cleansing Water gently removes makeup, dirt, and impurities in one step — no rinsing needed. Suitable for all skin types including sensitive skin. Dermatologist tested.',
    category: 'Health & Beauty',
    subcategory: 'Face Care',
    price: 349,
    mrp: 425,
    stock: 220,
    images: ['https://placehold.co/400x400/a78bfa/ffffff?text=Garnier+Micellar'],
    tags: ['micellar water', 'garnier', 'makeup remover', 'skincare', 'cleanser'],
    gstRate: 18,
    hsnCode: '33049990',
    brand: 'Garnier',
    sellerIndex: 0
  },
  {
    name: 'Sony WH-CH720N Wireless Noise Cancelling Headphone',
    description: 'Sony WH-CH720N lightweight wireless headphones with industry-leading noise cancellation. 35-hour battery life, multipoint connection, and quick charge. Foldable design for portability. Hi-Res Audio certified.',
    category: 'Electronics',
    subcategory: 'Headphones',
    price: 7999,
    mrp: 12990,
    stock: 40,
    images: ['https://placehold.co/400x400/0f172a/ffffff?text=Sony+WH-CH720N'],
    tags: ['headphone', 'sony', 'noise cancelling', 'wireless', 'premium'],
    gstRate: 18,
    hsnCode: '85183000',
    brand: 'Sony',
    sellerIndex: 2
  },
  {
    name: 'Wagh Bakri Premium Tea 500g — CTC Blend',
    description: 'Wagh Bakri premium CTC tea from the finest Assam gardens. Robust and rich flavour with a deep amber colour. Perfect for the traditional Indian cutting chai. No artificial colours or flavours.',
    category: 'Grocery',
    subcategory: 'Tea & Coffee',
    price: 189,
    mrp: 220,
    stock: 500,
    images: ['https://placehold.co/400x400/78350f/ffffff?text=Wagh+Bakri+Tea'],
    tags: ['tea', 'wagh bakri', 'ctc', 'chai', 'assam'],
    gstRate: 5,
    hsnCode: '09021000',
    brand: 'Wagh Bakri',
    sellerIndex: 0
  },
  {
    name: 'Usha Shriram Mixer Grinder 750W — 3 Jars — Multicolour',
    description: 'Usha Shriram 750W mixer grinder with 3 stainless steel jars (1.5L, 1L, 0.5L). Overload protector and speed control. Suitable for wet and dry grinding. 2-year motor warranty, 1-year product warranty.',
    category: 'Kitchen Appliances',
    subcategory: 'Mixer Grinders',
    price: 2699,
    mrp: 3999,
    stock: 60,
    images: ['https://placehold.co/400x400/dc2626/ffffff?text=Usha+Mixer'],
    tags: ['mixer grinder', 'usha', 'kitchen', 'grinder', 'blender'],
    gstRate: 18,
    hsnCode: '85094000',
    brand: 'Usha',
    sellerIndex: 3
  }
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function hashPassword(plainText) {
  return bcrypt.hash(plainText, 10);
}

function makeOrderId() {
  return 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB:', MONGO_URI);

  // Guard: skip if data already exists
  const existingUsers = await User.countDocuments();
  if (existingUsers > 0) {
    console.log(`ℹ️  Database already has ${existingUsers} users. Skipping seed.`);
    console.log('   Run db-reset.js to clear and re-seed.');
    await mongoose.disconnect();
    return;
  }

  console.log('\n🌱 Seeding database...\n');

  // --- Admins ---
  for (const a of adminUsers) {
    const hashed = await hashPassword(a.password);
    const user = await User.create({ ...a, password: hashed });
    console.log(`  👤 Admin: ${user.name} (${user.email})`);
  }

  // --- Sellers ---
  const createdSellers = [];
  for (const s of sellerUsers) {
    const hashed = await hashPassword(s.password);
    const user = await User.create({ ...s, password: hashed });
    createdSellers.push(user);
    console.log(`  🏪 Seller: ${user.name} — ${user.seller?.businessName}`);
  }

  // --- Customers ---
  const createdCustomers = [];
  for (const c of customerUsers) {
    const hashed = await hashPassword('Customer@1234');
    const user = await User.create({
      name: c.name,
      email: c.email,
      phone: c.phone,
      password: hashed,
      role: 'customer',
      isVerified: true,
      address: { city: c.city, state: c.state, pincode: c.pincode, country: 'India' }
    });
    createdCustomers.push(user);
    console.log(`  🛒 Customer: ${user.name} (${user.email})`);
  }

  // --- Products ---
  const createdProducts = [];
  for (const pt of productTemplates) {
    const seller = createdSellers[pt.sellerIndex];
    const product = await Product.create({
      name: pt.name,
      description: pt.description,
      category: pt.category,
      subcategory: pt.subcategory,
      price: pt.price,
      mrp: pt.mrp,
      stock: pt.stock,
      images: pt.images,
      tags: pt.tags,
      gstRate: pt.gstRate,
      hsnCode: pt.hsnCode,
      brand: pt.brand,
      sellerId: seller._id,
      sellerName: seller.seller?.businessName || seller.name,
      status: 'active',
      ratings: { average: +(3.5 + Math.random() * 1.5).toFixed(1), count: Math.floor(Math.random() * 500 + 50) }
    });
    createdProducts.push(product);
    console.log(`  📦 Product: ${product.name}`);
  }

  // --- Orders ---
  const orderStatuses = ['delivered', 'delivered', 'shipped', 'processing', 'cancelled'];
  for (let i = 0; i < 5; i++) {
    const customer = createdCustomers[i % createdCustomers.length];
    const product = createdProducts[i % createdProducts.length];
    const qty = Math.floor(Math.random() * 3) + 1;
    const subtotal = product.price * qty;
    const tax = +(subtotal * (product.gstRate / 100)).toFixed(2);
    const shipping = subtotal >= 1000 ? 0 : 50;
    const total = +(subtotal + tax + shipping).toFixed(2);
    const status = orderStatuses[i];

    await Order.create({
      orderId: makeOrderId(),
      userId: customer._id,
      customerName: customer.name,
      customerEmail: customer.email,
      items: [{
        productId: product._id,
        productName: product.name,
        quantity: qty,
        price: product.price,
        total: product.price * qty,
        sellerId: product.sellerId,
        sellerName: product.sellerName
      }],
      subtotal,
      tax,
      shipping,
      total,
      status,
      payment: {
        method: ['upi', 'card', 'netbanking', 'cod', 'wallet'][i % 5],
        status: status === 'cancelled' ? 'refunded' : 'completed',
        transactionId: 'TXN' + Date.now() + i
      },
      shippingAddress: {
        name: customer.name,
        phone: customer.phone,
        street: '123 Sample Street',
        city: customer.address?.city || 'Mumbai',
        state: customer.address?.state || 'Maharashtra',
        pincode: customer.address?.pincode || '400001',
        country: 'India'
      }
    });
    console.log(`  🧾 Order: ${status} — ₹${total} for ${customer.name}`);
  }

  console.log('\n✅ Seed complete!\n');
  console.log('   Admins:    3 (password: Admin@1234)');
  console.log('   Sellers:   5 (password: Seller@1234)');
  console.log('   Customers: 10 (password: Customer@1234)');
  console.log('   Products:  20');
  console.log('   Orders:    5');

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
