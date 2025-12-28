/**
 * Rhodes French - Firebase Auth + Firestore
 * Google sign-in with cloud storage
 */

const FSI_Auth = {
  // Firebase config
  firebaseConfig: {
    apiKey: "AIzaSyCBBnsOhx2Yq5hYFXuFddoKiIkk_mTimQE",
    authDomain: "rhodes-french-b3e2e.firebaseapp.com",
    projectId: "rhodes-french-b3e2e",
    storageBucket: "rhodes-french-b3e2e.firebasestorage.app",
    messagingSenderId: "633559429572",
    appId: "1:633559429572:web:4673318365851b0553f491"
  },

  // State
  app: null,
  auth: null,
  db: null,
  user: null,
  initialized: false,
  saveQueue: [],
  saveTimeout: null,

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Initialize Firebase
    if (typeof firebase !== 'undefined') {
      this.app = firebase.initializeApp(this.firebaseConfig);
      this.auth = firebase.auth();
      this.db = firebase.firestore();

      // Listen for auth changes
      this.auth.onAuthStateChanged((user) => {
        this.user = user;
        if (user) {
          console.log('Signed in as:', user.email);
          this.updateSignInUI(true);
        } else {
          console.log('Not signed in');
          this.updateSignInUI(false);
        }
      });

      console.log('Firebase initialized');
    } else {
      console.warn('Firebase SDK not loaded');
    }
  },

  // Sign in with Google
  async signIn() {
    if (!this.auth) return;
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await this.auth.signInWithPopup(provider);
    } catch (e) {
      console.error('Sign in failed:', e.message);
      alert('Sign in failed: ' + e.message);
    }
  },

  // Sign out
  async signOut() {
    if (!this.auth) return;
    try {
      await this.auth.signOut();
    } catch (e) {
      console.error('Sign out failed:', e.message);
    }
  },

  // Update UI based on sign-in state
  updateSignInUI(signedIn) {
    const btn = document.getElementById('auth-btn');
    if (!btn) return;

    if (signedIn && this.user) {
      btn.textContent = `${this.user.displayName || this.user.email} (Sign Out)`;
      btn.onclick = () => this.signOut();
    } else {
      btn.textContent = 'Sign In with Google';
      btn.onclick = () => this.signIn();
    }
  },

  isConfigured() {
    return !!(this.db && this.user);
  },

  isSignedIn() {
    return !!this.user;
  },

  getUserId() {
    return this.user?.uid || localStorage.getItem('fsi_user_id') || this.createAnonId();
  },

  createAnonId() {
    const id = 'anon_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('fsi_user_id', id);
    return id;
  },

  getUser() {
    return this.user;
  },

  getUserProfile() {
    if (this.user) {
      return {
        uid: this.user.uid,
        email: this.user.email,
        displayName: this.user.displayName
      };
    }
    return { uid: this.getUserId(), email: null, displayName: 'Anonymous' };
  },

  // Save response to Firestore (batched)
  async saveResponse(response) {
    // Add to queue
    this.saveQueue.push({
      timestamp: new Date().toISOString(),
      ...response
    });

    // Debounce saves (batch within 2 seconds)
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.flushQueue(), 2000);

    return true;
  },

  async flushQueue() {
    if (this.saveQueue.length === 0) return;
    if (!this.db) {
      console.log('Firestore not available - responses not saved to cloud');
      this.saveQueue = [];
      return;
    }

    const toSave = [...this.saveQueue];
    this.saveQueue = [];
    const userId = this.getUserId();

    try {
      const batch = this.db.batch();
      const userRef = this.db.collection('users').doc(userId);

      // Create/update user doc
      batch.set(userRef, {
        lastUpdate: firebase.firestore.FieldValue.serverTimestamp(),
        email: this.user?.email || null,
        displayName: this.user?.displayName || 'Anonymous'
      }, { merge: true });

      // Add responses as subcollection
      for (const response of toSave) {
        const responseRef = userRef.collection('responses').doc();
        batch.set(responseRef, {
          ...response,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      await batch.commit();
      console.log('Saved', toSave.length, 'responses to Firestore');

    } catch (e) {
      console.warn('Firestore save error:', e.message);
      // Re-queue on failure
      this.saveQueue = [...toSave, ...this.saveQueue];
    }
  },

  // Load user progress from Firestore (SOURCE OF TRUTH for signed-in users)
  async loadProgress() {
    if (!this.db || !this.user) return null;

    try {
      const doc = await this.db.collection('users').doc(this.user.uid).get();
      if (doc.exists) {
        const data = doc.data();
        console.log('Loaded progress from cloud:', Object.keys(data.cards || {}).length, 'cards');
        return data;
      }
    } catch (e) {
      console.warn('Failed to load progress from cloud:', e.message);
    }
    return null;
  },

  // Save full progress to Firestore (called on every review for signed-in users)
  async saveProgress(progressData) {
    if (!this.db || !this.user) return false;

    try {
      await this.db.collection('users').doc(this.user.uid).set({
        ...progressData,
        lastUpdate: firebase.firestore.FieldValue.serverTimestamp(),
        email: this.user.email,
        displayName: this.user.displayName
      }, { merge: true });
      console.log('Progress saved to cloud');
      return true;
    } catch (e) {
      console.warn('Failed to save progress to cloud:', e.message);
      return false;
    }
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
