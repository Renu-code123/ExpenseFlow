const Project = require('../models/Project');
const ProjectInvoice = require('../models/ProjectInvoice');
const Transaction = require('../models/Transaction');

class InvoiceSyncService {
    /**
     * Compile unbilled project expenses into a draft invoice
     */
    async generateConsolidatedInvoice(projectId, userId) {
        const project = await Project.findById(projectId);
        if (!project) throw new Error('Project not found');

        const unbilledExpenses = await Transaction.find({
            projectId,
            'billing.isBillable': true,
            'billing.isBilled': false,
            type: 'expense'
        });

        if (unbilledExpenses.length === 0) {
            throw new Error('No unbilled expenses found for this project');
        }

        const lineItems = unbilledExpenses.map(e => {
            const markupRate = e.billing.markupOverride || project.markupPercentage;
            const markupAmount = e.amount * (markupRate / 100);
            return {
                description: e.description,
                expenseId: e._id,
                originalAmount: e.amount,
                markupAmount: markupAmount,
                totalAmount: e.amount + markupAmount
            };
        });

        const subtotal = lineItems.reduce((sum, item) => sum + item.totalAmount, 0);
        const taxRate = 18; // Mock tax rate 18%
        const taxAmount = subtotal * (taxRate / 100);
        const totalAmount = subtotal + taxAmount;

        const invoiceId = `INV-${project.name.substring(0, 3).toUpperCase()}-${Date.now()}`;

        const invoice = new ProjectInvoice({
            projectId,
            userId,
            invoiceNumber: invoiceId,
            lineItems,
            subtotal,
            taxAmount,
            totalAmount,
            status: 'draft',
            dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 days from now
        });

        await invoice.save();

        // Mark transactions as billed
        await Transaction.updateMany(
            { _id: { $in: unbilledExpenses.map(e => e._id) } },
            {
                $set: {
                    'billing.isBilled': true,
                    'billing.billedAt': new Date(),
                    'billing.invoiceId': invoice._id
                }
            }
        );

        return invoice;
    }
}

module.exports = new InvoiceSyncService();
