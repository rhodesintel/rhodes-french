/**
 * Rhodes French - Cloud Storage via npoint.io
 * Simple, free, no authentication required
 */

const FSI_Auth = {
  // npoint.io bin ID - get from https://npoint.io
  BIN_ID: 'a2f571b90cbc4a09707f',

  // API endpoint
  NPOINT_URL: 'https://api.npoint.io',

  // State
  initialized: false,
  userId: null,
  cloudData: null,
  saveQueue: [],
  saveTimeout: null,

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Get or create user ID
    this.userId = localStorage.getItem('fsi_user_id');
    if (!this.userId) {
      this.userId = 'user_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('fsi_user_id', this.userId);
    }

    // Load cloud data if configured
    if (this.isConfigured()) {
      await this.loadFromCloud();
    }

    console.log('FSI_Auth initialized, userId:', this.userId,
                'cloud:', this.isConfigured() ? 'enabled' : 'disabled');
  },

  isConfigured() {
    return !!(this.BIN_ID && this.BIN_ID !== '');
  },

  // Load data from npoint.io
  async loadFromCloud() {
    try {
      const res = await fetch(`${this.NPOINT_URL}/${this.BIN_ID}`);
      if (res.ok) {
        this.cloudData = await res.json();
        console.log('Loaded cloud data:', Object.keys(this.cloudData.users || {}).length, 'users');
      } else {
        console.warn('Cloud load failed:', res.status);
        this.cloudData = { users: {} };
      }
    } catch (e) {
      console.warn('Cloud load error:', e.message);
      this.cloudData = { users: {} };
    }
  },

  // Save response to cloud (batched)
  async saveResponse(response) {
    if (!this.isConfigured()) {
      console.log('Cloud not configured - skipping save');
      return false;
    }

    // Add to queue
    this.saveQueue.push({
      timestamp: new Date().toISOString(),
      userId: this.userId,
      ...response
    });

    // Debounce saves (batch within 2 seconds)
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.flushQueue(), 2000);

    return true;
  },

  async flushQueue() {
    if (this.saveQueue.length === 0) return;

    const toSave = [...this.saveQueue];
    this.saveQueue = [];

    try {
      // Reload latest data first to avoid overwrites
      await this.loadFromCloud();

      // Ensure cloudData structure
      if (!this.cloudData) this.cloudData = { users: {} };
      if (!this.cloudData.users) this.cloudData.users = {};
      if (!this.cloudData.users[this.userId]) {
        this.cloudData.users[this.userId] = {
          responses: [],
          created: new Date().toISOString()
        };
      }

      // Add responses
      this.cloudData.users[this.userId].responses.push(...toSave);
      this.cloudData.users[this.userId].lastUpdate = new Date().toISOString();

      // Keep only last 500 responses per user
      const responses = this.cloudData.users[this.userId].responses;
      if (responses.length > 500) {
        this.cloudData.users[this.userId].responses = responses.slice(-500);
      }

      // Save to cloud
      await this.saveToCloud();
      console.log('Saved', toSave.length, 'responses to cloud');

    } catch (e) {
      console.warn('Cloud save error:', e.message);
      // Re-queue on failure
      this.saveQueue = [...toSave, ...this.saveQueue];
    }
  },

  async saveToCloud() {
    const res = await fetch(`${this.NPOINT_URL}/${this.BIN_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(this.cloudData)
    });

    if (!res.ok) {
      throw new Error('Failed to save: ' + res.status);
    }

    return true;
  },

  // Compatibility methods
  getUserId() { return this.userId; },
  getUser() { return null; },
  isSignedIn() { return false; },
  getUserProfile() {
    return { uid: this.userId, email: null, displayName: 'Anonymous' };
  }
};

// Auto-init
if (typeof window !== 'undefined') {
  FSI_Auth.init();
}

// Export
if (typeof module !== 'undefined') {
  module.exports = FSI_Auth;
}
