const StockItem = require('../models/StockItem');
const Warehouse = require('../models/Warehouse');
const BackOrder = require('../models/BackOrder');
const stockMath = require('../utils/stockMath');

class InventoryService {
    /**
     * Get comprehensive inventory dashboard
     */
    async getInventoryDashboard(userId) {
        const warehouses = await Warehouse.find({ userId, isActive: true });
        const stockItems = await StockItem.find({ userId, isActive: true });
        const backOrders = await BackOrder.find({ userId, status: { $in: ['pending', 'partially_fulfilled'] } });

        // Calculate total inventory value
        const totalInventoryValue = stockItems.reduce((sum, item) => sum + item.valuation.totalValue, 0);

        // Count items by status
        const stockStatusCounts = {
            in_stock: stockItems.filter(i => i.stockStatus === 'in_stock').length,
            low_stock: stockItems.filter(i => i.stockStatus === 'low_stock').length,
            out_of_stock: stockItems.filter(i => i.stockStatus === 'out_of_stock').length
        };

        // Get items needing reorder
        const itemsNeedingReorder = stockItems.filter(i =>
            i.quantity.current <= i.reorderPoint && i.stockStatus !== 'discontinued'
        );

        // Calculate warehouse utilization
        const warehouseUtilization = warehouses.map(wh => ({
            warehouseCode: wh.warehouseCode,
            warehouseName: wh.warehouseName,
            utilizationPercentage: wh.capacity.totalSpace > 0
                ? (wh.capacity.usedSpace / wh.capacity.totalSpace) * 100
                : 0,
            itemCount: stockItems.filter(i => i.warehouseId.equals(wh._id)).length
        }));

        return {
            summary: {
                totalWarehouses: warehouses.length,
                totalStockItems: stockItems.length,
                totalInventoryValue,
                totalBackOrders: backOrders.length,
                stockStatusCounts,
                itemsNeedingReorder: itemsNeedingReorder.length
            },
            warehouses: warehouseUtilization,
            reorderAlerts: itemsNeedingReorder.map(item => ({
                sku: item.sku,
                itemName: item.itemName,
                currentStock: item.quantity.current,
                reorderPoint: item.reorderPoint,
                suggestedOrderQty: this.calculateSuggestedOrderQuantity(item)
            })),
            backOrdersSummary: this.summarizeBackOrders(backOrders)
        };
    }

    /**
     * Add stock to inventory
     */
    async addStock(userId, stockData) {
        const { sku, warehouseId, quantity, costPrice, batchNumber, expiryDate, reference } = stockData;

        let stockItem = await StockItem.findOne({ userId, sku, warehouseId });

        if (!stockItem) {
            // Create new stock item
            stockItem = new StockItem({
                userId,
                ...stockData,
                quantity: {
                    current: quantity,
                    reserved: 0,
                    available: quantity,
                    unit: stockData.unit || 'units'
                },
                pricing: {
                    costPrice,
                    sellingPrice: stockData.sellingPrice || costPrice * 1.2,
                    currency: stockData.currency || 'INR'
                }
            });
        } else {
            // Update existing stock
            stockItem.quantity.current += quantity;
            stockItem.pricing.costPrice = costPrice; // Update to latest cost
        }

        // Add movement record
        stockItem.movements.push({
            movementType: 'in',
            quantity,
            toWarehouse: warehouseId,
            reference,
            referenceType: 'purchase_order',
            movementDate: new Date(),
            performedBy: userId
        });

        stockItem.lastRestocked = new Date();
        await stockItem.save();

        // Check if this fulfills any back orders
        await this.fulfillBackOrders(stockItem);

        return stockItem;
    }

