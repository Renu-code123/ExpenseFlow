/**
 * Notification Templates
 * Issue #646: Centralized, dynamic template engine
 */

const templates = {
    budget_alert: {
        title: (data) => `Budget Alert: ${data.category}`,
        message: (data) => `You have spent ${data.percentage}% of your ${data.category} budget (${data.amount}/${data.limit}).`,
        emailSubject: (data) => `Action Required: Budget Limit Reached for ${data.category}`,
        priority: 'high'
    },
    subscription_renewal: {
        title: (data) => `Upcoming Renewal: ${data.name}`,
        message: (data) => `Your ${data.name} subscription will renew for ${data.amount} ${data.currency} on ${data.date}.`,
        emailSubject: (data) => `Reminder: ${data.name} renews soon`,
        priority: 'medium'
    },
    security_anomaly: {
        title: (data) => `Security Alert: Unusual Activity`,
        message: (data) => `We detected an unusual ${data.event} from ${data.location}. If this wasn't you, please secure your account.`,
        emailSubject: (data) => `URGENT: Unusual activity on your ExpenseFlow account`,
        priority: 'critical'
    },
    system_update: {
        title: (data) => `System Update`,
        message: (data) => `New features have been added to your dashboard: ${data.features}.`,
        emailSubject: (data) => `Check out what's new in ExpenseFlow`,
        priority: 'low'
    }
};

/**
 * Render a template with provided data
 */
function render(templateKey, data) {
    const template = templates[templateKey];
    if (!template) throw new Error(`Template ${templateKey} not found`);

    return {
        title: template.title(data),
        message: template.message(data),
        emailSubject: template.emailSubject ? template.emailSubject(data) : template.title(data),
        priority: template.priority || 'medium'
    };
}

module.exports = { render, templates };
