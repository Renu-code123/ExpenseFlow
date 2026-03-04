/**
 * Stock Math Utility
 * Provides inventory valuation methods (FIFO, LIFO, WAC)
 */

class StockMath {
    /**
     * Calculate FIFO (First In, First Out) valuation
     * @param {Array} stockLayers - Array of {quantity, costPrice, date}
     * @param {Number} quantityToValue - Quantity to calculate value for
     */
    calculateFIFO(stockLayers, quantityToValue) {
        let remainingQty = quantityToValue;
        let totalValue = 0;
        const layersUsed = [];

        // Sort by date (oldest first)
        const sortedLayers = [...stockLayers].sort((a, b) =>
            new Date(a.date) - new Date(b.date)
        );

        for (const layer of sortedLayers) {
            if (remainingQty <= 0) break;

            const qtyFromLayer = Math.min(layer.quantity, remainingQty);
            totalValue += qtyFromLayer * layer.costPrice;
            remainingQty -= qtyFromLayer;

            layersUsed.push({
                quantity: qtyFromLayer,
                costPrice: layer.costPrice,
                date: layer.date
            });
        }

        return {
            totalValue,
            averageCost: quantityToValue > 0 ? totalValue / quantityToValue : 0,
            layersUsed,
            remainingQuantity: remainingQty
        };
    }

    /**
     * Calculate LIFO (Last In, First Out) valuation
     * @param {Array} stockLayers - Array of {quantity, costPrice, date}
     * @param {Number} quantityToValue - Quantity to calculate value for
     */
    calculateLIFO(stockLayers, quantityToValue) {
        let remainingQty = quantityToValue;
        let totalValue = 0;
        const layersUsed = [];

        // Sort by date (newest first)
        const sortedLayers = [...stockLayers].sort((a, b) =>
            new Date(b.date) - new Date(a.date)
        );

        for (const layer of sortedLayers) {
            if (remainingQty <= 0) break;

            const qtyFromLayer = Math.min(layer.quantity, remainingQty);
            totalValue += qtyFromLayer * layer.costPrice;
            remainingQty -= qtyFromLayer;

            layersUsed.push({
                quantity: qtyFromLayer,
                costPrice: layer.costPrice,
                date: layer.date
            });
        }

        return {
            totalValue,
            averageCost: quantityToValue > 0 ? totalValue / quantityToValue : 0,
            layersUsed,
            remainingQuantity: remainingQty
        };
    }

    /**
     * Calculate WAC (Weighted Average Cost)
     * @param {Array} stockLayers - Array of {quantity, costPrice}
     */
    calculateWAC(stockLayers) {
        let totalQuantity = 0;
        let totalValue = 0;

        for (const layer of stockLayers) {
            totalQuantity += layer.quantity;
            totalValue += layer.quantity * layer.costPrice;
        }

        const averageCost = totalQuantity > 0 ? totalValue / totalQuantity : 0;

        return {
            totalQuantity,
            totalValue,
            averageCost
        };
    }