    /**
     * Remove stock from inventory
     */
    async removeStock(userId, sku, warehouseId, quantity, reference, notes) {
        const stockItem = await StockItem.findOne({ userId, sku, warehouseId });

        if (!stockItem) {
            throw new Error('Stock item not found');
        }

        if (stockItem.quantity.available < quantity) {
            // Create back order for insufficient stock
            await this.createBackOrder(userId, stockItem, quantity - stockItem.quantity.available);
            throw new Error(`Insufficient stock. Available: ${stockItem.quantity.available}, Requested: ${quantity}`);
        }

        stockItem.quantity.current -= quantity;

        // Add movement record
        stockItem.movements.push({
            movementType: 'out',
            quantity,
            fromWarehouse: warehouseId,
            reference,
            referenceType: 'sales_order',
            movementDate: new Date(),
            performedBy: userId,
            notes
        });

        await stockItem.save();
        return stockItem;
    }

    /**
     * Transfer stock between warehouses
     */
    async transferStock(userId, sku, fromWarehouseId, toWarehouseId, quantity, notes) {
        // Remove from source warehouse
        const sourceItem = await StockItem.findOne({ userId, sku, warehouseId: fromWarehouseId });

        if (!sourceItem) {
            throw new Error('Source stock item not found');
        }

        if (sourceItem.quantity.available < quantity) {
            throw new Error('Insufficient stock for transfer');
        }

        sourceItem.quantity.current -= quantity;
        sourceItem.movements.push({
            movementType: 'transfer',
            quantity,
            fromWarehouse: fromWarehouseId,
            toWarehouse: toWarehouseId,
            movementDate: new Date(),
            performedBy: userId,
            notes
        });
        await sourceItem.save();

        // Add to destination warehouse
        let destItem = await StockItem.findOne({ userId, sku, warehouseId: toWarehouseId });

        if (!destItem) {
            // Create new stock item at destination
            destItem = new StockItem({
                userId,
                sku: sourceItem.sku,
                itemName: sourceItem.itemName,
                description: sourceItem.description,
                category: sourceItem.category,
                warehouseId: toWarehouseId,
                quantity: {
                    current: quantity,
                    reserved: 0,
                    available: quantity,
                    unit: sourceItem.quantity.unit
                },
                pricing: sourceItem.pricing,
                reorderPoint: sourceItem.reorderPoint,
                safetyStock: sourceItem.safetyStock
            });
        } else {
            destItem.quantity.current += quantity;
        }

        destItem.movements.push({
            movementType: 'transfer',
            quantity,
            fromWarehouse: fromWarehouseId,
            toWarehouse: toWarehouseId,
            movementDate: new Date(),
            performedBy: userId,
            notes
        });
        await destItem.save();

        return { source: sourceItem, destination: destItem };
    }

    /**
     * Adjust stock (for corrections, damages, etc.)
     */
    async adjustStock(userId, sku, warehouseId, adjustmentQuantity, reason, notes) {
        const stockItem = await StockItem.findOne({ userId, sku, warehouseId });

        if (!stockItem) {
            throw new Error('Stock item not found');
        }

        stockItem.quantity.current += adjustmentQuantity; // Can be negative

        stockItem.movements.push({
            movementType: 'adjustment',
            quantity: Math.abs(adjustmentQuantity),
            toWarehouse: adjustmentQuantity > 0 ? warehouseId : null,
            fromWarehouse: adjustmentQuantity < 0 ? warehouseId : null,
            reference: reason,
            movementDate: new Date(),
            performedBy: userId,
            notes
        });

        await stockItem.save();
        return stockItem;
    }

    /**
     * Reserve stock for orders
     */
    async reserveStock(userId, sku, warehouseId, quantity, reference) {
        const stockItem = await StockItem.findOne({ userId, sku, warehouseId });

        if (!stockItem) {
            throw new Error('Stock item not found');
        }

        if (stockItem.quantity.available < quantity) {
            throw new Error('Insufficient available stock for reservation');
        }

        stockItem.quantity.reserved += quantity;
        await stockItem.save();

        return stockItem;
    }

    /**
     * Release reserved stock
     */
    async releaseReservedStock(userId, sku, warehouseId, quantity) {
        const stockItem = await StockItem.findOne({ userId, sku, warehouseId });

        if (!stockItem) {
            throw new Error('Stock item not found');
        }

        stockItem.quantity.reserved = Math.max(0, stockItem.quantity.reserved - quantity);
        await stockItem.save();

        return stockItem;
    }

