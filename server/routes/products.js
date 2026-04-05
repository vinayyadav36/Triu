const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const { verifyToken } = require('../middleware/auth');
const { getVector } = require('../utils/embeddings');

// Escape special regex characters to prevent ReDoS from user input
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Category carbon factors (kg CO₂ per unit, shipping estimate) ────────────
const CARBON_FACTORS = {
    'Electronics':     5.2,
    'Fashion':         3.5,
    'Natural Products':0.8,
    'Stationery':      0.5,
    'Books':           0.3,
    'Worksheets':      0.2,
    'Home & Kitchen':  2.1,
    'Toys & Games':    1.8,
    'Health & Beauty': 1.2,
    'Sports & Outdoors':2.0,
    'Grocery':         0.6,
    'Automotive':      4.5,
    'Art & Crafts':    0.9,
    'Baby Products':   1.5,
    'Office Supplies': 0.7,
    'Other':           1.0,
};

// ============================================
// GET /api/products
// ============================================
router.get('/', async (req, res) => {
    try {
        const { category, search, sortBy, limit = 12, page = 1, boostCategory } = req.query;
        const parsedPage  = Math.max(1, parseInt(page, 10)  || 1);
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 12));

        let query = { status: 'active' };

        // Category filter
        if (category && category !== 'all') {
            query.category = category;
        }

        // Search — use MongoDB $text index to avoid $regex injection vectors.
        // A text index on { name: 'text', description: 'text' } must exist on
        // the products collection (create in MongoDB Atlas or via migration).
        if (search) {
            const searchStr = String(search).slice(0, 200).trim();
            if (searchStr) {
                query.$text = { $search: searchStr };
            }
        }

        // Sorting
        let sortOptions = { sales: -1 }; // Default: by sales (relevance)
        if (sortBy === 'price-low') sortOptions = { price: 1 };
        if (sortBy === 'price-high') sortOptions = { price: -1 };
        if (sortBy === 'rating') sortOptions = { 'rating.average': -1 };
        if (sortBy === 'newest') sortOptions = { createdAt: -1 };

        // Pagination
        const skip = (parsedPage - 1) * parsedLimit;

        // Execute query — fetch extra when boosting so we can reorder in-memory
        const fetchLimit = boostCategory ? Math.min(parsedLimit * 3, 100) : parsedLimit;

        let products = await Product.find(query)
            .sort(sortOptions)
            .limit(fetchLimit)
            .skip(skip)
            .populate('sellerId', 'seller name');

        // Hyper-personalised boost: float the preferred category to the top
        if (boostCategory && products.length) {
            const boosted   = products.filter(p => p.category === boostCategory);
            const rest      = products.filter(p => p.category !== boostCategory);
            products = [...boosted, ...rest].slice(0, parsedLimit);
        }

        const total = await Product.countDocuments(query);

        res.json({
            success: true,
            data: products,
            pagination: {
                total,
                page: parsedPage,
                limit: parsedLimit,
                pages: Math.ceil(total / parsedLimit)
            }
        });
    } catch (error) {
        console.error('❌ Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
});

// ============================================
// GET /api/products/:id
// ============================================
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('sellerId', 'name seller')
            .populate('reviews.userId', 'name');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            data: product
        });
    } catch (error) {
        console.error('❌ Get product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product'
        });
    }
});

// ============================================
// POST /api/products (Seller only)
// ============================================
router.post('/', verifyToken, async (req, res) => {
    try {
        const { name, description, price, category, stock, images } = req.body;
        const userId = req.user.id;

        // Verify seller
        const user = await User.findById(userId);
        if (!user || user.role !== 'seller' || !user.seller?.verified) {
            return res.status(403).json({
                success: false,
                message: 'Only verified sellers can add products'
            });
        }

        // Validation
        if (!name || !description || !price || !category || stock === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Create product
        const product = await Product.create({
            name,
            description,
            price,
            category,
            stock,
            images: images || [],
            sellerId: userId,
            hsnCode:         req.body.hsnCode         || '',
            countryOfOrigin: req.body.countryOfOrigin || 'India',
            mrp:             req.body.mrp             || price,
            netQuantity:     req.body.netQuantity      || '',
            leadTime:        req.body.leadTime         || 7,
            carbonFactor:    CARBON_FACTORS[category]  || 1.0,
        });

        // Generate and persist vector embedding (non-blocking)
        getVector(`${name} ${description}`).then(vec => {
            if (vec) Product.updateOne({ _id: product._id }, { embedding: vec }).catch(() => {});
        }).catch(() => {});

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product
        });
    } catch (error) {
        console.error('❌ Create product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create product'
        });
    }
});

// ============================================
// PUT /api/products/:id (Seller only)
// ============================================
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if user is the seller
        if (product.sellerId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to update this product'
            });
        }

        // Update allowed fields
        const allowedUpdates = ['name', 'description', 'price', 'category', 'stock', 'images', 'status',
                                'hsnCode', 'countryOfOrigin', 'mrp', 'netQuantity', 'leadTime'];
        const textChanged = (req.body.name !== undefined && req.body.name !== product.name) ||
                            (req.body.description !== undefined && req.body.description !== product.description);

        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                product[field] = req.body[field];
            }
        });

        if (req.body.category) {
            product.carbonFactor = CARBON_FACTORS[req.body.category] || 1.0;
        }

        await product.save();

        // Re-generate embedding when searchable text changes (non-blocking)
        if (textChanged) {
            getVector(`${product.name} ${product.description}`).then(vec => {
                if (vec) Product.updateOne({ _id: product._id }, { embedding: vec }).catch(() => {});
            }).catch(() => {});
        }

        res.json({
            success: true,
            message: 'Product updated successfully',
            data: product
        });
    } catch (error) {
        console.error('❌ Update product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update product'
        });
    }
});

// ============================================
// DELETE /api/products/:id (Seller only)
// ============================================
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if user is the seller
        if (product.sellerId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to delete this product'
            });
        }

        await Product.deleteOne({ _id: req.params.id });

        res.json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('❌ Delete product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete product'
        });
    }
});

// ============================================
// POST /api/products/:id/reviews  –  Add Review
// ============================================
router.post('/:id/reviews', verifyToken, async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const userId = req.user.id;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Check if user already reviewed this product
        const existingReview = product.reviews.find(r => String(r.userId) === String(userId));
        if (existingReview) {
            return res.status(400).json({ success: false, message: 'You have already reviewed this product' });
        }

        // Check if user has ordered this product (verified purchase)
        const purchasedOrder = await Order.findOne({
            userId,
            'items.productId': product._id,
            status: 'delivered'
        });

        product.reviews.push({
            userId,
            rating,
            comment: comment || '',
            verified: !!purchasedOrder
        });

        // Recalculate average rating
        const total = product.reviews.reduce((sum, r) => sum + r.rating, 0);
        product.rating.average = Math.round((total / product.reviews.length) * 10) / 10;
        product.rating.count = product.reviews.length;

        await product.save();

        res.status(201).json({
            success: true,
            message: 'Review added successfully',
            data: { rating: product.rating, reviews: product.reviews }
        });
    } catch (error) {
        console.error('❌ Add review error:', error);
        res.status(500).json({ success: false, message: 'Failed to add review' });
    }
});

module.exports = router;

