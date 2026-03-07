// user-preferences.js
// Handles user preferences for rebalancing and trading

class UserPreferences {
    constructor(userId, preferences = {}) {
        this.userId = userId;
        this.preferences = preferences;
    }

    setPreference(key, value) {
        this.preferences[key] = value;
    }

    getPreference(key) {
        return this.preferences[key];
    }

    getAllPreferences() {
        return this.preferences;
    }
}

module.exports = UserPreferences;
