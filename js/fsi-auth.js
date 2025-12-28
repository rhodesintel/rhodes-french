/**
 * FSI Course - Firebase Authentication (Optional)
 * Google Sign-In for user profiles and analytics sync
 *
 * IMPORTANT: This is completely optional. The app works fully without auth.
 * If Firebase fails to load (e.g., in extension context), everything still works.
 */

const FSI_Auth = {
  // Firebase config - Replace with your Firebase project config
  // Get these from: Firebase Console > Project Settings > Your apps > Web app
  firebaseConfig: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
  },

  // State
  user: null,
  initialized: false,
  authEnabled: false,  // Whether Firebase auth is available

  // Initialize Firebase (optional - fails gracefully)
  async init() {
    // Check if Firebase is loaded
    if (typeof firebase === 'undefined') {
      console.log('Firebase SDK not loaded - running in offline/extension mode');
      this.initialized = true;
      this.authEnabled = false;
      this.updateUI(false);
      return this;
    }

    // Check if config is set up
    if (this.firebaseConfig.apiKey === "YOUR_API_KEY") {
      console.log('Firebase not configured - running in offline mode');
      this.initialized = true;
      this.authEnabled = false;
      this.updateUI(false);
      return this;
    }

    try {
      // Initialize Firebase if not already done
      if (!firebase.apps.length) {
        firebase.initializeApp(this.firebaseConfig);
      }
      this.authEnabled = true;
    } catch (e) {
      console.warn('Firebase init failed - running in offline mode:', e.message);
      this.initialized = true;
      this.authEnabled = false;
      this.updateUI(false);
      return this;
    }

    // Listen for auth state changes
    firebase.auth().onAuthStateChanged((user) => {
      this.user = user;
      if (user) {
        console.log('User signed in:', user.email);
        // Update SRS with user ID
        if (typeof FSI_SRS !== 'undefined') {
          FSI_SRS.setUserId(user.uid);
        }
        this.updateUI(true);
      } else {
        console.log('User signed out');
        if (typeof FSI_SRS !== 'undefined') {
          FSI_SRS.setUserId(null);
        }
        this.updateUI(false);
      }
    });

    this.initialized = true;
    return this;
  },

  // Sign in with Google
  async signInWithGoogle() {
    if (!this.authEnabled) {
      console.warn('Auth not available');
      return null;
    }

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await firebase.auth().signInWithPopup(provider);
      return result.user;
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  },

  // Sign in with email/password
  async signInWithEmail(email, password) {
    if (!this.authEnabled) {
      console.warn('Auth not available');
      return null;
    }

    try {
      const result = await firebase.auth().signInWithEmailAndPassword(email, password);
      return result.user;
    } catch (error) {
      console.error('Email sign-in error:', error);
      throw error;
    }
  },

  // Create account with email/password
  async createAccount(email, password) {
    if (!this.authEnabled) {
      console.warn('Auth not available');
      return null;
    }

    try {
      const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
      return result.user;
    } catch (error) {
      console.error('Account creation error:', error);
      throw error;
    }
  },

  // Sign out
  async signOut() {
    if (!this.authEnabled) return;

    try {
      await firebase.auth().signOut();
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  },

  // Get current user
  getUser() {
    return this.user;
  },

  // Check if signed in
  isSignedIn() {
    return !!this.user;
  },

  // Get user profile data
  getUserProfile() {
    if (!this.user) return null;

    return {
      uid: this.user.uid,
      email: this.user.email,
      displayName: this.user.displayName,
      photoURL: this.user.photoURL,
      provider: this.user.providerData[0]?.providerId || 'unknown'
    };
  },

  // Update UI based on auth state
  updateUI(signedIn) {
    const authBtn = document.getElementById('authBtn');
    const userInfo = document.getElementById('userInfo');
    const authSection = document.getElementById('authSection');

    // Hide auth UI entirely if auth not available
    if (!this.authEnabled) {
      if (authBtn) authBtn.style.display = 'none';
      if (userInfo) userInfo.style.display = 'none';
      if (authSection) authSection.style.display = 'none';
      return;
    }

    if (!authBtn) return;

    // Show auth section
    if (authSection) authSection.style.display = 'block';
    authBtn.style.display = 'inline-block';

    if (signedIn && this.user) {
      authBtn.textContent = 'Sign Out';
      authBtn.onclick = () => this.signOut();

      if (userInfo) {
        const photo = this.user.photoURL
          ? `<img src="${this.user.photoURL}" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:8px;">`
          : '';
        userInfo.innerHTML = `${photo}${this.user.displayName || this.user.email}`;
        userInfo.style.display = 'inline-block';
      }
    } else {
      authBtn.textContent = 'Sign In';
      authBtn.onclick = () => this.showAuthModal();

      if (userInfo) {
        userInfo.style.display = 'none';
      }
    }
  },

  // Show auth modal
  showAuthModal() {
    // Create modal if doesn't exist
    let modal = document.getElementById('authModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'authModal';
      modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;">
          <div style="background:white;padding:30px;border:3px solid #333;max-width:400px;width:90%;">
            <h2 style="margin:0 0 20px 0;font-family:'VT323',monospace;">Sign In</h2>

            <button id="googleSignInBtn" style="width:100%;padding:15px;font-size:18px;cursor:pointer;border:2px solid #333;background:#4285f4;color:white;margin-bottom:15px;font-family:inherit;">
              <span style="margin-right:10px;">G</span> Sign in with Google
            </button>

            <div style="text-align:center;margin:15px 0;color:#666;">or</div>

            <input type="email" id="authEmail" placeholder="Email" style="width:100%;padding:12px;font-size:16px;border:2px solid #333;margin-bottom:10px;box-sizing:border-box;font-family:inherit;">
            <input type="password" id="authPassword" placeholder="Password" style="width:100%;padding:12px;font-size:16px;border:2px solid #333;margin-bottom:15px;box-sizing:border-box;font-family:inherit;">

            <div style="display:flex;gap:10px;">
              <button id="emailSignInBtn" style="flex:1;padding:12px;font-size:16px;cursor:pointer;border:2px solid #333;background:#002395;color:white;font-family:inherit;">Sign In</button>
              <button id="emailSignUpBtn" style="flex:1;padding:12px;font-size:16px;cursor:pointer;border:2px solid #333;background:white;font-family:inherit;">Create Account</button>
            </div>

            <div id="authError" style="color:red;margin-top:15px;display:none;"></div>

            <button id="closeAuthModal" style="position:absolute;top:10px;right:15px;background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Wire up buttons
      document.getElementById('googleSignInBtn').onclick = async () => {
        try {
          await this.signInWithGoogle();
          modal.remove();
        } catch (e) {
          document.getElementById('authError').textContent = e.message;
          document.getElementById('authError').style.display = 'block';
        }
      };

      document.getElementById('emailSignInBtn').onclick = async () => {
        const email = document.getElementById('authEmail').value;
        const password = document.getElementById('authPassword').value;
        try {
          await this.signInWithEmail(email, password);
          modal.remove();
        } catch (e) {
          document.getElementById('authError').textContent = e.message;
          document.getElementById('authError').style.display = 'block';
        }
      };

      document.getElementById('emailSignUpBtn').onclick = async () => {
        const email = document.getElementById('authEmail').value;
        const password = document.getElementById('authPassword').value;
        try {
          await this.createAccount(email, password);
          modal.remove();
        } catch (e) {
          document.getElementById('authError').textContent = e.message;
          document.getElementById('authError').style.display = 'block';
        }
      };

      document.getElementById('closeAuthModal').onclick = () => modal.remove();
    }
  }
};

// Export
if (typeof module !== 'undefined') {
  module.exports = FSI_Auth;
}
