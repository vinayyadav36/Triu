const express = require('express');

const router = express.Router();

const botCatalog = [
    { id: 'jarvis', purpose: 'Assistant and workflow orchestration' },
    { id: 'financial-planner', purpose: 'Financial planning support' },
    { id: 'digital-marketer', purpose: 'Marketing support' },
    { id: 'forecasting', purpose: 'Trend and demand forecasting' },
    { id: 'fraud-detection', purpose: 'Risk signal analysis' },
];

router.get('/health', (_req, res) => {
    res.json({
        success: true,
        status: 'ok',
        botsAvailable: botCatalog.length,
        timestamp: new Date().toISOString(),
    });
});

router.get('/catalog', (_req, res) => {
    res.json({
        success: true,
        data: botCatalog,
    });
});

module.exports = router;
