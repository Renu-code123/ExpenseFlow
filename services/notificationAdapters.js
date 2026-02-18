const axios = require('axios');

/**
 * Notification Adapters
 * Issue #646: Provider-agnostic implementations for different channels
 */

class EmailAdapter {
    async send(recipient, content) {
        console.log(`[EmailAdapter] Sending email to ${recipient}: ${content.emailSubject}`);
        // In real app, integrate with SendGrid/AWS SES
        return { success: true, providerId: 'msg_' + Date.now() };
    }
}

class WebhookAdapter {
    async send(url, content) {
        console.log(`[WebhookAdapter] Dispatching webhook to ${url}`);
        try {
            const response = await axios.post(url, {
                event: 'notification',
                payload: content,
                timestamp: new Date().toISOString()
            }, { timeout: 5000 });
            return { success: true, statusCode: response.status };
        } catch (error) {
            console.error(`[WebhookAdapter] Webhook failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

class InAppAdapter {
    constructor(io) {
        this.io = io;
    }

    async send(userId, content) {
        console.log(`[InAppAdapter] Emitting socket event to user_${userId}`);
        if (this.io) {
            this.io.to(`user_${userId}`).emit('new_notification', content);
            return { success: true };
        }
        return { success: false, error: 'Socket.IO not initialized' };
    }
}

module.exports = {
    EmailAdapter: new EmailAdapter(),
    WebhookAdapter: new WebhookAdapter(),
    InAppAdapter: (io) => new InAppAdapter(io)
};