    /**
     * Calculate reorder quantity using Economic Order Quantity (EOQ) formula
     * @param {Number} annualDemand - Annual demand in units
     * @param {Number} orderingCost - Cost per order
     * @param {Number} holdingCost - Annual holding cost per unit
     */
    calculateEOQ(annualDemand, orderingCost, holdingCost) {
        if (holdingCost === 0) return 0;

        const eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost);
        return Math.round(eoq);
    }

    /**
     * Calculate safety stock level
     * @param {Number} maxDailyUsage - Maximum daily usage
     * @param {Number} maxLeadTime - Maximum lead time in days
     * @param {Number} avgDailyUsage - Average daily usage
     * @param {Number} avgLeadTime - Average lead time in days
     */
    calculateSafetyStock(maxDailyUsage, maxLeadTime, avgDailyUsage, avgLeadTime) {
        const maxUsageDuringLeadTime = maxDailyUsage * maxLeadTime;
        const avgUsageDuringLeadTime = avgDailyUsage * avgLeadTime;

        return Math.round(maxUsageDuringLeadTime - avgUsageDuringLeadTime);
    }

    /**
     * Calculate reorder point
     * @param {Number} avgDailyUsage - Average daily usage
     * @param {Number} leadTime - Lead time in days
     * @param {Number} safetyStock - Safety stock level
     */
    calculateReorderPoint(avgDailyUsage, leadTime, safetyStock) {
        return Math.round((avgDailyUsage * leadTime) + safetyStock);
    }

    /**
     * Calculate inventory turnover ratio
     * @param {Number} costOfGoodsSold - COGS for the period
     * @param {Number} averageInventory - Average inventory value
     */
    calculateInventoryTurnover(costOfGoodsSold, averageInventory) {
        if (averageInventory === 0) return 0;
        return costOfGoodsSold / averageInventory;
    }

    /**
     * Calculate days inventory outstanding (DIO)
     * @param {Number} averageInventory - Average inventory value
     * @param {Number} costOfGoodsSold - COGS for the period
     * @param {Number} days - Number of days in period (default 365)
     */
    calculateDIO(averageInventory, costOfGoodsSold, days = 365) {
        if (costOfGoodsSold === 0) return 0;
        return (averageInventory / costOfGoodsSold) * days;
    }

    /**
     * Calculate stock-out probability using normal distribution
     * @param {Number} demandMean - Mean demand
     * @param {Number} demandStdDev - Standard deviation of demand
     * @param {Number} currentStock - Current stock level
     */
    calculateStockOutProbability(demandMean, demandStdDev, currentStock) {
        if (demandStdDev === 0) return currentStock < demandMean ? 1 : 0;

        // Z-score calculation
        const zScore = (currentStock - demandMean) / demandStdDev;

        // Approximate cumulative distribution function
        const probability = this.normalCDF(zScore);

        return 1 - probability; // Probability of stock-out
    }

    /**
     * Normal cumulative distribution function approximation
     */
    normalCDF(x) {
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989423 * Math.exp(-x * x / 2);
        const probability = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

        return x > 0 ? 1 - probability : probability;
    }

    /**
     * Calculate ABC classification based on value
     * @param {Array} items - Array of {sku, quantity, costPrice}
     */
    calculateABCClassification(items) {
        // Calculate total value for each item
        const itemsWithValue = items.map(item => ({
            ...item,
            totalValue: item.quantity * item.costPrice
        }));

        // Sort by value (descending)
        itemsWithValue.sort((a, b) => b.totalValue - a.totalValue);

        // Calculate cumulative value
        const totalValue = itemsWithValue.reduce((sum, item) => sum + item.totalValue, 0);
        let cumulativeValue = 0;

        // Classify items
        const classified = itemsWithValue.map(item => {
            cumulativeValue += item.totalValue;
            const cumulativePercentage = (cumulativeValue / totalValue) * 100;

            let classification;
            if (cumulativePercentage <= 70) {
                classification = 'A'; // High value items (70% of value)
            } else if (cumulativePercentage <= 90) {
                classification = 'B'; // Medium value items (20% of value)
            } else {
                classification = 'C'; // Low value items (10% of value)
            }

            return {
                ...item,
                classification,
                cumulativePercentage
            };
        });

        return classified;
    }

    /**
     * Calculate optimal order quantity considering quantity discounts
     * @param {Number} annualDemand
     * @param {Number} orderingCost
     * @param {Number} holdingCostRate - As percentage of unit cost
     * @param {Array} priceBreaks - Array of {quantity, price}
     */
    calculateOptimalOrderWithDiscounts(annualDemand, orderingCost, holdingCostRate, priceBreaks) {
        const results = [];

        for (const priceBreak of priceBreaks) {
            const holdingCost = priceBreak.price * holdingCostRate;
            const eoq = this.calculateEOQ(annualDemand, orderingCost, holdingCost);

            // Adjust EOQ to minimum quantity for this price break
            const orderQty = Math.max(eoq, priceBreak.quantity);

            // Calculate total annual cost
            const purchaseCost = annualDemand * priceBreak.price;
            const orderingCostTotal = (annualDemand / orderQty) * orderingCost;
            const holdingCostTotal = (orderQty / 2) * holdingCost;
            const totalCost = purchaseCost + orderingCostTotal + holdingCostTotal;

            results.push({
                priceBreak: priceBreak.quantity,
                unitPrice: priceBreak.price,
                orderQuantity: orderQty,
                totalAnnualCost: totalCost,
                purchaseCost,
                orderingCost: orderingCostTotal,
                holdingCost: holdingCostTotal
            });
        }

        // Find optimal (minimum cost)
        results.sort((a, b) => a.totalAnnualCost - b.totalAnnualCost);

        return {
            optimal: results[0],
            allOptions: results
        };
    }
}

module.exports = new StockMath();
