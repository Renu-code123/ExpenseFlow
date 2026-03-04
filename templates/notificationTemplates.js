/**
 * Omnichannel Notification Template Library
 * Issue #721: Heavily expanded content library with multi-channel support.
 */

const notificationLibrary = [
    {
        slug: 'budget-threshold-reached',
        name: 'Budget Category Alert',
        category: 'transaction',
        channels: {
            email: {
                subject: 'Action Required: Budget Threshold Reached for {{category}}',
                body: '<h1>Budget Alert</h1><p>Hello,</p><p>You have consumed <strong>{{percentage}}%</strong> of your budget for <strong>{{category}}</strong>.</p><p>Current Spend: {{amount}} {{currency}}<br>Monthly Limit: {{limit}} {{currency}}</p>',
                enabled: true
            },
            push: {
                title: 'Budget Alert: {{category}}',
                body: 'You reached {{percentage}}% of your {{category}} budget.',
                enabled: true
            },
            inApp: {
                title: 'Budget Alert',
                body: 'Consumed {{amount}}/{{limit}} for {{category}}.'
            }
        },
        variableDefinitions: [
            { name: 'category', description: 'Budget category name' },
            { name: 'percentage', description: 'Percentage consumed' },
            { name: 'amount', description: 'Current spent amount' },
            { name: 'limit', description: 'Budget limit' },
            { name: 'currency', description: 'Currency code' }
        ]
    },
    {
        slug: 'suspicious-login-detected',
        name: 'Security: Suspicious Login',
        category: 'security',
        channels: {
            email: {
                subject: 'URGENT: Suspicious Login Detected',
                body: '<h2>New Device Login</h2><p>We detected a login from an unrecognized device:</p><ul><li><strong>IP:</strong> {{ip}}</li><li><strong>Device:</strong> {{device}}</li><li><strong>Location:</strong> {{location}}</li></ul><p>If this was not you, please reset your password immediately.</p>',
                enabled: true
            },
            push: {
                title: 'Security Alert',
                body: 'Unrecognized login from {{location}}. Action required.',
                enabled: true
            }
        },
        variableDefinitions: [
            { name: 'ip', description: 'IP address of login' },
            { name: 'device', description: 'Device description' },
            { name: 'location', description: 'Geographic location' }
        ]
    },
    {
        slug: 'subscription-renewal-reminder',
        name: 'Recurring: Subscription Renewal',
        category: 'transaction',
        channels: {
            email: {
                subject: 'Upcoming Renewal: {{merchant}}',
                body: '<h3>Payment Reminder</h3><p>Your subscription for <strong>{{merchant}}</strong> is scheduled to renew on <strong>{{date}}</strong>.</p><p>Amount: {{amount}} {{currency}}</p>',
                enabled: true
            },
            push: {
                title: 'Renewal Reminder',
                body: '{{merchant}} renews for {{amount}} {{currency}} on {{date}}.',
                enabled: true
            }
        },
        variableDefinitions: [
            { name: 'merchant', description: 'Merchant name' },
            { name: 'amount', description: 'Charge amount' },
            { name: 'currency', description: 'Currency code' },
            { name: 'date', description: 'Renewal date' }
        ]
    },
    {
        slug: 'system-maintenance-notification',
        name: 'System: Scheduled Maintenance',
        category: 'system',
        channels: {
            email: {
                subject: 'Scheduled Maintenance: ExpenseFlow API',
                body: '<p>The system will be undergoing maintenance on <strong>{{startTime}}</strong>. Expected downtime: {{duration}}.</p>',
                enabled: true
            },
            sms: {
                body: 'ExpenseFlow: System maintenance scheduled for {{startTime}}. Expected downtime: {{duration}}.',
                enabled: true
            }
        },
        variableDefinitions: [
            { name: 'startTime', description: 'Maintenance start time' },
            { name: 'duration', description: 'Estimated duration' }
        ]
    },
    {
        slug: 'low-balance-warning',
        name: 'Financial: Low Balance Warning',
        category: 'transaction',
        channels: {
            email: {
                subject: 'Warning: Low Balance on {{accountName}}',
                body: '<p>Your account <strong>{{accountName}}</strong> has dropped below your threshold of {{threshold}} {{currency}}.</p><p>Current Balance: {{balance}} {{currency}}</p>',
                enabled: true
            },
            push: {
                title: 'Low Balance Warning',
                body: '{{accountName}} balance is {{balance}} {{currency}}.',
                enabled: true
            }
        },
        variableDefinitions: [
            { name: 'accountName', description: 'Name of the account' },
            { name: 'threshold', description: 'User set threshold' },
            { name: 'balance', description: 'Current balance' },
            { name: 'currency', description: 'Currency code' }
        ]
    },
    {
        slug: 'large-transaction-alert',
        name: 'Security: Large Transaction Detected',
        category: 'transaction',
        channels: {
            email: {
                subject: 'Security Alert: Large Transaction of {{amount}} {{currency}}',
                body: '<p>A large transaction was detected on your account.</p><ul><li><strong>Merchant:</strong> {{merchant}}</li><li><strong>Amount:</strong> {{amount}} {{currency}}</li><li><strong>Date:</strong> {{date}}</li></ul><p>If you did not authorize this, please contact support.</p>',
                enabled: true
            },
            push: {
                title: 'Large Purchase Alert',
                body: '{{amount}} {{currency}} spent at {{merchant}}.',
                enabled: true
            }
        },
        variableDefinitions: [
            { name: 'amount', description: 'Transaction amount' },
            { name: 'currency', description: 'Currency code' },
            { name: 'merchant', description: 'Merchant name' },
            { name: 'date', description: 'Transaction date' }
        ]
    },
    {
        slug: 'monthly-spending-report',
        name: 'Reporting: Monthly Summary',
        category: 'system',
        channels: {
            email: {
                subject: 'Your Monthly Spending Report - {{month}}',
                body: '<h1>Monthly Summary</h1><p>You spent <strong>{{totalSpend}} {{currency}}</strong> in {{month}}.</p><p>Top category: {{topCategory}} ({{topCategorySpend}} {{currency}})</p>',
                enabled: true
            },
            inApp: {
                title: 'Monthly Report Available',
                body: 'Summary for {{month}} is ready. Total spent: {{totalSpend}}.'
            }
        },
        variableDefinitions: [
            { name: 'month', description: 'Month name' },
            { name: 'totalSpend', description: 'Total amount spent' },
            { name: 'currency', description: 'Currency code' },
            { name: 'topCategory', description: 'Highest spending category' },
            { name: 'topCategorySpend', description: 'Amount spent in top category' }
        ]
    },
    {
        slug: 'weekly-budget-recap',
        name: 'Reporting: Weekly Budget Recap',
        category: 'transaction',
        channels: {
            email: {
                subject: 'Weekly Budget Recap - {{dateRange}}',
                body: '<h2>Weekly Performance</h2><p>You are {{status}} your budget this week.</p><p>Total Spent: {{totalSpent}}</p>',
                enabled: true
            }
        },
        variableDefinitions: [
            { name: 'dateRange', description: 'Week range' },
            { name: 'status', description: 'Under/Over status' },
            { name: 'totalSpent', description: 'Total spent' }
        ]
    },
    {
        slug: 'new-feature-announcement',
        name: 'Product: New Feature',
        category: 'marketing',
        channels: {
            email: {
                subject: 'Introducing {{featureName}} on ExpenseFlow',
                body: '<p>We are excited to launch <strong>{{featureName}}</strong>!</p><p>{{description}}</p>',
                enabled: true
            },
            push: {
                title: 'New Feature!',
                body: 'Try out {{featureName}} today.',
                enabled: true
            },
            inApp: {
                title: 'New Feature!',
                body: '{{featureName}} is now available in your dashboard.'
            }
        },
        variableDefinitions: [
            { name: 'featureName', description: 'Name of the feature' },
            { name: 'description', description: 'Brief description' }
        ]
    },
    {
        slug: 'referral-bonus-credited',
        name: 'Social: Referral Bonus',
        category: 'social',
        channels: {
            email: {
                subject: 'Good News! Your Referral Bonus has been Credited',
                body: '<p>Thanks for referring {{friendName}}!</p><p>A bonus of {{bonusAmount}} {{currency}} has been added to your account.</p>',
                enabled: true
            },
            push: {
                title: 'Bonus Credited!',
                body: 'You earned {{bonusAmount}} for referring {{friendName}}.',
                enabled: true
            }
        },
        variableDefinitions: [
            { name: 'friendName', description: 'Name of referred friend' },
            { name: 'bonusAmount', description: 'Bonus amount' },
            { name: 'currency', description: 'Currency code' }
        ]
    },
    {
        slug: 'password-reset-success',
        name: 'Security: Password Changed',
        category: 'security',
        channels: {
            email: {
                subject: 'Your Password was Successfully Changed',
                body: '<p>The password for your account was changed on {{date}} at {{time}}.</p><p>If this was not you, please contact support immediately.</p>',
                enabled: true
            }
        },
        variableDefinitions: [
            { name: 'date', description: 'Change date' },
            { name: 'time', description: 'Change time' }
        ]
    },
    {
        slug: 'account-verification-code',
        name: 'Security: Verification Code',
        category: 'security',
        channels: {
            email: {
                subject: 'Your Verification Code: {{code}}',
                body: '<p>Please enter the following code to verify your action:</p><h2>{{code}}</h2><p>This code expires in {{expiry}} minutes.</p>',
                enabled: true
            },
            sms: {
                body: 'ExpenseFlow: Your verification code is {{code}}. Expires in {{expiry}} mins.',
                enabled: true
            }
        },
        variableDefinitions: [
            { name: 'code', description: '6-digit code' },
            { name: 'expiry', description: 'Expiry duration' }
        ]
    },
    {
        slug: 'invite-to-workspace',
        name: 'Social: Workspace Invitation',
        category: 'social',
        channels: {
            email: {
                subject: 'You have been invited to join {{workspaceName}}',
                body: '<p>{{inviterName}} invited you to collaborate on <strong>{{workspaceName}}</strong>.</p><p><a href="{{inviteUrl}}">Accept Invitation</a></p>',
                enabled: true
            }
        },
        variableDefinitions: [
            { name: 'workspaceName', description: 'Workspace name' },
            { name: 'inviterName', description: 'Person who invited' },
            { name: 'inviteUrl', description: 'Accept URL' }
        ]
    },
    {
        slug: 'welcome-onboarding',
        name: 'System: Welcome Onboarding',
        category: 'system',
        channels: {
            email: {
                subject: 'Welcome to ExpenseFlow, {{name}}!',
                body: '<h1>Welcome!</h1><p>We are glad to have you on board. Start tracking your expenses today!</p>',
                enabled: true
            },
            inApp: {
                title: 'Welcome!',
                body: 'Complete your profile to get started.'
            }
        },
        variableDefinitions: [
            { name: 'name', description: 'User name' }
        ]
    }
];


module.exports = { notificationLibrary };
