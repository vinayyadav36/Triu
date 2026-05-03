#!/usr/bin/env node
// server/scripts/db-seed.js
// Seeds the JSON database with realistic Indian marketplace data.
// Safe to re-run: skips seeding if data already exists.

'use strict';

const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path   = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Use TRIU_DB_DIR env var if set (e.g. in tests), otherwise server/db/
process.env.TRIU_DB_DIR = process.env.TRIU_DB_DIR || path.join(__dirname, '..', 'db');
const db = require('../utils/jsonDB');

// ── Seed data ────────────────────────────────────────────────────────────────

async function seed() {
    console.log('🌱 Starting JSON DB seed...\n');

    // ── Admin user ───────────────────────────────────────────────────────────
    const existingAdmin = db.findOne('users', u => u.email === 'admin@triu.com');
    if (!existingAdmin) {
        const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10);
        db.create('users', {
            name:         'Admin',
            email:        'admin@triu.com',
            phone:        '9999999999',
            passwordHash,
            role:         'admin',
            status:       'active',
            seller:       null,
            orders:       [],
            wishlist:     [],
            address:      null,
            lastLogin:    null,
            xp:           0,
            level:        1,
            badges:       [],
        });
        console.log('  ✅ Created admin user: admin@triu.com / Admin@123');
    } else {
        console.log('  ⏭️  Admin user already exists, skipping.');
    }

    // ── Sample seller ────────────────────────────────────────────────────────
    const existingSeller = db.findOne('users', u => u.email === 'seller@triu.com');
    let sellerId;
    if (!existingSeller) {
        const passwordHash = await bcrypt.hash('Seller@123', 10);
        const seller = db.create('users', {
            name:         'Triu Store',
            email:        'seller@triu.com',
            phone:        '9876543210',
            passwordHash,
            role:         'seller',
            status:       'active',
            seller: {
                businessName:  'Triu Marketplace',
                description:   'Official Triu store with curated quality products',
                gstNumber:     '29ABCDE1234F1Z5',
                panNumber:     'ABCDE1234F',
                category:      'general',
                bankAccount:   null,
                phone:         '9876543210',
                address:       null,
                status:        'approved',
                verified:      true,
                appliedAt:     new Date().toISOString(),
                approvedAt:    new Date().toISOString(),
            },
            orders:    [],
            wishlist:  [],
            address:   null,
            lastLogin: null,
            xp:        0,
            level:     1,
            badges:    [],
        });
        sellerId = seller.id;
        console.log('  ✅ Created seller user: seller@triu.com / Seller@123');
    } else {
        sellerId = existingSeller.id;
        console.log('  ⏭️  Seller user already exists, skipping.');
    }

    // ── Sample buyer ─────────────────────────────────────────────────────────
    const existingBuyer = db.findOne('users', u => u.email === 'buyer@triu.com');
    if (!existingBuyer) {
        const passwordHash = await bcrypt.hash('Buyer@123', 10);
        db.create('users', {
            name:         'Sample Buyer',
            email:        'buyer@triu.com',
            phone:        '9123456789',
            passwordHash,
            role:         'customer',
            status:       'active',
            seller:       null,
            orders:       [],
            wishlist:     [],
            address:      {
                street:  '42 MG Road',
                city:    'Bengaluru',
                state:   'Karnataka',
                pincode: '560001',
                country: 'India',
            },
            lastLogin: null,
            xp:        0,
            level:     1,
            badges:    [],
        });
        console.log('  ✅ Created buyer user: buyer@triu.com / Buyer@123');
    } else {
        console.log('  ⏭️  Buyer user already exists, skipping.');
    }

    // ── Products ─────────────────────────────────────────────────────────────
    const existingProducts = db.find('products');
    if (existingProducts.length === 0) {
        const products = [
            {
                name: 'Handcrafted Wooden Pen Stand',
                description: 'Beautiful handcrafted pen stand made from premium teak wood. Perfect for your desk.',
                price: 499, mrp: 699, category: 'Stationery', stock: 50,
                hsnCode: '4421', countryOfOrigin: 'India', netQuantity: '1 piece',
                images: [], thumbnail: '', sellerId, status: 'active', sales: 12,
                rating: { average: 4.5, count: 8 }, reviews: [],
            },
            {
                name: 'Organic Green Tea (100g)',
                description: 'Fresh organic green tea sourced directly from Darjeeling gardens. Rich in antioxidants.',
                price: 299, mrp: 399, category: 'Natural Products', stock: 100,
                hsnCode: '0902', countryOfOrigin: 'India', netQuantity: '100g',
                images: [], thumbnail: '', sellerId, status: 'active', sales: 45,
                rating: { average: 4.7, count: 23 }, reviews: [],
            },
            {
                name: 'Bluetooth Earbuds Pro',
                description: 'True wireless earbuds with 30hr battery life, active noise cancellation and IPX5 waterproof rating.',
                price: 1999, mrp: 2999, category: 'Electronics', stock: 30,
                hsnCode: '8518', countryOfOrigin: 'China', netQuantity: '1 pair',
                images: [], thumbnail: '', sellerId, status: 'active', sales: 78,
                rating: { average: 4.3, count: 41 }, reviews: [],
            },
            {
                name: 'Cotton Kurta (Blue, M)',
                description: 'Premium cotton kurta with traditional embroidery. Comfortable for daily wear.',
                price: 799, mrp: 1199, category: 'Fashion', stock: 25,
                hsnCode: '6211', countryOfOrigin: 'India', netQuantity: '1 piece',
                images: [], thumbnail: '', sellerId, status: 'active', sales: 34,
                rating: { average: 4.4, count: 17 }, reviews: [],
            },
            {
                name: 'Stainless Steel Water Bottle (1L)',
                description: 'Double-wall insulated bottle keeping liquids cold 24hrs or hot 12hrs. BPA free.',
                price: 599, mrp: 899, category: 'Home & Kitchen', stock: 60,
                hsnCode: '7323', countryOfOrigin: 'India', netQuantity: '1L',
                images: [], thumbnail: '', sellerId, status: 'active', sales: 92,
                rating: { average: 4.6, count: 55 }, reviews: [],
            },
            {
                name: 'Yoga Mat (6mm Anti-Slip)',
                description: 'High-density foam yoga mat with carry strap. Non-slip surface for all yoga styles.',
                price: 899, mrp: 1299, category: 'Sports & Outdoors', stock: 40,
                hsnCode: '4016', countryOfOrigin: 'India', netQuantity: '1 piece',
                images: [], thumbnail: '', sellerId, status: 'active', sales: 29,
                rating: { average: 4.5, count: 19 }, reviews: [],
            },
            {
                name: 'Kids Colouring Book Set',
                description: 'Pack of 5 colouring books with 24 crayons. Suitable for ages 3-10 years.',
                price: 349, mrp: 499, category: 'Toys & Games', stock: 80,
                hsnCode: '4903', countryOfOrigin: 'India', netQuantity: '5 books + 24 crayons',
                images: [], thumbnail: '', sellerId, status: 'active', sales: 67,
                rating: { average: 4.8, count: 32 }, reviews: [],
            },
            {
                name: 'Neem Face Wash (100ml)',
                description: 'Ayurvedic neem-based face wash for oily and acne-prone skin. Paraben-free formula.',
                price: 199, mrp: 299, category: 'Health & Beauty', stock: 149,
                hsnCode: '3305', countryOfOrigin: 'India', netQuantity: '100ml',
                images: [], thumbnail: '', sellerId, status: 'active', sales: 111,
                rating: { average: 4.2, count: 63 }, reviews: [],
            },
            {
                name: 'Ashwagandha Root Powder (250g)',
                description: 'Premium KSM-66 Ashwagandha root powder for stress relief, energy and immunity.',
                price: 499, mrp: 799, category: 'Natural Products', stock: 75,
                hsnCode: '1211', countryOfOrigin: 'India', netQuantity: '250g',
                images: [], thumbnail: '', sellerId, status: 'active', sales: 88,
                rating: { average: 4.6, count: 44 }, reviews: [],
            },
            {
                name: 'Leather Wallet (Slim Bifold)',
                description: 'Genuine leather slim bifold wallet with RFID blocking. Holds 6 cards + cash.',
                price: 699, mrp: 999, category: 'Fashion', stock: 35,
                hsnCode: '4205', countryOfOrigin: 'India', netQuantity: '1 piece',
                images: [], thumbnail: '', sellerId, status: 'active', sales: 53,
                rating: { average: 4.3, count: 28 }, reviews: [],
            },
        ];

        for (const product of products) {
            db.create('products', product);
        }
        console.log(`  ✅ Created ${products.length} products`);
    } else {
        console.log(`  ⏭️  ${existingProducts.length} products already exist, skipping.`);
    }

    console.log('\n✅ Seed complete!\n');
    console.log('  Default accounts:');
    console.log('  Admin   → admin@triu.com  / Admin@123');
    console.log('  Seller  → seller@triu.com / Seller@123');
    console.log('  Buyer   → buyer@triu.com  / Buyer@123\n');
}

seed().catch(err => {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
});
