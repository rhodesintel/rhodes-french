/**
 * Rhodes French - Analytics Collection
 * Collects anonymized error data to improve the course
 * Uses JSONbin.io for free cloud storage
 */

const FSI_Analytics = {
  // JSONbin.io endpoint - stores all user errors for analysis
  JSONBIN_URL: 'https://api.jsonbin.io/v3/b',
  BIN_ID: null,  // Will be set after creating bin
  API_KEY: '$2a$10$placeholder',  // Get free key from jsonbin.io

  // Queue errors and batch send every 30 seconds
  errorQueue: [],
  sendInterval: null,

  init() {
    // Send queued errors every 30 seconds
    this.sendInterval = setInterval(() => this.flush(), 30000);
    // Also send on page unload
    window.addEventListener('beforeunload', () => this.flush());
  },

  // Log an error for analytics
  logError(data) {
    this.errorQueue.push({
      timestamp: new Date().toISOString(),
      drillId: data.drillId,
      unit: data.unit,
      expected: data.expected,
      userAnswer: data.userAnswer,
      errorType: data.errorType,
      // No user ID - completely anonymous
    });

    // Send immediately if queue is large
    if (this.errorQueue.length >= 10) {
      this.flush();
    }
  },

  // Send queued errors to storage
  async flush() {
    if (this.errorQueue.length === 0) return;

    const errors = [...this.errorQueue];
    this.errorQueue = [];

    try {
      // For now, just log to console until JSONbin is set up
      console.log('Analytics:', errors.length, 'errors collected');

      // Uncomment when JSONbin is configured:
      // await this.sendToJSONbin(errors);

    } catch (e) {
      // Re-queue on failure
      this.errorQueue = [...errors, ...this.errorQueue];
      console.warn('Analytics send failed:', e.message);
    }
  },

  async sendToJSONbin(errors) {
    if (!this.BIN_ID || !this.API_KEY) return;

    // Get existing data
    const res = await fetch(`${this.JSONBIN_URL}/${this.BIN_ID}/latest`, {
      headers: { 'X-Access-Key': this.API_KEY }
    });
    const existing = res.ok ? (await res.json()).record : { errors: [] };

    // Append new errors
    existing.errors = [...(existing.errors || []), ...errors];

    // Keep only last 10000 errors
    if (existing.errors.length > 10000) {
      existing.errors = existing.errors.slice(-10000);
    }

    // Update bin
    await fetch(`${this.JSONBIN_URL}/${this.BIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Key': this.API_KEY
      },
      body: JSON.stringify(existing)
    });
  }
};

// Auto-init
if (typeof window !== 'undefined') {
  FSI_Analytics.init();
}

// Export
if (typeof module !== 'undefined') {
  module.exports = FSI_Analytics;
}
