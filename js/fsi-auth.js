/**
 * Rhodes French - Cloud Storage via JSONbin.io
 *
 * Stores all user data in a single bin:
 * { users: { "userId1": {...}, "userId2": {...} } }
 *
 * Setup:
 * 1. Go to https://jsonbin.io and sign up (free)
 * 2. Copy your X-Access-Key from the dashboard
 * 3. Paste it below as JSONBIN_API_KEY
 * 4. The bin will be auto-created on first save
 */

const FSI_Auth = {
  // JSONbin.io config
  JSONBIN_API_KEY: '$2b$10$YOUR_API_KEY_HERE',  // Get from jsonbin.io dashboard
  JSONBIN_BIN_ID: null,  // Auto-created, then saved to localStorage
  JSONBIN_URL: 'https://api.jsonbin.io/v3/b',

  // State
  initialized: false,
  userId: null,
  pendingWrites: [],
  syncInterval: null,

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Get or create user ID
    this.userId = localStorage.getItem('fsi_user_id');
    if (!this.userId) {
      this.userId = 'user_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('fsi_user_id', this.userId);
    }

    // Get bin ID if we created one before
    this.JSONBIN_BIN_ID = localStorage.getItem('fsi_jsonbin_id');

    // Load pending writes
    try {
      const pending = localStorage.getItem('fsi_pending_writes');
      if (pending) this.pendingWrites = JSON.parse(pending);
    } catch (e) {}

    // Sync pending writes periodically
    this.syncInterval = setInterval(() => this.flushPendingWrites(), 60000);

    console.log('FSI_Auth initialized, userId:', this.userId);
  },

  isConfigured() {
    return this.JSONBIN_API_KEY && !this.JSONBIN_API_KEY.includes('YOUR_API_KEY');
  },

  // Save a response (error or correct answer)
  async saveResponse(response) {
    if (!this.isConfigured()) {
      console.log('JSONbin not configured, data saved locally only');
      return false;
    }

    const record = {
      timestamp: new Date().toISOString(),
      ...response,
      userId: this.userId
    };

    this.pendingWrites.push(record);
    this.savePendingWrites();

    // Try to sync immediately if we have a few items
    if (this.pendingWrites.length >= 5) {
      this.flushPendingWrites();
    }

    return true;
  },

  // Flush pending writes to JSONbin
  async flushPendingWrites() {
    if (!this.isConfigured() || this.pendingWrites.length === 0) return;

    const toSend = [...this.pendingWrites];
    this.pendingWrites = [];
    this.savePendingWrites();

    try {
      // Get or create bin
      let binData = await this.getBinData();
      if (!binData) {
        binData = { users: {} };
      }

      // Ensure user exists
      if (!binData.users[this.userId]) {
        binData.users[this.userId] = { responses: [], created: new Date().toISOString() };
      }

      // Add new responses
      binData.users[this.userId].responses.push(...toSend);
      binData.users[this.userId].lastSync = new Date().toISOString();

      // Keep only last 500 responses per user to stay under size limits
      if (binData.users[this.userId].responses.length > 500) {
        binData.users[this.userId].responses =
          binData.users[this.userId].responses.slice(-500);
      }

      // Save back to bin
      await this.saveBinData(binData);
      console.log(`Synced ${toSend.length} responses to cloud`);

    } catch (e) {
      console.warn('Cloud sync failed:', e.message);
      // Re-queue failed items
      this.pendingWrites = [...toSend, ...this.pendingWrites];
      this.savePendingWrites();
    }
  },

  // Get data from JSONbin
  async getBinData() {
    if (!this.JSONBIN_BIN_ID) return null;

    const res = await fetch(`${this.JSONBIN_URL}/${this.JSONBIN_BIN_ID}/latest`, {
      headers: {
        'X-Access-Key': this.JSONBIN_API_KEY
      }
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`JSONbin GET failed: ${res.status}`);
    }

    const data = await res.json();
    return data.record;
  },

  // Save data to JSONbin
  async saveBinData(data) {
    if (this.JSONBIN_BIN_ID) {
      // Update existing bin
      const res = await fetch(`${this.JSONBIN_URL}/${this.JSONBIN_BIN_ID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Key': this.JSONBIN_API_KEY
        },
        body: JSON.stringify(data)
      });

      if (!res.ok) throw new Error(`JSONbin PUT failed: ${res.status}`);
    } else {
      // Create new bin
      const res = await fetch(this.JSONBIN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Key': this.JSONBIN_API_KEY,
          'X-Bin-Name': 'rhodes-french-data'
        },
        body: JSON.stringify(data)
      });

      if (!res.ok) throw new Error(`JSONbin POST failed: ${res.status}`);

      const result = await res.json();
      this.JSONBIN_BIN_ID = result.metadata.id;
      localStorage.setItem('fsi_jsonbin_id', this.JSONBIN_BIN_ID);
      console.log('Created JSONbin:', this.JSONBIN_BIN_ID);
    }
  },

  // Save pending writes to localStorage
  savePendingWrites() {
    try {
      localStorage.setItem('fsi_pending_writes', JSON.stringify(this.pendingWrites));
    } catch (e) {
      console.warn('Failed to save pending writes');
    }
  },

  getUserId() {
    return this.userId;
  },

  // Stub methods for compatibility
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
