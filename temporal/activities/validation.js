// validation.js
// Activity for expense validation
exports.validateExpense = async function(expenseId, amount) {
  if (amount <= 0) throw new Error('Invalid expense amount');
  // Simulate validation logic
  return true;
};
