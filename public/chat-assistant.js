/**
 * AI Chat Assistant Frontend Module
 * Handles all client-side chat interactions, UI rendering, and API calls
 */

class ChatAssistant {
  constructor() {
    this.sessionId = null;
    this.isOpen = false;
    this.isSending = false;
    this.messageHistory = [];
    this.voiceEnabled = false;
    this.recognition = null;
    this.synthesis = null;
    this.preferences = {
      showSuggestions: true,
      detailedResponses: true,
      showDataContext: true
    };

    this.initSpeechAPIs();
    this.setupEventListeners();
    this.initSession();
  }

  /**
   * Initialize Web Speech API
   */
  initSpeechAPIs() {
    // Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.updateVoiceButton('listening');
      };

      this.recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        this.handleVoiceInput(transcript, event.isFinal);
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        this.updateVoiceButton('error');
      };

      this.recognition.onend = () => {
        this.updateVoiceButton('idle');
      };
    }

    // Text-to-Speech
    this.synthesis = window.speechSynthesis;
  }

  /**
   * Setup DOM event listeners
   */
  setupEventListeners() {
    // Chat toggle button
    const chatToggle = document.getElementById('chat-toggle-btn');
    if (chatToggle) {
      chatToggle.addEventListener('click', () => this.toggleChat());
    }

    // Send message button
    const sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.sendMessage());
    }

    // Message input - send on Enter
    const messageInput = document.getElementById('chat-message-input');
    if (messageInput) {
      messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }

    // Voice input button
    const voiceBtn = document.getElementById('chat-voice-btn');
    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => this.toggleVoiceInput());
    }

    // Close chat button
    const closeBtn = document.getElementById('chat-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeChat());
    }

    // Settings button
    const settingsBtn = document.getElementById('chat-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openSettings());
    }
  }

  /**
   * Initialize chat session
   */
  async initSession() {
    try {
      const response = await fetch('/api/chat/session', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.sessionId = data.session.sessionId;
        this.preferences = data.session.preferences;
        
        // Load previous messages if available
        this.loadChatHistory();
      }
    } catch (error) {
      console.error('Error initializing chat session:', error);
    }
  }

  /**
   * Load chat history
   */
  async loadChatHistory() {
    try {
      const response = await fetch(`/api/chat/messages/${this.sessionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.messageHistory = data.messages;
        this.renderMessages();
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  }

  /**
   * Toggle chat window
   */
  toggleChat() {
    this.isOpen ? this.closeChat() : this.openChat();
  }

  /**
   * Open chat window
   */
  openChat() {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      chatContainer.classList.add('open');
      chatContainer.style.display = 'flex';
      this.isOpen = true;
      
      // Focus on input
      const input = document.getElementById('chat-message-input');
      if (input) input.focus();

      // Load suggestions
      this.loadSuggestions();
    }
  }

  /**
   * Close chat window
   */
  closeChat() {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      chatContainer.classList.remove('open');
      this.isOpen = false;
    }
  }

  /**
   * Send message to server
   */
  async sendMessage() {
    const input = document.getElementById('chat-message-input');
    const messageText = input.value.trim();

    if (!messageText || this.isSending) return;

    this.isSending = true;

    try {
      // Add user message to UI
      this.addMessageToUI('user', messageText);
      input.value = '';

      // Send to server
      const response = await fetch('/api/chat/send-message', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: messageText,
          messageType: 'text'
        })
      });

      if (response.ok) {
        const data = await response.json();
        const message = data.message;

        // Add assistant message to UI
        this.addMessageToUI('assistant', message.content, {
          intent: message.intent,
          action: message.action,
          actionPerformed: message.actionPerformed,
          actionResult: message.actionResult,
          suggestions: message.suggestions
        });

        // Speak response if voice enabled
        if (this.voiceEnabled && this.synthesis) {
          this.speakText(message.content);
        }

        // Update session statistics
        this.updateSessionStats(data.session);
      } else {
        this.addMessageToUI('assistant', 'Sorry, I encountered an error. Please try again.');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.addMessageToUI('assistant', 'Failed to send message. Please try again.');
    } finally {
      this.isSending = false;
      input.focus();
    }
  }

  /**
   * Add message to UI
   */
  addMessageToUI(sender, content, metadata = {}) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;

    let messageContent = `<div class="message-text">${this.escapeHtml(content)}</div>`;

    // Add action buttons for assistant messages
    if (sender === 'assistant' && metadata.actionPerformed) {
      messageContent += `<div class="message-action">✅ ${metadata.actionPerformed}</div>`;
    }

    // Add suggestions
    if (sender === 'assistant' && metadata.suggestions && metadata.suggestions.length > 0 && this.preferences.showSuggestions) {
      messageContent += '<div class="message-suggestions">';
      metadata.suggestions.forEach(suggestion => {
        messageContent += `<button class="suggestion-btn" onclick="chatAssistant.handleSuggestion('${this.escapeHtml(suggestion)}')">${this.escapeHtml(suggestion)}</button>`;
      });
      messageContent += '</div>';
    }

    messageDiv.innerHTML = messageContent;
    messagesContainer.appendChild(messageDiv);

    // Auto-scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Store in history
    this.messageHistory.push({
      sender,
      content,
      timestamp: new Date(),
      metadata
    });
  }

  /**
   * Handle voice input
   */
  handleVoiceInput(transcript, isFinal) {
    const input = document.getElementById('chat-message-input');
    if (input && isFinal) {
      input.value = transcript;
      this.sendMessage();
    }
  }

  /**
   * Toggle voice input
   */
  toggleVoiceInput() {
    if (!this.recognition) {
      alert('Speech recognition not supported in your browser');
      return;
    }

    if (this.recognition.isListening) {
      this.recognition.abort();
      this.recognition.isListening = false;
      this.updateVoiceButton('idle');
    } else {
      this.recognition.start();
      this.recognition.isListening = true;
    }
  }

  /**
   * Toggle voice output (text-to-speech)
   */
  toggleVoiceOutput() {
    this.voiceEnabled = !this.voiceEnabled;
    localStorage.setItem('voiceEnabled', this.voiceEnabled);
    
    const voiceToggle = document.getElementById('chat-voice-output-toggle');
    if (voiceToggle) {
      voiceToggle.classList.toggle('active', this.voiceEnabled);
    }
  }

  /**
   * Speak text using Web Speech API
   */
  speakText(text) {
    if (!this.synthesis) return;

    this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    this.synthesis.speak(utterance);
  }

  /**
   * Update voice button state
   */
  updateVoiceButton(state) {
    const voiceBtn = document.getElementById('chat-voice-btn');
    if (voiceBtn) {
      voiceBtn.className = `chat-voice-btn ${state}`;
      const stateText = {
        'idle': '🎤',
        'listening': '🔴',
        'error': '❌'
      };
      voiceBtn.textContent = stateText[state] || '🎤';
    }
  }

  /**
   * Load suggestions
   */
  async loadSuggestions() {
    try {
      const response = await fetch('/api/chat/suggestions', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.displaySuggestions(data.suggestions);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
    }
  }

  /**
   * Display suggestions in UI
   */
  displaySuggestions(suggestions) {
    const suggestionsContainer = document.getElementById('chat-suggestions');
    if (!suggestionsContainer || !suggestions.length) return;

    suggestionsContainer.innerHTML = '<div class="suggestions-header">Quick Actions:</div>';
    
    suggestions.forEach(suggestion => {
      const btn = document.createElement('button');
      btn.className = 'suggestion-button';
      btn.textContent = `${suggestion.icon} ${suggestion.text}`;
      btn.onclick = () => this.handleSuggestion(suggestion.text);
      suggestionsContainer.appendChild(btn);
    });
  }

  /**
   * Handle suggestion click
   */
  handleSuggestion(suggestion) {
    const input = document.getElementById('chat-message-input');
    if (input) {
      input.value = suggestion;
      this.sendMessage();
    }
  }

  /**
   * Open settings modal
   */
  openSettings() {
    const settingsModal = document.getElementById('chat-settings-modal');
    if (settingsModal) {
      settingsModal.style.display = 'flex';
      this.populateSettings();
    }
  }

  /**
   * Populate settings from preferences
   */
  populateSettings() {
    const showSuggestionsToggle = document.getElementById('chat-show-suggestions');
    const detailedResponsesToggle = document.getElementById('chat-detailed-responses');
    const showDataContextToggle = document.getElementById('chat-show-data-context');
    const voiceOutputToggle = document.getElementById('chat-voice-output-toggle');

    if (showSuggestionsToggle) {
      showSuggestionsToggle.checked = this.preferences.showSuggestions;
      showSuggestionsToggle.addEventListener('change', (e) => {
        this.preferences.showSuggestions = e.target.checked;
        this.savePreferences();
      });
    }

    if (detailedResponsesToggle) {
      detailedResponsesToggle.checked = this.preferences.detailedResponses;
      detailedResponsesToggle.addEventListener('change', (e) => {
        this.preferences.detailedResponses = e.target.checked;
        this.savePreferences();
      });
    }

    if (showDataContextToggle) {
      showDataContextToggle.checked = this.preferences.showDataContext;
      showDataContextToggle.addEventListener('change', (e) => {
        this.preferences.showDataContext = e.target.checked;
        this.savePreferences();
      });
    }

    if (voiceOutputToggle) {
      voiceOutputToggle.checked = this.voiceEnabled;
      voiceOutputToggle.addEventListener('change', () => this.toggleVoiceOutput());
    }
  }

  /**
   * Save preferences to server
   */
  async savePreferences() {
    try {
      await fetch('/api/chat/preferences', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ preferences: this.preferences })
      });
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  }

  /**
   * Update session statistics
   */
  updateSessionStats(stats) {
    const statsDiv = document.getElementById('chat-session-stats');
    if (statsDiv) {
      statsDiv.innerHTML = `
        <div class="stat">Messages: ${stats.totalMessages}</div>
        <div class="stat">Actions: ${JSON.stringify(stats.actionsPerformed).replace(/[{}":]/g, ' ')}</div>
      `;
    }
  }

  /**
   * Render all messages
   */
  renderMessages() {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    messagesContainer.innerHTML = '';
    this.messageHistory.forEach(msg => {
      this.addMessageToUI(msg.sender, msg.content, msg.metadata || {});
    });
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Clear chat history
   */
  async clearChat() {
    if (confirm('Are you sure you want to clear the chat history?')) {
      try {
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
          messagesContainer.innerHTML = '';
        }
        this.messageHistory = [];

        // End current session
        await fetch('/api/chat/end-session', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        });

        // Create new session
        this.initSession();
      } catch (error) {
        console.error('Error clearing chat:', error);
      }
    }
  }
}

// Initialize chat assistant when page loads
let chatAssistant;
document.addEventListener('DOMContentLoaded', () => {
  chatAssistant = new ChatAssistant();
});
