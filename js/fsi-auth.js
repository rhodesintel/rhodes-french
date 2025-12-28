/**
 * FSI Course - Google Sheets Analytics
 * Simple webhook-based analytics - no complex auth required
 *
 * SETUP:
 * 1. Create Google Sheet "FSI French Analytics"
 * 2. Extensions → Apps Script → paste google-apps-script.js
 * 3. Deploy → New deployment → Web app → Anyone can access
 * 4. Copy URL and paste below
 */

const FSI_Auth = {
  // Google Sheets webhook URL - DISABLED (using local storage only)
  // To enable: paste your deployed Apps Script web app URL here
  SHEETS_WEBHOOK_URL: '',  // Disabled - local storage works fine

  // API key for webhook authentication (must match google-apps-script.js)
  API_KEY: 'rhodes-french-2024-x7k9m',

  // State
  initialized: false,
  userId: null,
  pendingWrites: [],
  syncInterval: null,

  // For compatibility with existing code
  firestoreEnabled: false,
  authEnabled: false,
  user: null,

  // Initialize
  async init() {
    // Generate anonymous user ID if not exists
    this.userId = localStorage.getItem('fsi_user_id');
    if (!this.userId) {
      this.userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('fsi_user_id', this.userId);
    }

    // Load pending writes from storage
    try {
      const pending = localStorage.getItem('fsi_pending_writes');
      if (pending) {
        this.pendingWrites = JSON.parse(pending);
      }
    } catch (e) {}

    this.initialized = true;

    // Flush any pending writes
    if (this.SHEETS_WEBHOOK_URL && this.pendingWrites.length > 0) {
      this.flushPendingWrites();
    }

    // Sync every 60 seconds
    this.syncInterval = setInterval(() => this.flushPendingWrites(), 60000);

    // Update SRS with user ID
    if (typeof FSI_SRS !== 'undefined') {
      FSI_SRS.setUserId(this.userId);
    }

    console.log('Analytics initialized:', this.userId);
    console.log('Sheets sync:', this.SHEETS_WEBHOOK_URL ? 'configured' : 'not configured (local only)');

    this.updateUI();
    return this;
  },

  // Check if sheets sync is configured
  isConfigured() {
    return !!this.SHEETS_WEBHOOK_URL;
  },

  // Save a response to Google Sheets
  async saveResponse(response) {
    const payload = {
      type: 'response',
      apiKey: this.API_KEY,
      payload: {
        ...response,
        userId: this.userId
      }
    };

    if (!this.SHEETS_WEBHOOK_URL) {
      // Queue for later if not configured
      this.pendingWrites.push(payload);
      this.savePendingWrites();
      console.log('Response queued (sheets not configured)');
      return false;
    }

    try {
      const res = await fetch(this.SHEETS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow'  // Apps Script may redirect
      });

      // Verify the response
      if (res.ok) {
        try {
          const data = await res.json();
          if (data.success) {
            console.log('Response saved to sheets:', data.timestamp);
            return true;
          } else {
            console.warn('Sheets API error:', data.error);
            this.pendingWrites.push(payload);
            this.savePendingWrites();
            return false;
          }
        } catch (parseErr) {
          // Response wasn't JSON but request may have succeeded
          console.log('Response sent to sheets (no JSON response)');
          return true;
        }
      } else {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (e) {
      console.warn('Failed to save to sheets:', e.message);
      this.pendingWrites.push(payload);
      this.savePendingWrites();
      this.showSyncError('Failed to sync response');
      return false;
    }
  },

  // Save progress summary
  async saveProgress(progressData) {
    const payload = {
      type: 'progress',
      apiKey: this.API_KEY,
      payload: {
        ...progressData,
        userId: this.userId
      }
    };

    if (!this.SHEETS_WEBHOOK_URL) return false;

    try {
      const res = await fetch(this.SHEETS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.success !== false;
      }
      return false;
    } catch (e) {
      console.warn('Failed to save progress:', e.message);
      return false;
    }
  },

  // Show sync error indicator (non-blocking)
  showSyncError(msg) {
    const indicator = document.getElementById('saveIndicator');
    if (indicator) {
      indicator.textContent = 'Sync failed';
      indicator.style.color = '#dc3545';
      indicator.classList.add('show');
      setTimeout(() => {
        indicator.classList.remove('show');
        indicator.style.color = '#28a745';
        indicator.textContent = 'Saved';
      }, 3000);
    }
  },

  // Flush pending writes
  async flushPendingWrites() {
    if (!this.SHEETS_WEBHOOK_URL || this.pendingWrites.length === 0) return;

    console.log(`Syncing ${this.pendingWrites.length} pending writes to sheets...`);

    const toSend = [...this.pendingWrites];
    this.pendingWrites = [];
    this.savePendingWrites();

    let successCount = 0;
    for (const payload of toSend) {
      try {
        const res = await fetch(this.SHEETS_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          redirect: 'follow'
        });

        if (res.ok) {
          successCount++;
        } else {
          this.pendingWrites.push(payload);
        }
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        // Re-queue failed writes
        this.pendingWrites.push(payload);
      }
    }

    this.savePendingWrites();
    console.log(`Sync complete: ${successCount}/${toSend.length} succeeded, ${this.pendingWrites.length} pending`);
  },

  // Save pending writes to localStorage
  savePendingWrites() {
    try {
      localStorage.setItem('fsi_pending_writes', JSON.stringify(this.pendingWrites));
    } catch (e) {
      console.error('Failed to save pending writes:', e.message);
      // If localStorage is full, clear old pending writes to make room
      if (e.name === 'QuotaExceededError') {
        console.warn('Storage quota exceeded, clearing old pending writes');
        this.pendingWrites = this.pendingWrites.slice(-50);  // Keep only last 50
        try {
          localStorage.setItem('fsi_pending_writes', JSON.stringify(this.pendingWrites));
        } catch (e2) {
          // Give up
          this.pendingWrites = [];
        }
      }
    }
  },

  // Get user ID
  getUserId() {
    return this.userId;
  },

  // Update UI
  updateUI() {
    // Hide auth section - we use anonymous tracking
    const authSection = document.getElementById('authSection');
    if (authSection) authSection.style.display = 'none';

    const authBtn = document.getElementById('authBtn');
    if (authBtn) authBtn.style.display = 'none';

    const userInfo = document.getElementById('userInfo');
    if (userInfo) userInfo.style.display = 'none';
  },

  // Compatibility stubs
  initFirestore() { return false; },
  signInWithGoogle() { return null; },
  signInWithEmail() { return null; },
  createAccount() { return null; },
  signOut() {},
  getUser() { return null; },
  isSignedIn() { return false; },
  getUserProfile() { return { uid: this.userId, email: null, displayName: 'Anonymous' }; }
};

// Export
if (typeof module !== 'undefined') {
  module.exports = FSI_Auth;
}
