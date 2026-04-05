const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Product name is required'],
            trim: true,
            maxlength: 120
        },
        description: {
            type: String,
            required: [true, 'Description is required'],
            maxlength: 2000
        },
        price: {
            type: Number,
            required: [true, 'Price is required'],
            min: 0
        },
        cost: {
            type: Number,
            min: 0
        },
        category: {
            type: String,
            required: [true, 'Category is required'],
            enum: [
                'Natural Products',
                'Stationery',
                'Worksheets',
                'Electronics',
                'Fashion',
                'Home & Kitchen',
                'Books',
                'Toys & Games',
                'Health & Beauty',
                'Sports & Outdoors',
                'Grocery',
                'Automotive',
                'Art & Crafts',
                'Baby Products',
                'Office Supplies',
                'Other'
            ]
        },
        subcategory: String,
        
        // Images
        images: [{
            url: String,
            alt: String
        }],
        thumbnail: String,
        
        // Inventory
        stock: {
            type: Number,
            required: [true, 'Stock is required'],
            min: 0
        },
        sku: {
            type: String,
            unique: true,
            sparse: true
        },
        
        // Ratings & Reviews
        rating: {
            average: { type: Number, default: 0, min: 0, max: 5 },
            count: { type: Number, default: 0 }
        },
        reviews: [{
            userId: mongoose.Schema.Types.ObjectId,
            rating: Number,
            comment: String,
            verified: Boolean,
            createdAt: { type: Date, default: Date.now }
        }],
        
        // Seller Info
        sellerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Seller is required']
        },
        
        // Sales tracking
        sales: {
            type: Number,
            default: 0
        },
        
        // Attributes
        attributes: {
            weight: String,
            dimensions: String,
            color: String,
            material: String,
            quantity: String
        },
        
        // SEO
        seoTitle: String,
        seoDescription: String,
        seoKeywords: [String],

        // AI / Vector Search — 1536-dim embedding (text-embedding-3-small)
        // Excluded from normal queries via select:false to keep payloads small.
        embedding: {
            type: [Number],
            select: false,
        },

        // Inventory & logistics
        leadTime: {
            type: Number,
            default: 7,  // days until supplier can deliver restock
            min: 0,
        },

        // Sustainability — kg CO₂ emitted per unit shipped (category-level estimate)
        carbonFactor: {
            type: Number,
            default: 1.0,
            min: 0,
        },

        // Legal Metrology & GST compliance
        hsnCode: {
            type: String,
            trim: true,
            maxlength: 8,
        },
        countryOfOrigin: {
            type: String,
            trim: true,
            default: 'India',
        },
        mrp: {
            type: Number,
            min: 0,
        },
        netQuantity: String,   // e.g. "500g", "1 piece"

        // Status
        status: {
            type: String,
            enum: ['active', 'inactive', 'archived'],
            default: 'active'
        },
        
        // Dates
        createdAt: {
            type: Date,
            default: Date.now
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

// Index for search
productSchema.index(
    { name: 'text', description: 'text' },
    { weights: { name: 10, description: 5 }, name: 'product_text_index' }
);
productSchema.index({ category: 1, status: 1 });
productSchema.index({ sellerId: 1, status: 1 });

module.exports = mongoose.model('Product', productSchema);
