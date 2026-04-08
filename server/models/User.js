const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            minlength: 2,
            maxlength: 50
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email']
        },
        phone: {
            type: String,
            required: [true, 'Phone is required'],
            match: [/^[0-9+\-\s]{7,15}$/, 'Invalid phone number']
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: 6,
            select: false // Don't return password by default
        },
        // Hashed private key for OTP + key-based auth (separate from password)
        safeKeyHash: {
            type: String,
            select: false
        },
        profilePicture: {
            type: String,
            default: null
        },
        role: {
            type: String,
            enum: ['customer', 'seller', 'admin'],
            default: 'customer'
        },
        address: {
            street: String,
            city: String,
            state: String,
            postalCode: String,
            country: { type: String, default: 'India' },
            isDefault: Boolean
        },
        seller: {
            businessName: String,
            businessType: String,
            gstNumber: String,
            panNumber: String,
            shopImage: String,
            description: String,
            verified: { type: Boolean, default: false },
            status: {
                type: String,
                enum: ['pending', 'approved', 'rejected', 'suspended'],
                default: 'pending'
            },
            rejectionReason: { type: String, default: '' },
            rating: { type: Number, default: 0 },
            totalOrders: { type: Number, default: 0 },
            responseTime: { type: String, default: '24 hours' }
        },
        orders: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order'
        }],
        wishlist: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product'
        }],
        notifications: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            push: { type: Boolean, default: true }
        },
        status: {
            type: String,
            enum: ['active', 'inactive', 'suspended'],
            default: 'active'
        },
        lastLogin: Date,
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

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare passwords
userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Method to get user info without sensitive data
userSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.safeKeyHash;
    return obj;
};

module.exports = mongoose.model('User', userSchema);
