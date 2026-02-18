const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const inventoryService = require('../services/inventoryService');
const replenishmentService = require('../services/replenishmentService');
const Warehouse = require('../models/Warehouse');
const StockItem = require('../models/StockItem');
const BackOrder = require('../models/BackOrder');

/**
 * Get Inventory Dashboard
 */
router.get('/dashboard', auth, async (req, res) => {
    try {
        const dashboard = await inventoryService.getInventoryDashboard(req.user._id);
        res.json({ success: true, data: dashboard });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== WAREHOUSE ROUTES ====================

/**
 * Create Warehouse
 */
router.post('/warehouses', auth, async (req, res) => {
    try {
        const warehouse = new Warehouse({
            ...req.body,
            userId: req.user._id
        });
        await warehouse.save();
        res.json({ success: true, data: warehouse });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Get All Warehouses
 */
router.get('/warehouses', auth, async (req, res) => {
    try {
        const warehouses = await Warehouse.find({ userId: req.user._id });
        res.json({ success: true, data: warehouses });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Update Warehouse
 */
router.patch('/warehouses/:id', auth, async (req, res) => {
    try {
        const warehouse = await Warehouse.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            req.body,
            { new: true, runValidators: true }
        );

        if (!warehouse) {
            return res.status(404).json({ success: false, error: 'Warehouse not found' });
        }

        res.json({ success: true, data: warehouse });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ==================== STOCK ITEM ROUTES ====================

/**
 * Add Stock
 */
router.post('/stock/add', auth, async (req, res) => {
    try {
        const stockItem = await inventoryService.addStock(req.user._id, req.body);
        res.json({ success: true, data: stockItem });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Remove Stock
 */
router.post('/stock/remove', auth, async (req, res) => {
    try {
        const { sku, warehouseId, quantity, reference, notes } = req.body;
        const stockItem = await inventoryService.removeStock(
            req.user._id,
            sku,
            warehouseId,
            quantity,
            reference,
            notes
        );
        res.json({ success: true, data: stockItem });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Transfer Stock Between Warehouses
 */
router.post('/stock/transfer', auth, async (req, res) => {
    try {
        const { sku, fromWarehouseId, toWarehouseId, quantity, notes } = req.body;
        const result = await inventoryService.transferStock(
            req.user._id,
            sku,
            fromWarehouseId,
            toWarehouseId,
            quantity,
            notes
        );
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Adjust Stock
 */
router.post('/stock/adjust', auth, async (req, res) => {
    try {
        const { sku, warehouseId, adjustmentQuantity, reason, notes } = req.body;
        const stockItem = await inventoryService.adjustStock(
            req.user._id,
            sku,
            warehouseId,
            adjustmentQuantity,
            reason,
            notes
        );
        res.json({ success: true, data: stockItem });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Reserve Stock
 */
router.post('/stock/reserve', auth, async (req, res) => {
    try {
        const { sku, warehouseId, quantity, reference } = req.body;
        const stockItem = await inventoryService.reserveStock(
            req.user._id,
            sku,
            warehouseId,
            quantity,
            reference
        );
        res.json({ success: true, data: stockItem });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Release Reserved Stock
 */
router.post('/stock/release', auth, async (req, res) => {
    try {
        const { sku, warehouseId, quantity } = req.body;
        const stockItem = await inventoryService.releaseReservedStock(
            req.user._id,
            sku,
            warehouseId,
            quantity
        );
        res.json({ success: true, data: stockItem });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Get All Stock Items
 */
router.get('/stock', auth, async (req, res) => {
    try {
        const { warehouseId, category, status } = req.query;
        const query = { userId: req.user._id, isActive: true };

        if (warehouseId) query.warehouseId = warehouseId;
        if (category) query.category = category;
        if (status) query.stockStatus = status;

        const stockItems = await StockItem.find(query).populate('warehouseId');
        res.json({ success: true, data: stockItems });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Stock Item by SKU
 */
router.get('/stock/:sku', auth, async (req, res) => {
    try {
        const stockItem = await StockItem.findOne({
            userId: req.user._id,
            sku: req.params.sku
        }).populate('warehouseId');

        if (!stockItem) {
            return res.status(404).json({ success: false, error: 'Stock item not found' });
        }

        res.json({ success: true, data: stockItem });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Update Stock Item
 */
router.patch('/stock/:sku', auth, async (req, res) => {
    try {
        const stockItem = await StockItem.findOneAndUpdate(
            { userId: req.user._id, sku: req.params.sku },
            req.body,
            { new: true, runValidators: true }
        );

        if (!stockItem) {
            return res.status(404).json({ success: false, error: 'Stock item not found' });
        }

        res.json({ success: true, data: stockItem });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ==================== BACK ORDER ROUTES ====================

/**
 * Get All Back Orders
 */
router.get('/backorders', auth, async (req, res) => {
    try {
        const { status, priority } = req.query;
        const query = { userId: req.user._id };

        if (status) query.status = status;
        if (priority) query.priority = priority;

        const backOrders = await BackOrder.find(query)
            .populate('stockItemId')
            .populate('warehouseId')
            .sort({ priority: -1, requestDate: 1 });

        res.json({ success: true, data: backOrders });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Update Back Order
 */
router.patch('/backorders/:id', auth, async (req, res) => {
    try {
        const backOrder = await BackOrder.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            req.body,
            { new: true, runValidators: true }
        );

        if (!backOrder) {
            return res.status(404).json({ success: false, error: 'Back order not found' });
        }

        res.json({ success: true, data: backOrder });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ==================== REPLENISHMENT ROUTES ====================

/**
 * Get Replenishment Recommendations
 */
router.get('/replenishment/recommendations', auth, async (req, res) => {
    try {
        const recommendations = await replenishmentService.scanAndRecommend(req.user._id);
        res.json({ success: true, data: recommendations });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Auto-Generate Procurement Requests
 */
router.post('/replenishment/auto-generate', auth, async (req, res) => {
    try {
        const result = await replenishmentService.autoGenerateProcurementRequests(req.user._id);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Replenishment Analytics
 */
router.get('/replenishment/analytics', auth, async (req, res) => {
    try {
        const analytics = await replenishmentService.getReplenishmentAnalytics(req.user._id);
        res.json({ success: true, data: analytics });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Calculate Optimal Parameters for Item
 */
router.get('/replenishment/optimize/:sku', auth, async (req, res) => {
    try {
        const stockItem = await StockItem.findOne({
            userId: req.user._id,
            sku: req.params.sku
        });

        if (!stockItem) {
            return res.status(404).json({ success: false, error: 'Stock item not found' });
        }

        const optimization = await replenishmentService.calculateOptimalParameters(stockItem);
        res.json({ success: true, data: optimization });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== REPORTING ROUTES ====================

/**
 * Get Stock Valuation Report
 */
router.get('/reports/valuation', auth, async (req, res) => {
    try {
        const method = req.query.method || 'FIFO';
        const report = await inventoryService.getStockValuationReport(req.user._id, method);
        res.json({ success: true, data: report });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get ABC Classification
 */
router.get('/reports/abc-classification', auth, async (req, res) => {
    try {
        const classification = await inventoryService.getABCClassification(req.user._id);
        res.json({ success: true, data: classification });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
