const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  /**
   * Generic mail sender
   */
  async sendMail(options) {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      ...options
    };
    return await this.transporter.sendMail(mailOptions);
  }

  formatCurrency(amount, user, options = {}) {
    const currency = user?.preferredCurrency || 'INR';
    const locale = user?.locale || 'en-US';

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: options.minimumFractionDigits ?? 2,
        maximumFractionDigits: options.maximumFractionDigits ?? 2
      }).format(Number(amount) || 0);
    } catch (err) {
      return `${currency} ${Number(amount || 0).toFixed(options.minimumFractionDigits ?? 2)}`;
    }
  }

  async sendWelcomeEmail(user) {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Welcome to ExpenseFlow! 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">Welcome to ExpenseFlow, ${user.name}!</h2>
          <p>Thank you for joining ExpenseFlow. Start tracking your expenses and take control of your finances.</p>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Get Started:</h3>
            <ul>
              <li>Add your first expense</li>
              <li>Set up categories</li>
              <li>Track your spending patterns</li>
            </ul>
          </div>
          <p>Happy tracking!</p>
          <p><strong>The ExpenseFlow Team</strong></p>
        </div>
      `
    };

    return await this.transporter.sendMail(mailOptions);
  }

  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Password Reset Request - ExpenseFlow',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">Password Reset Request</h2>
          <p>Hi ${user.name},</p>
          <p>You requested a password reset for your ExpenseFlow account.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Reset Password</a>
          </div>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `
    };

    return await this.transporter.sendMail(mailOptions);
  }

  async sendMonthlyReport(user, reportData) {
    const { totalExpenses, totalIncome, balance, topCategories } = reportData;
    const format = (value) => this.formatCurrency(value, user);

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Monthly Expense Report - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">Monthly Expense Report</h2>
          <p>Hi ${user.name},</p>
          <p>Here's your expense summary for this month:</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span><strong>Total Income:</strong></span>
              <span style="color: #28a745;">${format(totalIncome)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span><strong>Total Expenses:</strong></span>
              <span style="color: #dc3545;">${format(totalExpenses)}</span>
            </div>
            <hr>
            <div style="display: flex; justify-content: space-between;">
              <span><strong>Balance:</strong></span>
              <span style="color: ${balance >= 0 ? '#28a745' : '#dc3545'};">${format(balance)}</span>
            </div>
          </div>

          <h3>Top Spending Categories:</h3>
          <ul>
            ${topCategories.map(cat => `<li>${cat.name}: ${format(cat.amount)}</li>`).join('')}
          </ul>
          
          <p>Keep tracking your expenses to maintain financial health!</p>
        </div>
      `
    };

    return await this.transporter.sendMail(mailOptions);
  }

  async sendBudgetAlert(user, category, spent, budget) {
    const percentage = (spent / budget) * 100;
    const format = (value) => this.formatCurrency(value, user);

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Budget Alert: ${category} - ExpenseFlow`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ff6b6b;">Budget Alert! ⚠️</h2>
          <p>Hi ${user.name},</p>
          <p>You've spent <strong>${percentage.toFixed(1)}%</strong> of your ${category} budget.</p>
          
          <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <div style="margin-bottom: 10px;">
              <strong>Category:</strong> ${category}
            </div>
            <div style="margin-bottom: 10px;">
              <strong>Spent:</strong> ${format(spent)}
            </div>
            <div style="margin-bottom: 10px;">
              <strong>Budget:</strong> ${format(budget)}
            </div>
            <div>
              <strong>Remaining:</strong> ${format(budget - spent)}
            </div>
          </div>
          
          <p>Consider reviewing your spending to stay within budget.</p>
        </div>
      `
    };

    return await this.transporter.sendMail(mailOptions);
  }

  async sendWeeklyReport(user, reportData) {
    const { weeklyExpenses, totalSpent, avgDaily } = reportData;
    const format = (value) => this.formatCurrency(value, user);

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Weekly Spending Report - ExpenseFlow',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">Weekly Spending Report</h2>
          <p>Hi ${user.name},</p>
          <p>Here's your spending summary for this week:</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <div style="margin-bottom: 10px;">
              <strong>Total Spent:</strong> ${format(totalSpent)}
            </div>
            <div>
              <strong>Daily Average:</strong> ${format(avgDaily)}
            </div>
          </div>

          <h3>Daily Breakdown:</h3>
          <ul>
            ${weeklyExpenses.map(day => `<li>${day.date}: ${format(day.amount)}</li>`).join('')}
          </ul>
          
          <p>Stay on track with your financial goals!</p>
        </div>
      `
    };

    return await this.transporter.sendMail(mailOptions);
  }

  async sendSubscriptionReminder(user, recurringExpense) {
    const dueDate = new Date(recurringExpense.nextDueDate);
    const format = (value) => this.formatCurrency(value, user);
    const formattedDate = dueDate.toLocaleDateString(user?.locale || 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const frequencyText = {
      'daily': 'Daily',
      'weekly': 'Weekly',
      'biweekly': 'Bi-weekly',
      'monthly': 'Monthly',
      'quarterly': 'Quarterly',
      'yearly': 'Yearly'
    };

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Upcoming Payment Reminder: ${recurringExpense.description} - ExpenseFlow`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">📅 Upcoming Payment Reminder</h2>
          <p>Hi ${user.name},</p>
          <p>This is a reminder that you have an upcoming recurring ${recurringExpense.type}:</p>
          
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 12px; margin: 20px 0;">
            <h3 style="margin: 0 0 15px 0; color: white;">${recurringExpense.description}</h3>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span>Amount:</span>
              <strong>${format(recurringExpense.amount)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span>Category:</span>
              <strong>${recurringExpense.category.charAt(0).toUpperCase() + recurringExpense.category.slice(1)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span>Frequency:</span>
              <strong>${frequencyText[recurringExpense.frequency] || recurringExpense.frequency}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Due Date:</span>
              <strong>${formattedDate}</strong>
            </div>
          </div>

          <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <strong>⏰ Reminder:</strong> This payment is due in ${recurringExpense.reminderDays} days or less.
          </div>

          ${recurringExpense.notes ? `
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <strong>Notes:</strong> ${recurringExpense.notes}
          </div>
          ` : ''}

          <p style="color: #666; font-size: 14px;">
            You can manage your recurring expenses anytime from your ExpenseFlow dashboard.
          </p>
          
          <p>Happy budgeting! 💰</p>
          <p><strong>The ExpenseFlow Team</strong></p>
        </div>
      `
    };

    return await this.transporter.sendMail(mailOptions);
  }

  async sendWorkspaceInvitation(email, data) {
    const { workspaceName, invitedBy, role, inviteLink } = data;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `Invitation to join ${workspaceName} on ExpenseFlow`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">👥 Workspace Invitation</h2>
          <p>Hi there!</p>
          <p><strong>${invitedBy}</strong> has invited you to join the <strong>${workspaceName}</strong> workspace on ExpenseFlow as an <strong>${role}</strong>.</p>
          
          <div style="background: #f8f9fa; padding: 25px; border-radius: 12px; margin: 20px 0; border: 1px solid #e0e0e0; text-align: center;">
            <p style="margin-bottom: 20px;">Collaborate on expenses, track group spending, and manage family finances together.</p>
            <a href="${inviteLink}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">Join Workspace</a>
          </div>

          <p style="color: #666; font-size: 14px;">
            This invitation link will expire in 7 days. If you don't have an ExpenseFlow account, you'll need to create one to join.
          </p>
          
          <p>Happy collaborating! 💰</p>
          <p><strong>The ExpenseFlow Team</strong></p>
        </div>
      `
    };

    return await this.transporter.sendMail(mailOptions);
  }

  async sendContactNotification(contactData) {
    const { name, email, subject, message } = contactData;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: process.env.SUPPORT_EMAIL || process.env.EMAIL_USER,
      subject: `New Contact Form Submission: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
          <h2 style="color: #667eea; border-bottom: 1px solid #eee; padding-bottom: 10px;">New Contact Message</h2>
          <p><strong>From:</strong> ${name} (&lt;${email}&gt;)</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin-top: 15px;">
            <p style="white-space: pre-wrap;">${message}</p>
          </div>
          <p style="font-size: 12px; color: #888; margin-top: 20px;">
            This email was generated automatically by the ExpenseFlow Contact Form.
          </p>
        </div>
      `
    };

    return await this.transporter.sendMail(mailOptions);
  }
}

module.exports = new EmailService();