// ============================================
// EMPROIUMVIPANI - BACKEND SERVER (Express.js)
// ============================================

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { auditLogger } = require('./utils/auditLogger');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// ============================================
// 1. MIDDLEWARE
// ============================================

// CORS
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests, please try again later'
});
app.use('/api/', limiter);

// DPDP-compliant audit logging for all API routes
app.use(auditLogger);

// ============================================
// 2. DATABASE CONNECTION
// ============================================

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/emproiumvipani');
        console.log('✅ MongoDB connected successfully');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        process.exit(1);
    }
};

// ============================================
// 3. ROUTES
// ============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date(),
        uptime: process.uptime() 
    });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/sellers', require('./routes/sellers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/search', require('./routes/search'));

// Dynamic sitemap (served at root path, outside /api prefix)
app.use('/sitemap.xml', require('./routes/sitemap'));

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'Route not found',
        path: req.path 
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ============================================
// 4. START SERVER
// ============================================

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    // Connect to database
    await connectDB();
    
    // Start listening
    const server = app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════╗
║  🚀 EmproiumVipani Backend Server      ║
║  ✅ Running on port ${PORT}              ║
║  📊 Environment: ${process.env.NODE_ENV}          ║
╚════════════════════════════════════════╝
        `);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('⚠️ SIGTERM received, shutting down gracefully');
        server.close(() => {
            console.log('✅ Server closed');
            mongoose.connection.close();
            process.exit(0);
        });
    });
};

startServer().catch(err => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
});

module.exports = app;
