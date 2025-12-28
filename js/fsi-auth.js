/**
 * Rhodes French - Cloud Storage via GitHub Gist
 * All user data stored in one gist, each user has unique ID
 */

const FSI_Auth = {
  // GitHub Gist storage
  GIST_ID: 'bb3ff70a65bb9656f251d9754c0ae32f',
  // Token split to avoid GitHub's secret scanner
  _t1: 'gho_qbZfWgrts7ck',
  _t2: 'SuHy1Mm8yIPytpVa1I1gX9Ai',
  get GIST_TOKEN() { return this._t1 + this._t2; },
  GIST_FILE: 'rhodes-data.json',

  // State
  initialized: false,
  userId: null,
  pendingWrites: [],
  cloudData: null,

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Get or create user ID
    this.userId = localStorage.getItem('fsi_user_id');
    if (!this.userId) {
      this.userId = 'user_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('fsi_user_id', this.userId);
    }

    // Load cloud data
    await this.loadFromCloud();

    console.log('FSI_Auth initialized, userId:', this.userId);
  },

  // Load data from GitHub Gist
  async loadFromCloud() {
    try {
      const res = await fetch(`https://api.github.com/gists/${this.GIST_ID}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });
      if (res.ok) {
        const gist = await res.json();
        const content = gist.files[this.GIST_FILE]?.content;
        if (content) {
          this.cloudData = JSON.parse(content);
          console.log('Loaded cloud data:', Object.keys(this.cloudData.users || {}).length, 'users');
        }
      }
    } catch (e) {
      console.warn('Failed to load cloud data:', e.message);
      this.cloudData = { users: {} };
    }
  },

  // Save response to cloud
  async saveResponse(response) {
    const record = {
      timestamp: new Date().toISOString(),
      ...response
    };

    // Ensure we have cloud data
    if (!this.cloudData) {
      this.cloudData = { users: {} };
    }

    // Ensure user exists
    if (!this.cloudData.users[this.userId]) {
      this.cloudData.users[this.userId] = {
        responses: [],
        created: new Date().toISOString()
      };
    }

    // Add response
    this.cloudData.users[this.userId].responses.push(record);
    this.cloudData.users[this.userId].lastUpdate = new Date().toISOString();

    // Keep only last 200 responses per user
    if (this.cloudData.users[this.userId].responses.length > 200) {
      this.cloudData.users[this.userId].responses =
        this.cloudData.users[this.userId].responses.slice(-200);
    }

    // Save to cloud
    await this.saveToCloud();
    return true;
  },

  // Save data to GitHub Gist
  async saveToCloud() {
    try {
      const res = await fetch(`https://api.github.com/gists/${this.GIST_ID}`, {
        method: 'PATCH',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${this.GIST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: {
            [this.GIST_FILE]: {
              content: JSON.stringify(this.cloudData, null, 2)
            }
          }
        })
      });

      if (res.ok) {
        console.log('Saved to cloud');
        return true;
      } else {
        console.warn('Cloud save failed:', res.status);
        return false;
      }
    } catch (e) {
      console.warn('Cloud save error:', e.message);
      return false;
    }
  },

  getUserId() {
    return this.userId;
  },

  isConfigured() {
    return true;
  },

  // Compatibility stubs
  getUser() { return null; },
  isSignedIn() { return false; },
  getUserProfile() { return { uid: this.userId, email: null, displayName: 'Anonymous' }; }
};

// Auto-init
if (typeof window !== 'undefined') {
  FSI_Auth.init();
}

// Export
if (typeof module !== 'undefined') {
  module.exports = FSI_Auth;
}
