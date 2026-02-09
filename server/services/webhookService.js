const Webhook = require('../models/Webhook');
const axios = require('axios');
const crypto = require('crypto');

class WebhookService {
  async createWebhook(userId, url, events, secret) {
    const webhook = new Webhook({
      user: userId,
      url,
      events,
      secret
    });
    return await webhook.save();
  }

  async triggerWebhook(userId, event, data) {
    const webhooks = await Webhook.find({ 
      user: userId, 
      events: event,
      active: true 
    });

    for (const webhook of webhooks) {
      try {
        const payload = { event, data, timestamp: new Date() };
        const signature = this.generateSignature(payload, webhook.secret);
        
        await axios.post(webhook.url, payload, {
          headers: { 'X-Webhook-Signature': signature },
          timeout: 5000
        });

        webhook.lastTriggered = new Date();
        webhook.failureCount = 0;
        await webhook.save();
      } catch (error) {
        webhook.failureCount++;
        if (webhook.failureCount >= 5) {
          webhook.active = false;
        }
        await webhook.save();
      }
    }
  }

  generateSignature(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}

module.exports = new WebhookService();