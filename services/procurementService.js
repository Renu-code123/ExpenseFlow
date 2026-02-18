const ProcurementOrder = require('../models/ProcurementOrder');
const FixedAsset = require('../models/FixedAsset');

class ProcurementService {
    /**
     * Create a new Requisition
     */
    async createRequisition(userId, data) {
        const orderCount = await ProcurementOrder.countDocuments();
        const orderNumber = `PR-${new Date().getFullYear()}-${(orderCount + 1).toString().padStart(4, '0')}`;

        const pr = new ProcurementOrder({
            ...data,
            userId,
            orderNumber,
            type: 'requisition',
            status: 'draft'
        });

        await pr.save();
        return pr;
    }

    /**
     * Submit for Approval
     */
    async submitForApproval(orderId, userId) {
        const pr = await ProcurementOrder.findOne({ _id: orderId, userId });
        if (!pr) throw new Error('Order not found');

        pr.status = 'pending_approval';
        await pr.save();
        // Here we would typically trigger notificationService
        return pr;
    }

    /**
     * Convert PR to PO (Approved)
     */
    async approveAndConvertToPO(orderId, approverId, comment) {
        const pr = await ProcurementOrder.findById(orderId);
        if (!pr) throw new Error('Order not found');

        pr.status = 'approved';
        pr.type = 'purchase_order';
        pr.orderNumber = pr.orderNumber.replace('PR-', 'PO-');

        pr.approvalFlow.push({
            approver: approverId,
            status: 'approved',
            comment,
            date: new Date()
        });

        await pr.save();
        return pr;
    }

    /**
     * Mark Items as Received and Create Fixed Assets
     */
    async receiveGoods(orderId, userId) {
        const po = await ProcurementOrder.findById(orderId);
        if (!po || po.type !== 'purchase_order') throw new Error('Valid PO not found');

        po.status = 'received';
        po.receivedDate = new Date();

        const assetsCreated = [];

        // Auto-create fixed assets for each item if they are classified as capital expenditure
        for (const item of po.items) {
            // Simple heuristic: items with unit price > 5000 are assets
            if (item.unitPrice >= 5000) {
                const asset = new FixedAsset({
                    userId,
                    name: item.name,
                    description: item.description,
                    category: this.mapCategory(item.category),
                    purchaseDate: new Date(),
                    purchasePrice: item.unitPrice,
                    usefulLifeYears: 5, // Default
                    procurementOrderId: po._id,
                    department: po.department
                });
                await asset.save();
                assetsCreated.push(asset._id);
            }
        }

        await po.save();
        return { po, assetsCreated };
    }

    mapCategory(cat) {
        const mapping = {
            'IT': 'electronics',
            'Office': 'furniture',
            'Manufacturing': 'machinery',
            'Fleet': 'vehicles'
        };
        return mapping[cat] || 'other';
    }

    async getOrders(userId, filters = {}) {
        const query = { userId };
        if (filters.status) query.status = filters.status;
        if (filters.type) query.type = filters.type;

        return await ProcurementOrder.find(query).sort({ createdAt: -1 });
    }
}

module.exports = new ProcurementService();
