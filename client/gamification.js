/**
 * Gamification Feature Module
 * Handles challenges, achievements, leaderboards, and streaks
 */

class GamificationManager {
  constructor() {
    this.profile = null;
    this.achievements = {};
    this.challenges = [];
    this.leaderboard = [];
    this.templates = [];
    this.baseUrl = '/api/gamification';
  }

  /**
   * Get authorization headers
   */
  getHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  /**
   * Initialize gamification
   */
  async init() {
    try {
      await Promise.all([
        this.loadProfile(),
        this.loadAchievements(),
        this.loadChallenges(),
        this.loadTemplates()
      ]);
      
      this.setupSocketListeners();
      this.renderDashboard();
      
      return true;
    } catch (error) {
      console.error('Gamification init error:', error);
      return false;
    }
  }

  /**
   * Load user profile
   */
  async loadProfile() {
    try {
      const response = await fetch(`${this.baseUrl}/profile`, {
        headers: this.getHeaders()
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.profile = data.data;
        this.updateProfileUI();
      }
      
      return this.profile;
    } catch (error) {
      console.error('Load profile error:', error);
      throw error;
    }
  }

  /**
   * Load achievements
   */
  async loadAchievements() {
    try {
      const response = await fetch(`${this.baseUrl}/achievements`, {
        headers: this.getHeaders()
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.achievements = data.data.achievements;
        this.achievementSummary = data.data.summary;
        this.renderAchievements();
      }
      
      return this.achievements;
    } catch (error) {
      console.error('Load achievements error:', error);
      throw error;
    }
  }

  /**
   * Load user challenges
   */
  async loadChallenges(status = null) {
    try {
      const url = status 
        ? `${this.baseUrl}/challenges?status=${status}`
        : `${this.baseUrl}/challenges`;
        
      const response = await fetch(url, {
        headers: this.getHeaders()
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.challenges = data.data;
        this.renderChallenges();
      }
      
      return this.challenges;
    } catch (error) {
      console.error('Load challenges error:', error);
      throw error;
    }
  }

  /**
   * Load challenge templates
   */
  async loadTemplates() {
    try {
      const response = await fetch(`${this.baseUrl}/challenges/templates`, {
        headers: this.getHeaders()
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.templates = data.data;
      }
      
      return this.templates;
    } catch (error) {
      console.error('Load templates error:', error);
      throw error;
    }
  }

  /**
   * Load leaderboard
   */
  async loadLeaderboard(type = 'all_time') {
    try {
      const response = await fetch(`${this.baseUrl}/leaderboard?type=${type}`, {
        headers: this.getHeaders()
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.leaderboard = data.data.entries;
        this.renderLeaderboard(type);
      }
      
      return this.leaderboard;
    } catch (error) {
      console.error('Load leaderboard error:', error);
      throw error;
    }
  }

  /**
   * Load friends leaderboard
   */
  async loadFriendsLeaderboard() {
    try {
      const response = await fetch(`${this.baseUrl}/leaderboard/friends`, {
        headers: this.getHeaders()
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.renderLeaderboard('friends', data.data);
      }
      
      return data.data;
    } catch (error) {
      console.error('Load friends leaderboard error:', error);
      throw error;
    }
  }

  /**
   * Discover public challenges
   */
  async discoverChallenges(filters = {}) {
    try {
      const params = new URLSearchParams(filters).toString();
      const response = await fetch(`${this.baseUrl}/challenges/discover?${params}`, {
        headers: this.getHeaders()
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.renderDiscoverChallenges(data.data);
      }
      
      return data.data;
    } catch (error) {
      console.error('Discover challenges error:', error);
      throw error;
    }
  }

  /**
   * Create a challenge
   */
  async createChallenge(challengeData) {
    try {
      const response = await fetch(`${this.baseUrl}/challenges`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(challengeData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.showNotification('Challenge created successfully!', 'success');
        await this.loadChallenges();
        this.closeModal();
        return data.data;
      } else {
        this.showNotification(data.error || 'Failed to create challenge', 'error');
        return null;
      }
    } catch (error) {
      console.error('Create challenge error:', error);
      this.showNotification('Failed to create challenge', 'error');
      throw error;
    }
  }

  /**
   * Join a challenge
   */
  async joinChallenge(challengeId) {
    try {
      const response = await fetch(`${this.baseUrl}/challenges/${challengeId}/join`, {
        method: 'POST',
        headers: this.getHeaders()
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.showNotification('Joined challenge successfully!', 'success');
        await this.loadChallenges();
        await this.loadProfile();
        return data.data;
      } else {
        this.showNotification(data.error || 'Failed to join challenge', 'error');
        return null;
      }
    } catch (error) {
      console.error('Join challenge error:', error);
      this.showNotification('Failed to join challenge', 'error');
      throw error;
    }
  }

  /**
   * Leave a challenge
   */
  async leaveChallenge(challengeId) {
    try {
      const response = await fetch(`${this.baseUrl}/challenges/${challengeId}/leave`, {
        method: 'POST',
        headers: this.getHeaders()
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.showNotification('Left challenge', 'info');
        await this.loadChallenges();
        return true;
      } else {
        this.showNotification(data.error || 'Failed to leave challenge', 'error');
        return false;
      }
    } catch (error) {
      console.error('Leave challenge error:', error);
      throw error;
    }
  }

  /**
   * Get challenge details
   */
  async getChallengeDetails(challengeId) {
    try {
      const response = await fetch(`${this.baseUrl}/challenges/${challengeId}`, {
        headers: this.getHeaders()
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.renderChallengeDetails(data.data);
        return data.data;
      }
      
      return null;
    } catch (error) {
      console.error('Get challenge details error:', error);
      throw error;
    }
  }

  /**
   * Update privacy settings
   */
  async updatePrivacy(settings) {
    try {
      const response = await fetch(`${this.baseUrl}/privacy`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(settings)
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.showNotification('Privacy settings updated', 'success');
        this.profile.privacySettings = data.data;
      }
      
      return data.success;
    } catch (error) {
      console.error('Update privacy error:', error);
      throw error;
    }
  }

  /**
   * Setup socket listeners for real-time updates
   */
  setupSocketListeners() {
    if (typeof io !== 'undefined' && window.socket) {
      window.socket.on('points_earned', (data) => {
        this.showPointsAnimation(data.points, data.reason);
        this.loadProfile();
      });
      
      window.socket.on('achievement_unlocked', (data) => {
        this.showAchievementUnlocked(data);
        this.loadAchievements();
      });
      
      window.socket.on('challenge_completed', (data) => {
        this.showChallengeCompleted(data);
        this.loadChallenges();
        this.loadProfile();
      });
      
      window.socket.on('challenge_invitation', (data) => {
        this.showChallengeInvitation(data);
      });
    }
  }

  // ==================== UI RENDERING ====================

  /**
   * Update profile UI
   */
  updateProfileUI() {
    if (!this.profile) return;
    
    const levelEl = document.getElementById('gamification-level');
    const pointsEl = document.getElementById('gamification-points');
    const rankEl = document.getElementById('gamification-rank');
    const xpBarEl = document.getElementById('gamification-xp-bar');
    
    if (levelEl) levelEl.textContent = this.profile.level;
    if (pointsEl) pointsEl.textContent = this.formatNumber(this.profile.totalPoints);
    if (rankEl) rankEl.textContent = this.capitalizeFirst(this.profile.rank);
    
    if (xpBarEl) {
      const xpPercent = ((this.profile.experience) / 
        (this.profile.experience + this.profile.experienceToNextLevel)) * 100;
      xpBarEl.style.width = `${xpPercent}%`;
    }
    
    // Update streaks display
    this.renderStreaks();
  }

  /**
   * Render main dashboard
   */
  renderDashboard() {
    const container = document.getElementById('gamification-dashboard');
    if (!container) return;
    
    container.innerHTML = `
      <div class="gamification-header">
        <div class="profile-card">
          <div class="level-badge">
            <span class="level-number" id="gamification-level">${this.profile?.level || 1}</span>
            <span class="level-label">Level</span>
          </div>
          <div class="profile-info">
            <h3 class="rank-title" id="gamification-rank">${this.capitalizeFirst(this.profile?.rank || 'novice')}</h3>
            <div class="xp-container">
              <div class="xp-bar">
                <div class="xp-fill" id="gamification-xp-bar" style="width: 0%"></div>
              </div>
              <span class="xp-text">${this.profile?.experience || 0} / ${(this.profile?.experience || 0) + (this.profile?.experienceToNextLevel || 100)} XP</span>
            </div>
          </div>
          <div class="points-display">
            <span class="points-value" id="gamification-points">${this.formatNumber(this.profile?.totalPoints || 0)}</span>
            <span class="points-label">Points</span>
          </div>
        </div>
      </div>
      
      <div class="gamification-tabs">
        <button class="tab-btn active" data-tab="challenges">🎯 Challenges</button>
        <button class="tab-btn" data-tab="achievements">🏆 Achievements</button>
        <button class="tab-btn" data-tab="leaderboard">📊 Leaderboard</button>
        <button class="tab-btn" data-tab="streaks">🔥 Streaks</button>
      </div>
      
      <div class="gamification-content">
        <div id="challenges-tab" class="tab-content active">
          <div class="tab-header">
            <h3>Your Challenges</h3>
            <div class="tab-actions">
              <button class="btn-secondary" onclick="gamification.discoverChallenges()">Discover</button>
              <button class="btn-primary" onclick="gamification.showCreateChallengeModal()">+ Create</button>
            </div>
          </div>
          <div id="challenges-list" class="challenges-grid"></div>
        </div>
        
        <div id="achievements-tab" class="tab-content">
          <div class="achievements-summary">
            <span class="earned-count">${this.achievementSummary?.earned || 0}</span> / 
            <span class="total-count">${this.achievementSummary?.total || 0}</span> Earned
          </div>
          <div id="achievements-list" class="achievements-container"></div>
        </div>
        
        <div id="leaderboard-tab" class="tab-content">
          <div class="leaderboard-filters">
            <button class="filter-btn active" data-type="all_time">All Time</button>
            <button class="filter-btn" data-type="monthly">Monthly</button>
            <button class="filter-btn" data-type="weekly">Weekly</button>
            <button class="filter-btn" data-type="friends">Friends</button>
          </div>
          <div id="leaderboard-list" class="leaderboard-container"></div>
        </div>
        
        <div id="streaks-tab" class="tab-content">
          <div id="streaks-list" class="streaks-container"></div>
        </div>
      </div>
    `;
    
    this.setupTabListeners();
    this.updateProfileUI();
    this.renderChallenges();
    this.renderAchievements();
  }

  /**
   * Setup tab listeners
   */
  setupTabListeners() {
    const tabs = document.querySelectorAll('.tab-btn');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
        
        // Load data for tab
        switch (tab.dataset.tab) {
          case 'leaderboard':
            this.loadLeaderboard();
            break;
          case 'achievements':
            this.loadAchievements();
            break;
        }
      });
    });
    
    // Leaderboard filter listeners
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (btn.dataset.type === 'friends') {
          this.loadFriendsLeaderboard();
        } else {
          this.loadLeaderboard(btn.dataset.type);
        }
      });
    });
  }

  /**
   * Render challenges list
   */
  renderChallenges() {
    const container = document.getElementById('challenges-list');
    if (!container) return;
    
    if (!this.challenges.length) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🎯</span>
          <h4>No challenges yet</h4>
          <p>Create a challenge or discover public challenges to get started!</p>
          <button class="btn-primary" onclick="gamification.showCreateChallengeModal()">Create Challenge</button>
        </div>
      `;
      return;
    }
    
    container.innerHTML = this.challenges.map(challenge => `
      <div class="challenge-card ${challenge.status}" onclick="gamification.getChallengeDetails('${challenge._id}')">
        <div class="challenge-header">
          <span class="challenge-icon">${challenge.icon}</span>
          <span class="challenge-difficulty ${challenge.difficulty}">${challenge.difficulty}</span>
        </div>
        <h4 class="challenge-title">${challenge.title}</h4>
        <p class="challenge-desc">${challenge.description}</p>
        <div class="challenge-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${challenge.userProgress}%"></div>
          </div>
          <span class="progress-text">${challenge.userProgress}%</span>
        </div>
        <div class="challenge-footer">
          <span class="days-remaining">
            ${challenge.daysRemaining > 0 ? `${challenge.daysRemaining} days left` : 'Ended'}
          </span>
          <span class="reward-points">+${challenge.rewardPoints} pts</span>
        </div>
      </div>
    `).join('');
  }

  /**
   * Render discover challenges
   */
  renderDiscoverChallenges(challenges) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'discover-modal';
    
    modal.innerHTML = `
      <div class="modal-content large">
        <div class="modal-header">
          <h3>🔍 Discover Challenges</h3>
          <button class="close-btn" onclick="gamification.closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="discover-filters">
            <select id="filter-type" onchange="gamification.filterDiscoverChallenges()">
              <option value="">All Types</option>
              <option value="no_spend">No Spend</option>
              <option value="category_reduction">Category Reduction</option>
              <option value="savings_target">Savings Target</option>
              <option value="streak">Streak</option>
              <option value="budget_adherence">Budget Adherence</option>
            </select>
            <select id="filter-difficulty" onchange="gamification.filterDiscoverChallenges()">
              <option value="">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="extreme">Extreme</option>
            </select>
          </div>
          <div class="discover-grid">
            ${challenges.length ? challenges.map(c => `
              <div class="discover-card ${c.isJoined ? 'joined' : ''}">
                <div class="discover-header">
                  <span class="discover-icon">${c.icon}</span>
                  <span class="discover-difficulty ${c.difficulty}">${c.difficulty}</span>
                </div>
                <h4>${c.title}</h4>
                <p>${c.description}</p>
                <div class="discover-meta">
                  <span>👥 ${c.participantCount} participants</span>
                  <span>⏰ ${c.daysRemaining} days left</span>
                </div>
                <div class="discover-reward">+${c.rewardPoints} points</div>
                ${c.isJoined 
                  ? '<button class="btn-joined" disabled>Joined ✓</button>'
                  : `<button class="btn-join" onclick="gamification.joinChallenge('${c._id}')">Join Challenge</button>`
                }
              </div>
            `).join('') : '<p class="no-results">No challenges found</p>'}
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  /**
   * Render achievements
   */
  renderAchievements() {
    const container = document.getElementById('achievements-list');
    if (!container) return;
    
    const categories = Object.keys(this.achievements);
    
    if (!categories.length) {
      container.innerHTML = '<p class="loading">Loading achievements...</p>';
      return;
    }
    
    container.innerHTML = categories.map(category => `
      <div class="achievement-category">
        <h4 class="category-title">${this.capitalizeFirst(category)}</h4>
        <div class="achievements-grid">
          ${this.achievements[category].map(a => `
            <div class="achievement-card ${a.isEarned ? 'earned' : ''} ${a.isSecret ? 'secret' : ''} tier-${a.tier}">
              <div class="achievement-icon">${a.icon}</div>
              <div class="achievement-info">
                <h5>${a.name}</h5>
                <p>${a.description}</p>
                ${!a.isEarned && !a.isSecret ? `
                  <div class="achievement-progress">
                    <div class="mini-progress-bar">
                      <div class="mini-progress-fill" style="width: ${a.progress}%"></div>
                    </div>
                    <span>${a.currentValue}/${a.targetValue}</span>
                  </div>
                ` : ''}
                ${a.isEarned ? `<span class="earned-date">Earned ${this.formatDate(a.earnedAt)}</span>` : ''}
              </div>
              <div class="achievement-points">+${a.points || 0}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  /**
   * Render leaderboard
   */
  renderLeaderboard(type, data = null) {
    const container = document.getElementById('leaderboard-list');
    if (!container) return;
    
    const entries = data || this.leaderboard;
    
    if (!entries.length) {
      container.innerHTML = '<p class="empty-state">No leaderboard data available</p>';
      return;
    }
    
    container.innerHTML = `
      <div class="leaderboard-list">
        ${entries.map((entry, index) => `
          <div class="leaderboard-entry ${entry.isCurrentUser ? 'current-user' : ''} ${index < 3 ? 'top-three' : ''}">
            <span class="rank ${index < 3 ? ['gold', 'silver', 'bronze'][index] : ''}">
              ${index < 3 ? ['🥇', '🥈', '🥉'][index] : entry.rank}
            </span>
            <div class="user-info">
              <span class="user-name">${entry.name} ${entry.isCurrentUser ? '(You)' : ''}</span>
              <span class="user-rank-title">${this.capitalizeFirst(entry.rankTitle)}</span>
            </div>
            <div class="user-stats">
              <span class="user-level">Lv. ${entry.level}</span>
              <span class="user-points">${this.formatNumber(entry.points)} pts</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Render streaks
   */
  renderStreaks() {
    const container = document.getElementById('streaks-list');
    if (!container || !this.profile) return;
    
    const streakTypes = [
      { type: 'login', icon: '📅', name: 'Login Streak', desc: 'Days logged in consecutively' },
      { type: 'expense_tracking', icon: '📝', name: 'Tracking Streak', desc: 'Days tracking expenses' },
      { type: 'budget_adherence', icon: '💰', name: 'Budget Streak', desc: 'Days staying under budget' },
      { type: 'no_spend', icon: '🌱', name: 'No Spend Streak', desc: 'Consecutive no-spend days' },
      { type: 'savings', icon: '💎', name: 'Savings Streak', desc: 'Days saving money' }
    ];
    
    container.innerHTML = `
      <div class="streaks-grid">
        ${streakTypes.map(st => {
          const streak = this.profile.streaks?.find(s => s.type === st.type);
          return `
            <div class="streak-card ${streak?.currentStreak > 0 ? 'active' : ''}">
              <div class="streak-icon">${st.icon}</div>
              <div class="streak-info">
                <h4>${st.name}</h4>
                <p>${st.desc}</p>
              </div>
              <div class="streak-stats">
                <div class="current-streak">
                  <span class="streak-value">${streak?.currentStreak || 0}</span>
                  <span class="streak-label">Current</span>
                </div>
                <div class="best-streak">
                  <span class="streak-value">${streak?.longestStreak || 0}</span>
                  <span class="streak-label">Best</span>
                </div>
              </div>
              ${streak?.currentStreak > 0 ? '<span class="streak-fire">🔥</span>' : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * Render challenge details modal
   */
  renderChallengeDetails(challenge) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'challenge-details-modal';
    
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <div class="challenge-detail-header">
            <span class="challenge-icon-large">${challenge.icon}</span>
            <div>
              <h3>${challenge.title}</h3>
              <span class="challenge-status ${challenge.status}">${challenge.status}</span>
            </div>
          </div>
          <button class="close-btn" onclick="gamification.closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <p class="challenge-description">${challenge.description}</p>
          
          ${challenge.rules ? `<div class="challenge-rules"><strong>Rules:</strong> ${challenge.rules}</div>` : ''}
          
          <div class="challenge-details-grid">
            <div class="detail-item">
              <span class="detail-label">Difficulty</span>
              <span class="detail-value ${challenge.difficulty}">${challenge.difficulty}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Type</span>
              <span class="detail-value">${challenge.type.replace('_', ' ')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Target</span>
              <span class="detail-value">${challenge.targetValue} ${challenge.targetUnit}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Reward</span>
              <span class="detail-value">+${challenge.rewardPoints} points</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Participants</span>
              <span class="detail-value">${challenge.participantCount}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Days Left</span>
              <span class="detail-value">${challenge.daysRemaining}</span>
            </div>
          </div>
          
          ${challenge.isParticipant ? `
            <div class="your-progress">
              <h4>Your Progress</h4>
              <div class="large-progress-bar">
                <div class="large-progress-fill" style="width: ${challenge.userProgress}%"></div>
                <span class="large-progress-text">${challenge.userProgress}%</span>
              </div>
              ${challenge.userSavedAmount > 0 ? `<p class="saved-amount">Amount saved: ₹${challenge.userSavedAmount.toLocaleString()}</p>` : ''}
              ${challenge.userStreak > 0 ? `<p class="current-streak">Current streak: ${challenge.userStreak} days 🔥</p>` : ''}
            </div>
          ` : ''}
          
          ${challenge.leaderboard?.length ? `
            <div class="challenge-leaderboard">
              <h4>Top Participants</h4>
              <div class="mini-leaderboard">
                ${challenge.leaderboard.map((p, i) => `
                  <div class="mini-lb-entry">
                    <span class="mini-rank">${i + 1}</span>
                    <span class="mini-name">${p.name}</span>
                    <span class="mini-progress">${p.progress}%</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
        <div class="modal-footer">
          ${challenge.isParticipant 
            ? `<button class="btn-danger" onclick="gamification.leaveChallenge('${challenge._id}')">Leave Challenge</button>`
            : `<button class="btn-primary" onclick="gamification.joinChallenge('${challenge._id}')">Join Challenge</button>`
          }
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  /**
   * Show create challenge modal
   */
  showCreateChallengeModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'create-challenge-modal';
    
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>🎯 Create Challenge</h3>
          <button class="close-btn" onclick="gamification.closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="template-section">
            <h4>Quick Start Templates</h4>
            <div class="templates-grid">
              ${this.templates.slice(0, 6).map(t => `
                <button class="template-btn" onclick="gamification.useTemplate('${t.title}')">
                  <span>${t.icon}</span>
                  <span>${t.title}</span>
                </button>
              `).join('')}
            </div>
          </div>
          
          <div class="divider">or create custom</div>
          
          <form id="create-challenge-form" onsubmit="gamification.handleCreateChallenge(event)">
            <div class="form-group">
              <label for="challenge-title">Title *</label>
              <input type="text" id="challenge-title" required minlength="3" maxlength="100" placeholder="e.g., No Spend Week">
            </div>
            
            <div class="form-group">
              <label for="challenge-desc">Description *</label>
              <textarea id="challenge-desc" required minlength="10" maxlength="500" placeholder="Describe your challenge..."></textarea>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label for="challenge-type">Type *</label>
                <select id="challenge-type" required>
                  <option value="no_spend">No Spend</option>
                  <option value="category_reduction">Category Reduction</option>
                  <option value="savings_target">Savings Target</option>
                  <option value="streak">Streak</option>
                  <option value="budget_adherence">Budget Adherence</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="challenge-category">Category</label>
                <select id="challenge-category">
                  <option value="all">All Categories</option>
                  <option value="food">Food</option>
                  <option value="coffee">Coffee</option>
                  <option value="dining">Dining</option>
                  <option value="transport">Transport</option>
                  <option value="entertainment">Entertainment</option>
                  <option value="shopping">Shopping</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label for="challenge-target">Target Value *</label>
                <input type="number" id="challenge-target" required min="1" placeholder="e.g., 7">
              </div>
              
              <div class="form-group">
                <label for="challenge-unit">Unit</label>
                <select id="challenge-unit">
                  <option value="days">Days</option>
                  <option value="amount">Amount (₹)</option>
                  <option value="percentage">Percentage (%)</option>
                  <option value="count">Count</option>
                </select>
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label for="challenge-start">Start Date *</label>
                <input type="date" id="challenge-start" required>
              </div>
              
              <div class="form-group">
                <label for="challenge-end">End Date *</label>
                <input type="date" id="challenge-end" required>
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label for="challenge-difficulty">Difficulty</label>
                <select id="challenge-difficulty">
                  <option value="easy">Easy</option>
                  <option value="medium" selected>Medium</option>
                  <option value="hard">Hard</option>
                  <option value="extreme">Extreme</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="challenge-points">Reward Points</label>
                <input type="number" id="challenge-points" min="10" max="1000" value="100">
              </div>
            </div>
            
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="challenge-public" checked>
                Make this challenge public
              </label>
            </div>
            
            <button type="submit" class="btn-primary btn-full">Create Challenge</button>
          </form>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('challenge-start').min = today;
    document.getElementById('challenge-start').value = today;
    
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    document.getElementById('challenge-end').min = today;
    document.getElementById('challenge-end').value = nextWeek.toISOString().split('T')[0];
  }

  /**
   * Use template to fill form
   */
  useTemplate(templateTitle) {
    const template = this.templates.find(t => t.title === templateTitle);
    if (!template) return;
    
    document.getElementById('challenge-title').value = template.title;
    document.getElementById('challenge-desc').value = template.description;
    document.getElementById('challenge-type').value = template.type;
    document.getElementById('challenge-category').value = template.category || 'all';
    document.getElementById('challenge-target').value = template.targetValue;
    document.getElementById('challenge-unit').value = template.targetUnit;
    document.getElementById('challenge-difficulty').value = template.difficulty;
    document.getElementById('challenge-points').value = template.rewardPoints;
    
    // Update end date based on suggested duration
    if (template.suggestedDuration) {
      const startDate = new Date(document.getElementById('challenge-start').value);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + template.suggestedDuration);
      document.getElementById('challenge-end').value = endDate.toISOString().split('T')[0];
    }
  }

  /**
   * Handle create challenge form submission
   */
  async handleCreateChallenge(event) {
    event.preventDefault();
    
    const challengeData = {
      title: document.getElementById('challenge-title').value,
      description: document.getElementById('challenge-desc').value,
      type: document.getElementById('challenge-type').value,
      category: document.getElementById('challenge-category').value,
      targetValue: parseInt(document.getElementById('challenge-target').value),
      targetUnit: document.getElementById('challenge-unit').value,
      startDate: new Date(document.getElementById('challenge-start').value).toISOString(),
      endDate: new Date(document.getElementById('challenge-end').value).toISOString(),
      difficulty: document.getElementById('challenge-difficulty').value,
      rewardPoints: parseInt(document.getElementById('challenge-points').value),
      isPublic: document.getElementById('challenge-public').checked
    };
    
    await this.createChallenge(challengeData);
  }

  /**
   * Close modal
   */
  closeModal() {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(m => m.remove());
  }

  // ==================== ANIMATIONS & NOTIFICATIONS ====================

  /**
   * Show points animation
   */
  showPointsAnimation(points, reason) {
    const animation = document.createElement('div');
    animation.className = 'points-animation';
    animation.innerHTML = `+${points} pts`;
    animation.style.cssText = `
      position: fixed;
      top: 20%;
      left: 50%;
      transform: translateX(-50%);
      font-size: 2rem;
      font-weight: bold;
      color: #FFD700;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
      animation: floatUp 2s ease-out forwards;
      z-index: 10000;
    `;
    
    document.body.appendChild(animation);
    
    setTimeout(() => animation.remove(), 2000);
  }

  /**
   * Show achievement unlocked
   */
  showAchievementUnlocked(achievement) {
    const popup = document.createElement('div');
    popup.className = 'achievement-popup';
    popup.innerHTML = `
      <div class="achievement-popup-content">
        <span class="achievement-popup-icon">${achievement.icon}</span>
        <div class="achievement-popup-info">
          <span class="achievement-popup-label">Achievement Unlocked!</span>
          <span class="achievement-popup-name">${achievement.name}</span>
          <span class="achievement-popup-points">+${achievement.points} points</span>
        </div>
      </div>
    `;
    
    document.body.appendChild(popup);
    
    setTimeout(() => {
      popup.classList.add('fade-out');
      setTimeout(() => popup.remove(), 500);
    }, 4000);
  }

  /**
   * Show challenge completed
   */
  showChallengeCompleted(data) {
    const popup = document.createElement('div');
    popup.className = 'challenge-complete-popup';
    popup.innerHTML = `
      <div class="challenge-complete-content">
        <span class="complete-icon">🎉</span>
        <h3>Challenge Completed!</h3>
        <p>${data.challengeTitle}</p>
        <span class="complete-points">+${data.points} points</span>
      </div>
    `;
    
    document.body.appendChild(popup);
    
    setTimeout(() => {
      popup.classList.add('fade-out');
      setTimeout(() => popup.remove(), 500);
    }, 5000);
  }

  /**
   * Show challenge invitation
   */
  showChallengeInvitation(data) {
    this.showNotification(
      `${data.invitedBy} invited you to "${data.challengeTitle}"`,
      'info',
      () => this.getChallengeDetails(data.challengeId)
    );
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'info', onClick = null) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    if (onClick) {
      notification.style.cursor = 'pointer';
      notification.addEventListener('click', onClick);
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // ==================== UTILITY METHODS ====================

  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  }

  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  filterDiscoverChallenges() {
    const type = document.getElementById('filter-type').value;
    const difficulty = document.getElementById('filter-difficulty').value;
    
    this.discoverChallenges({ type, difficulty });
  }
}

// Initialize
const gamification = new GamificationManager();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GamificationManager };
}