    /**
     * Create back order
     */
    async createBackOrder(userId, stockItem, quantity) {
        const backOrderId = `BO-${Date.now()}-${stockItem.sku}`;

        const backOrder = new BackOrder({
            userId,
            backOrderId,
            stockItemId: stockItem._id,
            sku: stockItem.sku,
            itemName: stockItem.itemName,
            requestedQuantity: quantity,
            pendingQuantity: quantity,
            warehouseId: stockItem.warehouseId,
            requestedBy: userId,
            priority: quantity > 100 ? 'high' : 'medium'
        });

        await backOrder.save();
        return backOrder;
    }

    /**
     * Fulfill back orders when stock is added
     */
    async fulfillBackOrders(stockItem) {
        const backOrders = await BackOrder.find({
            stockItemId: stockItem._id,
            status: { $in: ['pending', 'partially_fulfilled'] }
        }).sort({ priority: -1, requestDate: 1 });

        let availableStock = stockItem.quantity.available;

        for (const backOrder of backOrders) {
            if (availableStock <= 0) break;

            const fulfillQty = Math.min(backOrder.pendingQuantity, availableStock);

            backOrder.fulfilledQuantity += fulfillQty;
            backOrder.fulfillmentHistory.push({
                quantity: fulfillQty,
                fulfilledDate: new Date(),
                batchNumber: stockItem.batchNumber
            });

            await backOrder.save();
            availableStock -= fulfillQty;
        }
    }

    /**
     * Calculate suggested order quantity
     */
    calculateSuggestedOrderQuantity(stockItem) {
        const shortfall = stockItem.reorderPoint - stockItem.quantity.current;
        const safetyBuffer = stockItem.safetyStock;

        return Math.max(shortfall + safetyBuffer, stockItem.safetyStock * 2);
    }

    /**
     * Summarize back orders
     */
    summarizeBackOrders(backOrders) {
        return {
            total: backOrders.length,
            byPriority: {
                urgent: backOrders.filter(bo => bo.priority === 'urgent').length,
                high: backOrders.filter(bo => bo.priority === 'high').length,
                medium: backOrders.filter(bo => bo.priority === 'medium').length,
                low: backOrders.filter(bo => bo.priority === 'low').length
            },
            totalPendingQuantity: backOrders.reduce((sum, bo) => sum + bo.pendingQuantity, 0)
        };
    }

    /**
     * Get stock valuation report
     */
    async getStockValuationReport(userId, method = 'FIFO') {
        const stockItems = await StockItem.find({ userId, isActive: true });

        const valuationReport = stockItems.map(item => {
            let valuation;

            // For simplicity, using current cost price
            // In real implementation, track stock layers for accurate FIFO/LIFO
            valuation = {
                totalValue: item.quantity.current * item.pricing.costPrice,
                averageCost: item.pricing.costPrice
            };

            return {
                sku: item.sku,
                itemName: item.itemName,
                quantity: item.quantity.current,
                costPrice: item.pricing.costPrice,
                ...valuation,
                warehouse: item.warehouseId
            };
        });

        const totalValue = valuationReport.reduce((sum, item) => sum + item.totalValue, 0);

        return {
            method,
            totalValue,
            itemCount: valuationReport.length,
            items: valuationReport
        };
    }

    /**
     * Get ABC classification of inventory
     */
    async getABCClassification(userId) {
        const stockItems = await StockItem.find({ userId, isActive: true });

        const itemsForClassification = stockItems.map(item => ({
            sku: item.sku,
            itemName: item.itemName,
            quantity: item.quantity.current,
            costPrice: item.pricing.costPrice
        }));

        const classified = stockMath.calculateABCClassification(itemsForClassification);

        return {
            classA: classified.filter(i => i.classification === 'A'),
            classB: classified.filter(i => i.classification === 'B'),
            classC: classified.filter(i => i.classification === 'C'),
            summary: {
                totalItems: classified.length,
                classACount: classified.filter(i => i.classification === 'A').length,
                classBCount: classified.filter(i => i.classification === 'B').length,
                classCCount: classified.filter(i => i.classification === 'C').length
            }
        };
    }
}

module.exports = new InventoryService();
