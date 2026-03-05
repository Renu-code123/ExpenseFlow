// Budget Alert Service

class BudgetAlertService {
    checkBudget(expense, budget) {
        if (expense.amount > budget.limit * 0.9) {
            return { type: 'warning', message: 'Approaching budget limit' };
        }
        return null;
    }
    
    sendNotification(userId, alert) {
        // Send notification
    }
}

module.exports = new BudgetAlertService();

