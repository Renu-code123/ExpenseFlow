// ==============================
// AI FINANCIAL ADVISOR
// ==============================

class AIFinancialAdvisor {
    constructor() {
        this.apiKey = this.getApiKey();
        this.chatMessages = document.getElementById('chatMessages');
        this.chatForm = document.getElementById('chatForm');
        this.userInput = document.getElementById('userInput');
        this.quickActionBtns = document.querySelectorAll('.quick-action-btn');
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkApiConfiguration();
    }

    getApiKey() {
        // Get API key from environment or localStorage
        return localStorage.getItem('openai-api-key') || '';
    }

    setApiKey(key) {
        localStorage.setItem('openai-api-key', key);
        this.apiKey = key;
    }

    checkApiConfiguration() {
        if (!this.apiKey) {
            this.showApiConfigPrompt();
        }
    }

    showApiConfigPrompt() {
        const key = prompt(
            'Enter your OpenAI API key to use the AI Financial Advisor.\n\n' +
            'Get one free at: https://platform.openai.com/api-keys\n\n' +
            '(Your key will be stored locally and never shared)',
            ''
        );

        if (key) {
            this.setApiKey(key);
            this.addSystemMessage('✅ API key configured successfully! You can now ask me financial questions.');
        } else {
            this.addSystemMessage(
                '⚠️ API key required. Click the settings icon or reload the page to add your OpenAI API key.\n\n' +
                'Get a free API key at: https://platform.openai.com/api-keys'
            );
        }
    }

    setupEventListeners() {
        this.chatForm.addEventListener('submit', (e) => this.handleUserMessage(e));
        this.quickActionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const question = btn.dataset.question;
                this.userInput.value = question;
                this.chatForm.dispatchEvent(new Event('submit'));
            });
        });
    }

    async handleUserMessage(e) {
        e.preventDefault();

        const message = this.userInput.value.trim();
        if (!message) return;

        if (!this.apiKey) {
            this.addSystemMessage('⚠️ Please configure your OpenAI API key first.');
            return;
        }

        // Clear input
        this.userInput.value = '';

        // Add user message to chat
        this.addMessage(message, 'user');

        // Disable send button
        const sendBtn = this.chatForm.querySelector('.send-btn');
        sendBtn.disabled = true;

        try {
            // Show typing indicator
            const typingDiv = this.addTypingIndicator();

            // Get AI response
            const response = await this.getAIResponse(message);

            // Remove typing indicator
            typingDiv.remove();

            // Add AI response
            this.addMessage(response, 'assistant');
        } catch (error) {
            console.error('Error:', error);
            this.addSystemMessage(`❌ Error: ${error.message}`);
        } finally {
            // Re-enable send button
            sendBtn.disabled = false;
            this.userInput.focus();
        }
    }

    addMessage(content, role) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = role === 'user' 
            ? '<i class="fas fa-user"></i>' 
            : '<i class="fas fa-robot"></i>';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;

        // Format content if it's from assistant (handle bullet points, etc)
        if (role === 'assistant') {
            contentDiv.innerHTML = this.formatMessage(content);
        }

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    formatMessage(content) {
        // Convert markdown-like formatting to HTML
        let formatted = content
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^- (.*?)$/gm, '• $1');

        return formatted;
    }

    addTypingIndicator() {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant-message';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = '<i class="fas fa-robot"></i>';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content loading-indicator';
        contentDiv.innerHTML = `
            <div class="loading-dot"></div>
            <div class="loading-dot"></div>
            <div class="loading-dot"></div>
        `;

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();

        return messageDiv;
    }

    addSystemMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant-message';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = '<i class="fas fa-info-circle"></i>';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = message;

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    scrollToBottom() {
        setTimeout(() => {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }, 0);
    }

    async getAIResponse(userMessage) {
        const systemPrompt = `You are an expert Financial Advisor AI for ExpenseFlow, a personal finance management application. 
Your role is to provide helpful, actionable financial advice based on the user's questions about:
- Budget optimization and management
- Expense reduction strategies
- Savings techniques
- Investment fundamentals
- Debt management
- Financial goal planning
- Money management best practices

Guidelines:
1. Always provide practical, actionable advice
2. Include specific examples when possible
3. Consider the user's financial situation holistically
4. Mention that your advice is educational and they should consult professionals for major decisions
5. Be encouraging and supportive
6. Keep responses concise but comprehensive
7. Use bullet points or numbered lists for clarity when appropriate

Remember: You represent ExpenseFlow, so encourage users to track their expenses, set budgets, and use the app's features.`;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        },
                        {
                            role: 'user',
                            content: userMessage
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 1000
                })
            });

            if (!response.ok) {
                const error = await response.json();
                if (response.status === 401) {
                    throw new Error('Invalid API key. Please check your OpenAI API key.');
                } else if (response.status === 429) {
                    throw new Error('Rate limit exceeded. Please wait a moment and try again.');
                } else {
                    throw new Error(error.error?.message || 'Failed to get response from AI');
                }
            }

            const data = await response.json();
            return data.choices[0].message.content.trim();

        } catch (error) {
            if (error.message.includes('Failed to fetch')) {
                throw new Error('Network error. Please check your internet connection.');
            }
            throw error;
        }
    }
}

// Initialize AI Advisor when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const advisor = new AIFinancialAdvisor();

    // Add settings button functionality (optional)
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const newKey = prompt('Enter your OpenAI API key:', advisor.apiKey);
            if (newKey) {
                advisor.setApiKey(newKey);
                advisor.addSystemMessage('✅ API key updated successfully!');
            }
        });
    }

    // Theme switching
    if (window.themeManager) {
        document.addEventListener('themechange', () => {
            // Refresh if needed
        });
    }
});

// Export for modules if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIFinancialAdvisor;
}
document.addEventListener('DOMContentLoaded', () => {
    const advisor = new AIFinancialAdvisor();

    // Optional: settings button to update API key
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const newKey = prompt('Enter your OpenAI API key:', advisor.apiKey);
            if (newKey) {
                advisor.setApiKey(newKey);
                advisor.addSystemMessage('✅ API key updated successfully!');
            }
        });
    }
});const themeToggleBtn = document.getElementById('theme-toggle-btn');

themeToggleBtn.addEventListener('click', () => {
    const htmlEl = document.documentElement;
    const currentTheme = htmlEl.getAttribute('data-theme');

    if (currentTheme === 'dark') {
        htmlEl.setAttribute('data-theme', 'light');
        themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
        themeToggleBtn.title = 'Switch to Dark Mode';
    } else {
        htmlEl.setAttribute('data-theme', 'dark');
        themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        themeToggleBtn.title = 'Switch to Light Mode';
    }
});