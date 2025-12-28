// Global error handler - show any JS errors on page
window.onerror = function(msg, url, line, col, error) {
  const errDiv = document.createElement('div');
  errDiv.style.cssText = 'background:red;color:white;padding:20px;position:fixed;top:0;left:0;right:0;z-index:9999;';
  errDiv.textContent = 'JS ERROR: ' + msg + ' at line ' + line;
  document.body.appendChild(errDiv);
  return false;
};

// ===========================================
// EXTERNAL CONTENT CONFIGURATION
// ===========================================
// All content (data + audio) can be hosted externally for easy updates
// without republishing the extension to Chrome Web Store.
//
// DEVELOPMENT MODE: Set baseUrl to '' to use local data/ folder
// PRODUCTION MODE:  Set baseUrl to your GitHub Pages URL
//
// To update content after publishing:
// 1. Edit files in your fsi-french-content GitHub repo
// 2. Push changes
// 3. Increment 'version' below to bust browser cache
// 4. Users get updates automatically - no extension republish needed!

const CDN_CONFIG = {
  // Base URL for external content (set to '' for local/development mode)
  // Example: 'https://yourusername.github.io/fsi-french-content/'
  baseUrl: '',  // <-- SET YOUR GITHUB PAGES URL HERE FOR PRODUCTION

  // Data files - updateable without extension republish
  data: {
    drills: 'data/drills.json',           // Main drill database (7799 sentences)
    audioMapping: 'data/reverse_audio_mapping.json',  // Drill ID -> audio file mapping
    confusables: 'data/confusables.json'  // Common error patterns
  },

  // Audio files
  audio: {
    dialogues: 'audio/',          // unit01_dialogue.mp3, etc.
    drills: 'audio/drills/'       // unit01_0001_fr.mp3, unit01_0001_en.mp3, etc.
  },

  // Version string - increment to bust browser cache after content updates
  version: '1.0.0'
};

// Helper to build full URL with cache-busting version
function cdnUrl(path) {
  if (!CDN_CONFIG.baseUrl) return path;  // Local mode
  return `${CDN_CONFIG.baseUrl}${path}?v=${CDN_CONFIG.version}`;
}

// Fetch with CDN first, local fallback if CDN fails
async function fetchWithFallback(cdnPath, localPath) {
  // If no CDN configured, use local directly
  if (!CDN_CONFIG.baseUrl) {
    return fetch(localPath || cdnPath);
  }

  try {
    const response = await fetch(cdnUrl(cdnPath));
    if (response.ok) return response;
    throw new Error(`CDN returned ${response.status}`);
  } catch (e) {
    console.warn('CDN fetch failed, trying local fallback:', e.message);
    return fetch(localPath || cdnPath);
  }
}

// Course data (loaded from JSON)
let courseData = null;
let drillsData = null;
// Audio mapping: drill_id -> audio_file (fixes 48% misaligned audio)
let audioMapping = null;
let currentMode = 'linear';
let currentUnit = null;
let currentDrillIndex = 0;
let currentDrills = [];
let register = 'formal';
let drillMode = 'translate';  // 'translate' or 'repeat'
let sessionCorrect = 0;
let sessionTotal = 0;

// Grammar hint patterns - what grammar points are needed for common sentence patterns
const GRAMMAR_HINTS = {
  'être': 'verb "être" (je suis, tu es, il est...)',
  'avoir': 'verb "avoir" (j\'ai, tu as, il a...)',
  'aller': 'verb "aller" (je vais, tu vas, il va...)',
  'faire': 'verb "faire" (je fais, tu fais, il fait...)',
  'vouloir': 'verb "vouloir" (je veux, tu veux, il veut...)',
  'pouvoir': 'verb "pouvoir" (je peux, tu peux, il peut...)',
  'devoir': 'verb "devoir" (je dois, tu dois, il doit...)',
  'prendre': 'verb "prendre" (je prends, tu prends, il prend...)',
  'question': 'question formation (est-ce que, inversion)',
  'negation': 'negation (ne...pas)',
  'article': 'articles (le/la/les, un/une/des)',
  'possessive': 'possessives (mon/ma/mes, votre/vos)',
  'time': 'time expressions (à quelle heure, il est...)',
  'location': 'location (à, au, en, chez)'
};

// Generate grammar hints based on sentence content
function generateGrammarHints(french, english) {
  const hints = [];
  const frLower = french.toLowerCase();
  const enLower = english.toLowerCase();

  // Detect verbs and grammar patterns
  if (frLower.includes(' suis ') || frLower.includes(' es ') || frLower.includes(' est ') || frLower.includes(' sont ')) {
    hints.push(GRAMMAR_HINTS['être']);
  }
  if (frLower.includes(' ai ') || frLower.includes(' as ') || frLower.includes(' a ') || frLower.includes(' avez ')) {
    hints.push(GRAMMAR_HINTS['avoir']);
  }
  if (frLower.includes(' vais ') || frLower.includes(' vas ') || frLower.includes(' va ') || frLower.includes(' allez ')) {
    hints.push(GRAMMAR_HINTS['aller']);
  }
  if (frLower.includes(' fais ') || frLower.includes(' fait ') || frLower.includes(' faites ')) {
    hints.push(GRAMMAR_HINTS['faire']);
  }
  if (frLower.includes(' veux ') || frLower.includes(' veut ') || frLower.includes(' voulez ') || frLower.includes(' voudrais ')) {
    hints.push(GRAMMAR_HINTS['vouloir']);
  }
  if (frLower.includes(' peux ') || frLower.includes(' peut ') || frLower.includes(' pouvez ')) {
    hints.push(GRAMMAR_HINTS['pouvoir']);
  }
  if (frLower.includes('ne ') && frLower.includes(' pas')) {
    hints.push(GRAMMAR_HINTS['negation']);
  }
  if (frLower.includes('est-ce que') || frLower.includes('-vous') || frLower.includes('-il') || frLower.includes('-elle')) {
    hints.push(GRAMMAR_HINTS['question']);
  }
  if (frLower.includes(' mon ') || frLower.includes(' ma ') || frLower.includes(' mes ') || frLower.includes(' votre ') || frLower.includes(' vos ')) {
    hints.push(GRAMMAR_HINTS['possessive']);
  }
  if (frLower.includes(' heure') || enLower.includes('time') || enLower.includes("o'clock")) {
    hints.push(GRAMMAR_HINTS['time']);
  }

  // Default hint if none detected
  if (hints.length === 0) {
    hints.push('basic vocabulary and sentence structure');
  }

  return hints.slice(0, 3).join(', ');  // Max 3 hints
}

// Set drill mode (translate vs repeat)
function setDrillMode(mode) {
  drillMode = mode;
  document.getElementById('repeatBtn').classList.toggle('active', mode === 'repeat');
  document.getElementById('translateBtn').classList.toggle('active', mode === 'translate');
  updateDrillDisplay();
}

// Storage keys
const STORAGE_KEY = 'allonsy_fsi_progress';
const SYNC_KEY = 'fsi_french_sync';

// ===========================================
// SRS STORAGE SYSTEM
// ===========================================

const SRS_DEFAULTS = {
  interval: 1, ease: 2.5, reps: 0, lapses: 0,
  due: null, lastReview: null, state: 'new'
};

const Storage = {
  data: null,

  async init() {
    this.data = await this.load();
    console.log('Storage loaded:', Object.keys(this.data.cards || {}).length, 'cards');
    return this.data;
  },

  async load() {
    // Try chrome.storage.sync first (cross-device)
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      try {
        const result = await chrome.storage.sync.get(SYNC_KEY);
        if (result[SYNC_KEY]) return result[SYNC_KEY];
      } catch (e) {}
    }
    // Try main localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) try { return JSON.parse(saved); } catch (e) {}
    // Try recovering from backups
    const recovered = await this.recover();
    if (recovered) {
      console.log('Recovered from backup!');
      return recovered;
    }
    return {
      version: 2, cards: {}, unitProgress: {},
      stats: { totalReviews: 0, streak: 0, lastStudyDate: null },
      settings: { newCardsPerDay: 20, reviewsPerDay: 100 }
    };
  },

  async save() {
    if (!this.data) return;

    // Save current state
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));

    // Auto-backup: keep last 10 versions with timestamps
    const backupKey = 'fsi_backup_' + new Date().toISOString().split('T')[0];
    const allBackups = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('fsi_backup_')) allBackups.push(key);
    }
    // Save today's backup (overwrites same-day)
    localStorage.setItem(backupKey, JSON.stringify(this.data));
    // Keep only last 10 daily backups
    allBackups.sort().reverse();
    allBackups.slice(10).forEach(key => localStorage.removeItem(key));

    // Chrome storage sync (cross-device)
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      try { await chrome.storage.sync.set({ [SYNC_KEY]: this.data }); }
      catch (e) { /* quota exceeded is ok, localStorage works */ }
    }

    // Chrome storage local (larger, 5MB)
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try { await chrome.storage.local.set({ fsi_local_backup: this.data }); }
      catch (e) { /* fallback to localStorage */ }
    }

    // Show save indicator
    if (typeof showSaveIndicator === 'function') showSaveIndicator();
  },

  // Recover from any available backup
  async recover() {
    // Try chrome.storage.local first (most recent)
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const result = await chrome.storage.local.get('fsi_local_backup');
        if (result.fsi_local_backup) return result.fsi_local_backup;
      } catch (e) {}
    }
    // Try daily backups (newest first)
    const backups = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('fsi_backup_')) backups.push(key);
    }
    backups.sort().reverse();
    for (const key of backups) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (data?.version && data?.cards) return data;
      } catch (e) {}
    }
    return null;
  },

  getCard(drillId) {
    if (!this.data.cards[drillId]) this.data.cards[drillId] = { ...SRS_DEFAULTS };
    return this.data.cards[drillId];
  },

  reviewCard(drillId, quality) {
    const card = this.getCard(drillId);
    const now = new Date();
    card.lastReview = now.toISOString();
    card.reps++;

    if (quality < 2) {
      card.lapses++; card.interval = 1; card.state = 'learning';
    } else {
      if (card.state === 'new') { card.interval = 1; card.state = 'learning'; }
      else if (card.state === 'learning') { card.interval = 3; card.state = 'review'; }
      else {
        card.ease = Math.max(1.3, card.ease + (0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02)));
        card.interval = Math.round(card.interval * card.ease);
        if (card.interval > 180) card.state = 'mastered';
      }
    }
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + card.interval);
    card.due = dueDate.toISOString();
    this.data.stats.totalReviews++;
    this.save();
    return card;
  },

  getUnitProgress(unitId) {
    return this.data.unitProgress[unitId] || { position: 0, seenIds: [] };
  },

  setUnitProgress(unitId, position, seenId = null) {
    if (!this.data.unitProgress[unitId]) this.data.unitProgress[unitId] = { position: 0, seenIds: [] };
    this.data.unitProgress[unitId].position = position;
    if (seenId && !this.data.unitProgress[unitId].seenIds.includes(seenId)) {
      this.data.unitProgress[unitId].seenIds.push(seenId);
    }
    this.save();
  },

  getDueCards(limit = 50) {
    const now = new Date();
    return Object.entries(this.data.cards)
      .filter(([id, c]) => c.due && new Date(c.due) <= now)
      .sort((a, b) => new Date(a[1].due) - new Date(b[1].due))
      .slice(0, limit)
      .map(([id, c]) => ({ id, ...c }));
  },

  getStats() {
    const cards = Object.values(this.data.cards);
    const now = new Date();
    return {
      total: cards.length,
      newCount: cards.filter(c => c.state === 'new').length,
      learning: cards.filter(c => c.state === 'learning').length,
      review: cards.filter(c => c.state === 'review').length,
      mastered: cards.filter(c => c.state === 'mastered').length,
      dueToday: cards.filter(c => c.due && new Date(c.due) <= now).length,
      streak: this.data.stats.streak,
      totalReviews: this.data.stats.totalReviews
    };
  },

  export() { return JSON.stringify(this.data, null, 2); },

  import(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      if (!imported.version || !imported.cards) throw new Error('Invalid format');
      this.data = imported;
      this.save();
      return true;
    } catch (e) { console.error('Import failed:', e); return false; }
  },

  reset() {
    this.data = {
      version: 2, cards: {}, unitProgress: {},
      stats: { totalReviews: 0, streak: 0, lastStudyDate: null },
      settings: { newCardsPerDay: 20, reviewsPerDay: 100 }
    };
    this.save();
  }
};

// Export progress to JSON file
function exportProgress() {
  const data = Storage.export();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fsi_french_progress_' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

// Import progress from JSON file
function importProgress(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (Storage.import(e.target.result)) {
      alert('Progress imported successfully! Refreshing...');
      location.reload();
    } else {
      alert('Import failed - invalid file format');
    }
  };
  reader.readAsText(file);
  event.target.value = '';  // Reset for re-import
}

// Load course data
async function loadCourse() {
  try {
    // Initialize storage system
    await Storage.init();
    console.log('Storage initialized');

    // Initialize FSI_Linear module (shares storage with Storage system)
    if (typeof FSI_Linear !== 'undefined') {
      await FSI_Linear.init({ units: [] });  // Will load from shared storage
      console.log('FSI_Linear initialized');
    }
  } catch (initErr) {
    console.error('Init error:', initErr);
    // Show error on page
    document.getElementById('unitsGrid').innerHTML = `<div style="color:red;padding:20px;">Init Error: ${initErr.message}</div>`;
  }

  // Always render units first (they're hardcoded)
  renderUnits();

  try {
    // Load drills database (CDN with local fallback)
    console.log('Loading drills...');
    const drillsRes = await fetchWithFallback(CDN_CONFIG.data.drills);
    drillsData = await drillsRes.json();
    console.log('Loaded drills:', drillsData.total_drills, 'drills');

    // Load audio mapping (drill_id -> audio_file) to fix misaligned audio
    try {
      const mappingRes = await fetchWithFallback(CDN_CONFIG.data.audioMapping);
      audioMapping = await mappingRes.json();
      console.log('Loaded audio mapping:', Object.keys(audioMapping).length, 'mappings');
    } catch (e) {
      console.warn('Audio mapping not found, using drill ID as filename (fallback)');
      audioMapping = null;
    }

    // Initialize SRS cards for all drills
    // NOTE: FSI_SRS uses separate storage key to avoid conflict with Storage object
    if (typeof FSI_SRS !== 'undefined') {
      const sentences = drillsData.drills.map(d => ({
        id: d.id,
        pos_pattern: d.pos_pattern,
        commonality: d.commonality,
        unit: d.unit
      }));
      FSI_SRS.initializeCards(sentences);
    }
    updateSRSStats();
    loadProgress();
    // Re-render units now that drills are loaded (for progress calculation)
    renderUnits();
    updateStatsBar();
  } catch (err) {
    console.error('Failed to load drills:', err);
    // Show error if on file:// protocol (prepend to keep units visible)
    if (window.location.protocol === 'file:') {
      document.getElementById('unitsGrid').insertAdjacentHTML('afterbegin', `
        <div style="grid-column: 1/-1; padding: 20px; background: #fff3cd; border: 2px solid #ffc107; margin-bottom: 15px;">
          <strong>⚠ Cannot load drills from file:// URL</strong><br><br>
          Browsers block local file access. Use:<br><br>
          <strong>Option 1 (Recommended):</strong> Open from extension popup (FSI FRENCH COURSE button)<br>
          <strong>Option 2:</strong> Run <code>FSI_French_Server.bat</code><br>
          <strong>Option 3:</strong> <code>python -m http.server 8081</code> then open localhost:8081/fsi.html
        </div>
      `);
    }
  }
}

// Render unit cards
function renderUnits() {
  const grid = document.getElementById('unitsGrid');
  grid.innerHTML = '';

  // Volume 1 header
  const vol1Header = document.createElement('h3');
  vol1Header.textContent = 'VOLUME 1: Units 1-12';
  vol1Header.style.cssText = 'grid-column: 1/-1; margin: 10px 0;';
  grid.appendChild(vol1Header);

  const units = [
    // Volume 1
    { id: 1, title_fr: 'Dans la rue', title_en: 'In the Street' },
    { id: 2, title_fr: 'Dans un petit hôtel', title_en: 'In a Small Hotel' },
    { id: 3, title_fr: 'A la gare', title_en: 'At the Train Station' },
    { id: 4, title_fr: 'Faisons des courses', title_en: "Let's Go Shopping" },
    { id: 5, title_fr: 'Le climat', title_en: 'The Climate' },
    { id: 6, title_fr: 'Révision', title_en: 'Review' },
    { id: 7, title_fr: 'Prenons rendez-vous', title_en: "Let's Make an Appointment" },
    { id: 8, title_fr: 'Chez le coiffeur', title_en: 'At the Hairdresser' },
    { id: 9, title_fr: 'Au restaurant', title_en: 'At the Restaurant' },
    { id: 10, title_fr: 'Au bureau', title_en: 'At the Office' },
    { id: 11, title_fr: 'Maison à louer', title_en: 'House for Rent' },
    { id: 12, title_fr: 'Vocabulaire', title_en: 'Vocabulary Reference' },
    // Volume 2
    { id: 13, title_fr: 'Au bureau de placement', title_en: 'At the Employment Office' },
    { id: 14, title_fr: 'La douane', title_en: 'Customs' },
    { id: 15, title_fr: "L'école", title_en: 'School' },
    { id: 16, title_fr: 'Parlons du spectacle', title_en: "Let's Talk About the Show" },
    { id: 17, title_fr: "À l'aéroport", title_en: 'At the Airport' },
    { id: 18, title_fr: 'Révision', title_en: 'Review' },
    { id: 19, title_fr: 'Chez le médecin', title_en: 'At the Doctor' },
    { id: 20, title_fr: 'La banque', title_en: 'The Bank' },
    { id: 21, title_fr: 'Les transports', title_en: 'Transportation' },
    { id: 22, title_fr: 'La politique', title_en: 'Politics' },
    { id: 23, title_fr: "L'économie", title_en: 'The Economy' },
    { id: 24, title_fr: 'Discours final', title_en: 'Final Discourse' }
  ];

  for (const unit of units) {
    // Add Volume 2 header before unit 13
    if (unit.id === 13) {
      const vol2Header = document.createElement('h3');
      vol2Header.textContent = 'VOLUME 2: Units 13-24';
      vol2Header.style.cssText = 'grid-column: 1/-1; margin: 20px 0 10px 0;';
      grid.appendChild(vol2Header);
    }
    const progress = getUnitProgress(unit.id);
    const card = document.createElement('div');
    card.className = 'unit-card' + (progress === 100 ? ' completed' : '');
    card.innerHTML = `
      <div class="unit-number">UNIT ${unit.id}</div>
      <div class="unit-title">${unit.title_fr}</div>
      <div style="font-size: 14px; color: #666;">${unit.title_en}</div>
      <div class="unit-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <div class="progress-text">${progress}%</div>
      </div>
    `;
    card.onclick = () => openUnit(unit.id);
    grid.appendChild(card);
  }
}

// Get unit progress from storage
function getUnitProgress(unitId) {
  if (!drillsData?.drills) return 0;
  const unitDrills = drillsData.drills.filter(d => d.unit === unitId);
  if (unitDrills.length === 0) return 0;
  const progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  // Check both cards (SRS) and unitProgress.seenIds
  const cards = progress.cards || {};
  const unitProg = progress.unitProgress?.[unitId] || {};
  const seenIds = new Set(unitProg.seenIds || []);
  // A drill is complete if it's in cards OR seenIds
  const completed = unitDrills.filter(d => cards[d.id] || seenIds.has(d.id)).length;
  return Math.round((completed / unitDrills.length) * 100);
}

// Load progress from storage
function loadProgress() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const progress = JSON.parse(saved);
      console.log('Loaded progress:', Object.keys(progress.cards || {}).length, 'cards reviewed');
    } catch (e) {
      console.warn('Failed to load progress:', e);
    }
  }
}

// Update stats bar with real progress
function updateStatsBar() {
  if (!drillsData?.drills) return;

  const progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const cards = progress.cards || {};
  const seenCount = Object.keys(cards).length;

  // Count completed units (100% progress)
  let unitsComplete = 0;
  for (let i = 1; i <= 24; i++) {
    if (getUnitProgress(i) === 100) unitsComplete++;
  }

  // Calculate accuracy from session stats
  const stats = progress.stats || {};
  const totalReviews = stats.totalReviews || 0;
  // Estimate accuracy from card lapses (rough approximation)
  const totalLapses = Object.values(cards).reduce((sum, c) => sum + (c.lapses || 0), 0);
  const accuracy = totalReviews > 0 ? Math.round(((totalReviews - totalLapses) / totalReviews) * 100) : 0;

  // Calculate streak (days in a row with activity)
  const lastDate = stats.lastStudyDate;
  const today = new Date().toISOString().split('T')[0];
  let streak = stats.streak || 0;
  if (lastDate === today) {
    // Already studied today, keep streak
  } else if (lastDate === new Date(Date.now() - 86400000).toISOString().split('T')[0]) {
    // Studied yesterday, streak continues
  } else if (lastDate && lastDate !== today) {
    // Missed a day, streak resets (but don't save yet)
    streak = 0;
  }

  // Update DOM
  document.getElementById('unitsComplete').textContent = unitsComplete;
  document.getElementById('vocabLearned').textContent = seenCount;
  document.getElementById('currentStreak').textContent = streak;
  document.getElementById('accuracy').textContent = accuracy;
}

// Set learning mode
function setMode(mode) {
  currentMode = mode;
  document.getElementById('linearModeBtn').classList.toggle('active', mode === 'linear');
  document.getElementById('srsModeBtn').classList.toggle('active', mode === 'srs');
  document.getElementById('linearView').style.display = mode === 'linear' ? 'block' : 'none';
  document.getElementById('srsView').style.display = mode === 'srs' ? 'block' : 'none';
  document.getElementById('unitDetailView').style.display = 'none';
  document.getElementById('drillView').classList.remove('active');
  // Refresh stats when switching modes
  if (mode === 'srs') {
    updateSRSStats();
  } else {
    renderUnits();
  }
}

// Unit data with dialogues and grammar
const UNIT_DATA = {
  1: {
    title_fr: 'Dans la rue',
    title_en: 'In the Street',
    dialogue: [
      { speaker: 'M. Durand', fr: 'Bonjour, Monsieur.', en: 'Hello, Sir.' },
      { speaker: 'M. Lelong', fr: 'Bonjour, Monsieur Durand. Comment allez-vous?', en: 'Hello, Mr. Durand. How are you?' },
      { speaker: 'M. Durand', fr: 'Très bien, merci. Et vous?', en: 'Very well, thank you. And you?' },
      { speaker: 'M. Lelong', fr: 'Pas mal, merci.', en: 'Not bad, thank you.' },
      { speaker: 'M. Durand', fr: 'Et votre frère, comment va-t-il?', en: 'And your brother, how is he?' },
      { speaker: 'M. Lelong', fr: 'Il va très bien. Il est en vacances.', en: 'He is doing very well. He is on vacation.' },
      { speaker: 'M. Durand', fr: 'Où est-il?', en: 'Where is he?' },
      { speaker: 'M. Lelong', fr: 'Il est à Lyon avec ma soeur.', en: 'He is in Lyon with my sister.' }
    ],
    grammar: [
      { title: 'Greetings & Politeness', desc: 'Bonjour (hello, used until evening), Bonsoir (good evening). "Comment allez-vous?" is formal; use "Comment vas-tu?" with friends. Responses: Très bien (very well), Bien (well), Pas mal (not bad), Comme ci comme ça (so-so).' },
      { title: 'Être (to be)', desc: 'The most essential French verb. Je suis (I am), tu es (you are-informal), il/elle/on est (he/she/one is), nous sommes (we are), vous êtes (you are-formal/plural), ils/elles sont (they are). Used for identity, profession, nationality, location, and descriptions.' },
      { title: 'Possessive Adjectives', desc: 'Must agree with the POSSESSED noun, not the possessor. Masculine: mon/ton/son (my/your/his-her). Feminine: ma/ta/sa. Plural: mes/tes/ses. Before feminine vowel-words, use mon/ton/son (mon amie). Formal: votre (sing), vos (plural).' },
      { title: 'Location with "à"', desc: '"À" means "at" or "in" for cities and locations. Contracts with "le": à + le = au (au café). With "les": à + les = aux (aux États-Unis). No contraction with la/l\' (à la gare, à l\'hôtel). Cities never take articles: à Paris, à Lyon.' }
    ]
  },
  2: {
    title_fr: 'Dans un petit hôtel',
    title_en: 'In a Small Hotel',
    dialogue: [
      { speaker: 'Client', fr: 'Bonjour, Madame. Avez-vous une chambre?', en: 'Hello, Madam. Do you have a room?' },
      { speaker: 'Réceptionniste', fr: 'Oui, Monsieur. Pour combien de personnes?', en: 'Yes, Sir. For how many people?' },
      { speaker: 'Client', fr: 'Pour une personne.', en: 'For one person.' },
      { speaker: 'Réceptionniste', fr: 'Pour combien de jours?', en: 'For how many days?' },
      { speaker: 'Client', fr: 'Pour trois jours.', en: 'For three days.' },
      { speaker: 'Réceptionniste', fr: 'Voulez-vous une salle de bains?', en: 'Do you want a bathroom?' },
      { speaker: 'Client', fr: 'Oui, s\'il vous plaît.', en: 'Yes, please.' }
    ],
    grammar: [
      { title: 'Avoir (to have)', desc: 'Second most important verb. J\'ai (I have), tu as, il/elle/on a, nous avons, vous avez, ils/elles ont. Also used in expressions: avoir faim (be hungry), avoir soif (thirsty), avoir froid/chaud (cold/hot), avoir X ans (be X years old), avoir besoin de (need).' },
      { title: 'Questions with Inversion', desc: 'Formal question form: swap subject-verb and add hyphen. Avez-vous une chambre? Voulez-vous du café? With il/elle/on, add -t- between vowels: A-t-il...? Parle-t-elle...? Less formal: use "Est-ce que" + normal order (Est-ce que vous avez...?).' },
      { title: 'Numbers 1-10', desc: 'un/une (1), deux (2), trois (3), quatre (4), cinq (5), six (6), sept (7), huit (8), neuf (9), dix (10). Note: "un" is masculine, "une" is feminine (un jour, une nuit). Pronunciation changes: six/dix before consonants drop the final sound.' },
      { title: 'Pour + Duration/Purpose', desc: '"Pour" expresses purpose or duration. Pour une personne (for one person), pour trois jours (for three days), pour combien de temps? (for how long?). Also: pour + infinitive = "in order to" (pour réserver = to reserve).' }
    ]
  },
  3: {
    title_fr: 'À la gare',
    title_en: 'At the Train Station',
    dialogue: [
      { speaker: 'Voyageur', fr: 'Un aller-retour pour Lyon, s\'il vous plaît.', en: 'A round-trip ticket to Lyon, please.' },
      { speaker: 'Employé', fr: 'En première ou en seconde?', en: 'First or second class?' },
      { speaker: 'Voyageur', fr: 'En seconde. C\'est combien?', en: 'Second class. How much is it?' },
      { speaker: 'Employé', fr: 'Quarante-deux euros.', en: 'Forty-two euros.' },
      { speaker: 'Voyageur', fr: 'À quelle heure part le prochain train?', en: 'What time does the next train leave?' },
      { speaker: 'Employé', fr: 'À dix heures vingt.', en: 'At 10:20.' }
    ],
    grammar: [
      { title: 'Telling Time', desc: 'Quelle heure est-il? Il est + number + heure(s). Il est dix heures (10:00). Add minutes directly: dix heures vingt (10:20). Half: et demie. Quarter: et quart / moins le quart. Use 24h format officially: 15h30 = quinze heures trente.' },
      { title: 'Partir (to leave)', desc: 'Irregular -ir verb (like sortir, dormir). Je pars, tu pars, il/elle part, nous partons, vous partez, ils/elles partent. "Partir" = leave (depart). "Quitter" = leave (a place/person). Le train part à 10h = The train leaves at 10.' },
      { title: 'Ordinal Numbers', desc: 'Add -ième to cardinal numbers: deux→deuxième, trois→troisième. Exception: premier/première (1st), second(e) (2nd, only when there are exactly two). Drop final -e before -ième: quatre→quatrième. "Neuf" becomes "neuvième".' },
      { title: 'Asking Prices', desc: 'C\'est combien? / Ça coûte combien? / Quel est le prix? For totals: Ça fait combien? Response: Ça fait X euros (That comes to X euros). Ça fait 42€50 = quarante-deux euros cinquante (centimes implied).' }
    ]
  }
};

// Units 4-12 from Volume 1
UNIT_DATA[4] = {
  title_fr: 'Faisons des courses',
  title_en: "Let's Go Shopping",
  dialogue: [
    { speaker: 'Client', fr: 'Je voudrais acheter des fruits, s\'il vous plaît.', en: 'I\'d like to buy some fruit, please.' },
    { speaker: 'Vendeur', fr: 'Qu\'est-ce que vous désirez? Des pommes? Des oranges?', en: 'What would you like? Apples? Oranges?' },
    { speaker: 'Client', fr: 'Un kilo de pommes et une livre d\'oranges.', en: 'A kilo of apples and a pound of oranges.' },
    { speaker: 'Vendeur', fr: 'Voilà. C\'est tout?', en: 'Here you are. Is that all?' },
    { speaker: 'Client', fr: 'Oui, c\'est tout. Ça fait combien?', en: 'Yes, that\'s all. How much is it?' },
    { speaker: 'Vendeur', fr: 'Ça fait cinq euros cinquante.', en: 'That\'s five euros fifty.' }
  ],
  grammar: [
    { title: 'Partitive Articles', desc: 'Express "some" or unspecified quantity. du (masc) = de + le: du pain (some bread). de la (fem): de la viande (some meat). de l\' (before vowel): de l\'eau. des (plural): des fruits. After negation, all become "de/d\'": Je n\'ai pas DE pain.' },
    { title: 'Quantities & Measurements', desc: 'After quantities, use "de" (no article): un kilo DE pommes, une livre DE beurre, un litre DE lait, une douzaine D\'oeufs, beaucoup DE, peu DE, assez DE. Exception: "la plupart des" (most of the).' },
    { title: 'Shopping Vocabulary', desc: 'Je voudrais... (I would like...), Il me faut... (I need...), C\'est tout (That\'s all), Autre chose? (Anything else?), Voilà (Here you are). Weights: un kilo (2.2 lbs), une livre (500g), cent grammes.' }
  ]
};

UNIT_DATA[5] = {
  title_fr: 'Le climat',
  title_en: 'The Climate',
  dialogue: [
    { speaker: 'A', fr: 'Quel temps fait-il aujourd\'hui?', en: 'What\'s the weather like today?' },
    { speaker: 'B', fr: 'Il fait beau, mais il fait un peu froid.', en: 'It\'s nice, but it\'s a bit cold.' },
    { speaker: 'A', fr: 'Est-ce qu\'il va pleuvoir cet après-midi?', en: 'Is it going to rain this afternoon?' },
    { speaker: 'B', fr: 'D\'après la météo, il y aura des nuages.', en: 'According to the forecast, there will be clouds.' },
    { speaker: 'A', fr: 'L\'hiver est toujours froid à Paris?', en: 'Is winter always cold in Paris?' },
    { speaker: 'B', fr: 'Oui, mais moins froid qu\'à New York.', en: 'Yes, but less cold than in New York.' }
  ],
  grammar: [
    { title: 'Weather Expressions', desc: 'Use "Il fait" + adjective: Il fait beau (nice), chaud (hot), froid (cold), frais (cool), doux (mild), mauvais (bad). Use "Il" + verb: Il pleut (raining), Il neige (snowing). Use "Il y a": Il y a du soleil (sunny), du vent (windy), du brouillard (foggy), des nuages (cloudy).' },
    { title: 'Comparisons', desc: 'plus + adj + que (more...than): Paris est plus grand que Lyon. moins + adj + que (less...than): Il fait moins chaud qu\'hier. aussi + adj + que (as...as): Il est aussi intelligent que sa soeur. Irregular: bon→meilleur (better), bien→mieux (better-adverb).' },
    { title: 'Seasons & Climate', desc: 'au printemps (in spring), en été (in summer), en automne (in fall), en hiver (in winter). Le climat est... doux/tempéré/continental/méditerranéen. Il pleut souvent (often rains), Il fait toujours beau (always nice).' }
  ]
};

UNIT_DATA[6] = {
  title_fr: 'Révision',
  title_en: 'Review',
  dialogue: [
    { speaker: 'Professeur', fr: 'Révisons les leçons précédentes.', en: 'Let\'s review the previous lessons.' },
    { speaker: 'Étudiant', fr: 'D\'accord. Par où commençons-nous?', en: 'Okay. Where do we start?' },
    { speaker: 'Professeur', fr: 'Par les articles et les prépositions.', en: 'With articles and prepositions.' },
    { speaker: 'Étudiant', fr: 'Je confonds souvent "à" et "de".', en: 'I often confuse "à" and "de".' },
    { speaker: 'Professeur', fr: 'C\'est normal. Pratiquons ensemble.', en: 'That\'s normal. Let\'s practice together.' },
    { speaker: 'Étudiant', fr: 'Merci, c\'est très utile.', en: 'Thank you, it\'s very useful.' }
  ],
  grammar: [
    { title: 'Articles Review', desc: 'Definite: le (masc), la (fem), l\' (vowel), les (plural) - "the". Indefinite: un (masc), une (fem), des (plural) - "a/some". Partitive: du, de la, de l\', des - "some" (uncountable). All become "de" after negation and quantities.' },
    { title: 'Key Verbs Review', desc: 'Être (to be): suis, es, est, sommes, êtes, sont. Avoir (to have): ai, as, a, avons, avez, ont. Aller (to go): vais, vas, va, allons, allez, vont. Faire (to do/make): fais, fais, fait, faisons, faites, font.' },
    { title: 'Prepositions Review', desc: 'à = at/to (contracts: au, aux). de = of/from (contracts: du, des). dans = in/inside. sur = on. sous = under. devant = in front of. derrière = behind. entre = between. chez = at someone\'s place.' }
  ]
};

UNIT_DATA[7] = {
  title_fr: 'Prenons rendez-vous',
  title_en: "Let's Make an Appointment",
  dialogue: [
    { speaker: 'Client', fr: 'Je voudrais prendre rendez-vous. Je peux réserver en ligne?', en: 'I\'d like to make an appointment. Can I book online?' },
    { speaker: 'Secrétaire', fr: 'Oui, sur notre site web ou avec l\'appli Doctolib.', en: 'Yes, on our website or with the Doctolib app.' },
    { speaker: 'Client', fr: 'Je préfère par téléphone. Mercredi matin, c\'est possible?', en: 'I prefer by phone. Is Wednesday morning possible?' },
    { speaker: 'Secrétaire', fr: 'Oui, à dix heures. Je vous envoie un SMS de confirmation.', en: 'Yes, at ten o\'clock. I\'ll send you a confirmation text.' },
    { speaker: 'Client', fr: 'Parfait. Est-ce que je recevrai un rappel?', en: 'Perfect. Will I receive a reminder?' },
    { speaker: 'Secrétaire', fr: 'Oui, par email et SMS la veille du rendez-vous.', en: 'Yes, by email and text the day before the appointment.' }
  ],
  grammar: [
    { title: 'Vouloir & Pouvoir', desc: 'Vouloir (to want): veux, veux, veut, voulons, voulez, veulent. Pouvoir (to be able): peux, peux, peut, pouvons, pouvez, peuvent. Both followed by infinitive: Je veux réserver. Je peux venir. Conditional for politeness: Je voudrais... (I would like...).' },
    { title: 'Future with Aller', desc: 'Near future (going to): aller + infinitive. Je vais appeler (I\'m going to call). Nous allons réserver (We\'re going to book). Very common in spoken French, often preferred over simple future.' },
    { title: 'Appointments & Scheduling', desc: 'Prendre rendez-vous (make appointment). Fixer un rendez-vous. Êtes-vous libre...? (Are you free...?). Ça vous convient? (Does that suit you?). Je confirme pour... (I confirm for...). Annuler/reporter (cancel/postpone).' }
  ]
};

UNIT_DATA[8] = {
  title_fr: 'Chez le coiffeur',
  title_en: 'At the Hairdresser',
  dialogue: [
    { speaker: 'Client', fr: 'Je voudrais une coupe, s\'il vous plaît.', en: 'I\'d like a haircut, please.' },
    { speaker: 'Coiffeur', fr: 'Comment les voulez-vous?', en: 'How would you like them?' },
    { speaker: 'Client', fr: 'Courts sur les côtés, un peu plus longs dessus.', en: 'Short on the sides, a bit longer on top.' },
    { speaker: 'Coiffeur', fr: 'Voulez-vous un shampooing aussi?', en: 'Would you like a shampoo too?' },
    { speaker: 'Client', fr: 'Oui, s\'il vous plaît.', en: 'Yes, please.' },
    { speaker: 'Coiffeur', fr: 'Installez-vous, je suis à vous dans une minute.', en: 'Have a seat, I\'ll be with you in a minute.' }
  ],
  grammar: [
    { title: 'Direct Object Pronouns', desc: 'Replace direct objects: le (him/it-masc), la (her/it-fem), les (them), me, te, nous, vous. Placed BEFORE the verb: Je le vois (I see him). Je les achète (I buy them). In passé composé: Je l\'ai vu (I saw him/it).' },
    { title: 'Imperative Mood', desc: 'Commands using tu/nous/vous forms without subject. Tu form drops -s for -er verbs: Parle! (Speak!), Mange! (Eat!). But: Finis! Attends! Nous form: Parlons! (Let\'s speak!). Vous form: Parlez! Irregular: sois/soyons/soyez (être), aie/ayons/ayez (avoir).' },
    { title: 'Reflexive Verbs', desc: 'Actions done to oneself. Se + verb: s\'asseoir (sit down), s\'installer (settle in), se coiffer (do one\'s hair). Je m\'assieds, tu t\'assieds, il s\'assied. Imperative: Asseyez-vous! Installez-vous!' }
  ]
};

UNIT_DATA[9] = {
  title_fr: 'Au restaurant',
  title_en: 'At the Restaurant',
  dialogue: [
    { speaker: 'Serveur', fr: 'Bonsoir. Une table pour deux?', en: 'Good evening. A table for two?' },
    { speaker: 'Client', fr: 'Oui, s\'il vous plaît. Près de la fenêtre si possible.', en: 'Yes, please. Near the window if possible.' },
    { speaker: 'Serveur', fr: 'Voici le menu. Désirez-vous un apéritif?', en: 'Here\'s the menu. Would you like an aperitif?' },
    { speaker: 'Client', fr: 'Non merci. Qu\'est-ce que vous recommandez?', en: 'No thank you. What do you recommend?' },
    { speaker: 'Serveur', fr: 'Le boeuf bourguignon est excellent.', en: 'The beef bourguignon is excellent.' },
    { speaker: 'Client', fr: 'Parfait, je prends ça avec une salade.', en: 'Perfect, I\'ll have that with a salad.' }
  ],
  grammar: [
    { title: 'Restaurant Vocabulary', desc: 'le menu (fixed-price meal), la carte (à la carte menu), l\'entrée (starter), le plat principal (main course), le dessert, l\'addition (bill), le pourboire (tip - usually 5-10%, often included as "service compris").' },
    { title: 'Ordering Food', desc: 'Je prends... (I\'ll have - literally "I take"). Je voudrais... (I\'d like - more polite). Pour moi, le... (For me, the...). Comme entrée/plat/dessert... (As starter/main/dessert...). Qu\'est-ce que vous recommandez? (What do you recommend?).' },
    { title: 'Prendre (to take)', desc: 'Irregular verb, very common. Je prends, tu prends, il prend, nous prenons, vous prenez, ils prennent. Also: apprendre (learn), comprendre (understand), surprendre (surprise). Same conjugation pattern.' }
  ]
};

UNIT_DATA[10] = {
  title_fr: 'Au bureau',
  title_en: 'At the Office',
  dialogue: [
    { speaker: 'Collègue', fr: 'Bonjour! Vous avez reçu mon email ce matin?', en: 'Hello! Did you get my email this morning?' },
    { speaker: 'Employé', fr: 'Non, je n\'ai pas encore vérifié. Mon ordinateur portable était en panne.', en: 'No, I haven\'t checked yet. My laptop was broken.' },
    { speaker: 'Collègue', fr: 'Ah, c\'est embêtant. Je vous l\'envoie sur votre téléphone.', en: 'Ah, that\'s annoying. I\'ll send it to your phone.' },
    { speaker: 'Employé', fr: 'Merci. Je peux aussi utiliser l\'ordinateur de la salle de réunion.', en: 'Thanks. I can also use the computer in the meeting room.' },
    { speaker: 'Collègue', fr: 'Bonne idée. On fait une visioconférence à quatorze heures.', en: 'Good idea. We have a video call at two o\'clock.' },
    { speaker: 'Employé', fr: 'D\'accord, je serai connecté.', en: 'Okay, I\'ll be connected.' }
  ],
  grammar: [
    { title: 'Office & Technology Vocab', desc: 'un email/courriel/mail, un ordinateur (computer), portable (laptop), un téléphone, une visioconférence/vidéoconférence, une réunion (meeting), un dossier (file/folder), une pièce jointe (attachment), envoyer/recevoir (send/receive).' },
    { title: 'Passé Composé', desc: 'Past tense: avoir/être + past participle. Most verbs use avoir: J\'ai parlé, tu as fini, il a reçu. -er verbs: -é (parlé). -ir verbs: -i (fini). -re verbs: -u (vendu). Irregular: reçu (recevoir), vu (voir), eu (avoir), été (être), fait (faire).' },
    { title: 'Recevoir (to receive)', desc: 'Irregular verb. Je reçois, tu reçois, il reçoit, nous recevons, vous recevez, ils reçoivent. Past participle: reçu. Avez-vous reçu mon email? (Did you receive my email?). Similar: apercevoir (notice), concevoir (conceive).' }
  ]
};

UNIT_DATA[11] = {
  title_fr: 'Maison à louer',
  title_en: 'House for Rent',
  dialogue: [
    { speaker: 'Locataire', fr: 'Je cherche un appartement à louer.', en: 'I\'m looking for an apartment to rent.' },
    { speaker: 'Agent', fr: 'Combien de pièces vous faut-il?', en: 'How many rooms do you need?' },
    { speaker: 'Locataire', fr: 'Trois pièces: deux chambres et un salon.', en: 'Three rooms: two bedrooms and a living room.' },
    { speaker: 'Agent', fr: 'J\'ai quelque chose dans le septième arrondissement.', en: 'I have something in the seventh district.' },
    { speaker: 'Locataire', fr: 'C\'est combien par mois?', en: 'How much is it per month?' },
    { speaker: 'Agent', fr: 'Mille deux cents euros, charges comprises.', en: 'Twelve hundred euros, utilities included.' }
  ],
  grammar: [
    { title: 'Housing Vocabulary', desc: 'un appartement (apartment), une maison (house), une pièce (room), une chambre (bedroom), un salon/séjour (living room), une cuisine (kitchen), une salle de bains (bathroom), un balcon, un jardin, un étage (floor), le loyer (rent), les charges (utilities).' },
    { title: 'Il faut (It is necessary)', desc: 'Impersonal expression. Il faut + infinitive: Il faut réserver (One must reserve). Il faut + noun: Il faut de la patience (Patience is needed). With indirect object: Il me faut (I need), Il vous faut (You need). Negative: Il ne faut pas (One must not).' },
    { title: 'Describing Spaces', desc: 'Adjectives of size: grand(e) (big), petit(e) (small), spacieux/euse (spacious). lumineux/euse (bright), sombre (dark), moderne, ancien/ne (old). Meublé(e) (furnished). Une pièce de X m² (X square meters). Avec vue sur... (with view of...).' }
  ]
};

UNIT_DATA[12] = {
  title_fr: 'Vocabulaire',
  title_en: 'Vocabulary Reference',
  dialogue: [
    { speaker: 'Professeur', fr: 'Enrichissons notre vocabulaire.', en: 'Let\'s enrich our vocabulary.' },
    { speaker: 'Étudiant', fr: 'Comment dit-on "thank you" en français?', en: 'How do you say "thank you" in French?' },
    { speaker: 'Professeur', fr: 'On dit "merci" ou "merci beaucoup".', en: 'You say "merci" or "merci beaucoup".' },
    { speaker: 'Étudiant', fr: 'Et pour demander poliment?', en: 'And to ask politely?' },
    { speaker: 'Professeur', fr: '"S\'il vous plaît" pour le formel, "s\'il te plaît" pour l\'informel.', en: '"S\'il vous plaît" for formal, "s\'il te plaît" for informal.' },
    { speaker: 'Étudiant', fr: 'C\'est plus clair maintenant, merci!', en: 'It\'s clearer now, thank you!' }
  ],
  grammar: [
    { title: 'Learning Vocabulary', desc: 'Comment dit-on X en français? (How do you say X?). Que veut dire X? (What does X mean?). Comment ça s\'écrit? (How is it spelled?). Pouvez-vous répéter? (Can you repeat?). Plus lentement, s\'il vous plaît (More slowly, please).' },
    { title: 'Politeness Expressions', desc: 's\'il vous plaît (please-formal), s\'il te plaît (please-informal). Merci (beaucoup) (thank you very much). De rien / Il n\'y a pas de quoi / Je vous en prie (you\'re welcome). Excusez-moi / Pardon (excuse me). Je suis désolé(e) (I\'m sorry).' },
    { title: 'Formal vs Informal Register', desc: 'Vous = formal/plural, Tu = informal/singular. Formal: Bonjour Monsieur/Madame, Comment allez-vous?, Veuillez... Informal: Salut, Comment vas-tu? / Ça va?, Tu peux... Use vous with strangers, elders, professional contexts; tu with friends, family, peers.' }
  ]
};

// Units 13-18 from Volume 2
UNIT_DATA[13] = {
  title_fr: 'Au bureau de placement',
  title_en: 'At the Employment Office',
  dialogue: [
    { speaker: 'Client', fr: 'Je voudrais une bonne aimant s\'occuper d\'enfants.', en: 'I\'d like a maid who likes to take care of children.' },
    { speaker: 'Agent', fr: 'Est-ce pour Paris ou pour la banlieue?', en: 'Is it for Paris or for the suburbs?' },
    { speaker: 'Client', fr: 'Neuilly exactement.', en: 'Neuilly exactly.' },
    { speaker: 'Agent', fr: 'Je crois que j\'ai une personne qui fera votre affaire.', en: 'I think I have someone who will be suitable for you.' },
    { speaker: 'Client', fr: 'Comment s\'appelle-t-elle?', en: 'What\'s her name?' },
    { speaker: 'Agent', fr: 'Elle s\'appelle Marie Ledoux.', en: 'Her name is Marie Ledoux.' }
  ],
  grammar: [
    { title: 'Relative Pronoun "qui"', desc: '"Qui" = who/which/that (subject of relative clause). La personne qui parle (the person who speaks). Le livre qui est sur la table (the book that is on the table). "Qui" is always followed by a verb. Never contracts before vowels.' },
    { title: 'Relative Pronoun "que"', desc: '"Que" = whom/which/that (object of relative clause). La personne que je connais (the person whom I know). Le livre que j\'ai lu (the book that I read). "Que" contracts to "qu\'" before vowels. Followed by a subject, not directly by a verb.' },
    { title: 'Reflexive Verbs', desc: 'Express action on oneself: se + verb. s\'appeler (be called): Je m\'appelle... s\'occuper de (take care of): Je m\'occupe de... se lever (get up), se coucher (go to bed), s\'habiller (get dressed). In passé composé, use être: Je me suis levé(e).' }
  ]
};

UNIT_DATA[14] = {
  title_fr: 'La douane',
  title_en: 'Customs',
  dialogue: [
    { speaker: 'A', fr: 'Il y a à peine deux heures que nous sommes en route.', en: 'It\'s hardly two hours since we\'ve been on the way.' },
    { speaker: 'B', fr: 'Et nous approchons de la Belgique.', en: 'And we\'re getting near Belgium.' },
    { speaker: 'A', fr: 'Nous n\'avons vraiment pas mis longtemps.', en: 'We really haven\'t been very long.' },
    { speaker: 'B', fr: 'En effet, tout s\'est bien passé.', en: 'Yes, everything has gone well.' },
    { speaker: 'A', fr: 'Connaissez-vous déjà ce pays?', en: 'Do you already know this country?' },
    { speaker: 'B', fr: 'Oui, j\'ai eu l\'occasion d\'y faire un séjour quand j\'étais étudiant.', en: 'Yes, I had the chance to make a trip there when I was a student.' }
  ],
  grammar: [
    { title: 'Il y a + Time + que', desc: 'Expresses duration from past to present. Il y a deux heures que j\'attends (I\'ve been waiting for two hours). Equivalent to depuis: J\'attends depuis deux heures. Also: Ça fait deux heures que j\'attends. Question: Depuis combien de temps...? / Il y a combien de temps que...?' },
    { title: 'Passé Composé vs Imparfait', desc: 'Passé composé: completed actions, specific moments, events. J\'ai mangé à midi. Imparfait: ongoing states, habits, descriptions, background. Je mangeais quand il est arrivé. Together: imparfait sets scene, passé composé for events.' },
    { title: 'Customs & Travel Vocabulary', desc: 'la douane (customs), un douanier (customs officer), déclarer (declare), rien à déclarer (nothing to declare), le passeport, la carte d\'identité, le visa, les bagages, ouvrir (open), fouiller (search).' }
  ]
};

UNIT_DATA[15] = {
  title_fr: 'L\'école',
  title_en: 'School',
  dialogue: [
    { speaker: 'A', fr: 'Où mettrez-vous vos enfants?', en: 'Where will you be sending your children?' },
    { speaker: 'B', fr: 'Nous allons peut-être les faire inscrire au lycée.', en: 'We might enroll them in the lycée.' },
    { speaker: 'A', fr: 'Pourquoi ne les enverriez-vous pas à l\'école américaine?', en: 'Why don\'t you send them to the American school?' },
    { speaker: 'B', fr: 'Parce que nous préférons qu\'ils apprennent bien le français.', en: 'Because we prefer that they learn French well.' },
    { speaker: 'A', fr: 'Et les vôtres?', en: 'And yours?' },
    { speaker: 'B', fr: 'Cette année ils vont tous à l\'école.', en: 'This year they are all going to school.' }
  ],
  grammar: [
    { title: 'Simple Future Tense', desc: 'Formed: infinitive + ai, as, a, ons, ez, ont (avoir endings). Je parlerai, tu finiras, il vendra. Drop final -e from -re verbs: vendre→vendrai. Irregular stems: être→ser-, avoir→aur-, aller→ir-, faire→fer-, venir→viendr-, voir→verr-, pouvoir→pourr-.' },
    { title: 'Conditional Mood', desc: 'Formed: future stem + imparfait endings (-ais, -ais, -ait, -ions, -iez, -aient). Je voudrais (I would like), il pourrait (he could). Used for politeness, hypotheticals, reported speech. Si j\'avais le temps, je viendrais (If I had time, I would come).' },
    { title: 'Subjunctive Basics', desc: 'Required after expressions of will, doubt, emotion: vouloir que, préférer que, il faut que, avoir peur que, être content que. Formation: ils form stem + -e, -es, -e, -ions, -iez, -ent. Je veux qu\'il vienne (I want him to come). Irregular: soit (être), ait (avoir), fasse (faire).' }
  ]
};

UNIT_DATA[16] = {
  title_fr: 'Parlons du spectacle',
  title_en: 'Let\'s Talk About the Show',
  dialogue: [
    { speaker: 'Client', fr: 'Joue-t-on Faust mardi en matinée?', en: 'Are they doing Faust at the matinee Tuesday?' },
    { speaker: 'Guichet', fr: 'Non, Monsieur. Vendredi en soirée seulement.', en: 'No, Sir. Friday in the evening only.' },
    { speaker: 'Client', fr: 'Avez-vous deux fauteuils d\'orchestre pour ce jour-là?', en: 'Do you have two orchestra seats for that day?' },
    { speaker: 'Guichet', fr: 'Dans les dix premiers rangs de préférence.', en: 'Preferably in the first ten rows.' },
    { speaker: 'Client', fr: 'Nous n\'en avons plus.', en: 'We don\'t have anymore.' },
    { speaker: 'Guichet', fr: 'Il ne reste que des places séparées au troisième balcon.', en: 'There are only separate seats left in the third balcony.' }
  ],
  grammar: [
    { title: 'On as Passive Voice', desc: '"On" can express passive meaning without passive construction. On parle français ici (French is spoken here). On dit que... (It is said that...). Joue-t-on ce film? (Is this film being shown?). More common than true passive (être + past participle) in spoken French.' },
    { title: 'Negative Expressions', desc: 'ne...plus (no more/longer): Je n\'ai plus faim. ne...jamais (never): Il ne vient jamais. ne...rien (nothing): Je ne vois rien. ne...personne (nobody): Je ne connais personne. ne...que (only): Il ne reste que deux places. In spoken French, "ne" often dropped.' },
    { title: 'Entertainment Vocabulary', desc: 'le spectacle (show), le cinéma, le théâtre, un film, une pièce (play), une séance (showing), un billet/une place (ticket), complet (sold out), les critiques (reviews), jouer (to play/show), passer (to be showing).' }
  ]
};

UNIT_DATA[17] = {
  title_fr: 'À l\'aéroport',
  title_en: 'At the Airport',
  dialogue: [
    { speaker: 'A', fr: 'Avez-vous confirmé votre départ?', en: 'Have you confirmed your departure?' },
    { speaker: 'B', fr: 'Oui, avant-hier.', en: 'Yes, the day before yesterday.' },
    { speaker: 'A', fr: 'Êtes-vous certain de n\'avoir rien oublié?', en: 'Are you sure you haven\'t forgotten anything?' },
    { speaker: 'B', fr: 'J\'ai vérifié avant de partir et tous mes papiers sont dans ma serviette.', en: 'I checked before leaving and all of my papers are in my briefcase.' },
    { speaker: 'A', fr: 'Mais je m\'aperçois que je n\'aurai rien à lire dans l\'avion.', en: 'But I notice I won\'t have anything to read on the plane.' },
    { speaker: 'B', fr: 'Ne vous donnez pas la peine d\'acheter des journaux ou des revues.', en: 'Don\'t bother to buy newspapers or magazines.' }
  ],
  grammar: [
    { title: 'Infinitive After Prepositions', desc: 'French uses infinitive (not -ing) after prepositions. avant de + inf: avant de partir (before leaving). après + past inf: après avoir mangé (after eating). pour + inf: pour apprendre (in order to learn). sans + inf: sans savoir (without knowing).' },
    { title: 'Past Infinitive', desc: 'après/avant de + avoir/être + past participle. Après avoir fini (after having finished). Après être arrivé(e) (after having arrived). Negation: pour ne pas oublier (in order not to forget). Je regrette de ne pas avoir appelé.' },
    { title: 'Airport Vocabulary', desc: 'l\'aéroport, le terminal, l\'enregistrement (check-in), la carte d\'embarquement (boarding pass), la porte (gate), le vol (flight), décoller (take off), atterrir (land), les bagages à main (carry-on), la soute (hold), en retard (delayed).' }
  ]
};

UNIT_DATA[18] = {
  title_fr: 'Révision',
  title_en: 'Review',
  dialogue: [
    { speaker: 'FSI', fr: '(Unité de révision - exercices de traduction)', en: '(Review unit - translation exercises)' }
  ],
  grammar: [
    { title: 'Tenses Review', desc: 'Present: je parle. Passé composé: j\'ai parlé (completed). Imparfait: je parlais (ongoing/habitual). Future: je parlerai. Conditional: je parlerais. Choose based on: Is action complete? Ongoing? Hypothetical?' },
    { title: 'Pronouns Review', desc: 'Subject: je, tu, il/elle/on, nous, vous, ils/elles. Direct object: me, te, le/la, nous, vous, les. Indirect: me, te, lui, nous, vous, leur. Y (there/to it), en (of it/some). Order before verb: me/te/nous/vous, le/la/les, lui/leur, y, en.' },
    { title: 'Relative Clauses Review', desc: 'qui = subject (l\'homme qui parle). que = object (l\'homme que je vois). où = where/when (la ville où j\'habite, le jour où...). dont = whose/of which (l\'homme dont je parle).' }
  ]
};

// Units 19-24 from Volume 2
UNIT_DATA[19] = {
  title_fr: 'Chez le médecin',
  title_en: 'At the Doctor',
  dialogue: [
    { speaker: 'Patient', fr: 'Bonjour, docteur. Je ne me sens pas bien depuis quelques jours.', en: 'Hello, doctor. I haven\'t been feeling well for a few days.' },
    { speaker: 'Médecin', fr: 'Qu\'est-ce qui ne va pas exactement?', en: 'What exactly is wrong?' },
    { speaker: 'Patient', fr: 'J\'ai mal à la tête et j\'ai de la fièvre.', en: 'I have a headache and I have a fever.' },
    { speaker: 'Médecin', fr: 'Depuis combien de temps avez-vous ces symptômes?', en: 'How long have you had these symptoms?' },
    { speaker: 'Patient', fr: 'Depuis trois jours environ.', en: 'For about three days.' },
    { speaker: 'Médecin', fr: 'Je vais vous examiner. Ouvrez la bouche et dites "Ah".', en: 'I\'m going to examine you. Open your mouth and say "Ah".' }
  ],
  grammar: [
    { title: 'Body Parts & Avoir mal à', desc: 'J\'ai mal à + definite article + body part. J\'ai mal à la tête (headache), au dos (back), aux dents (teeth), au ventre (stomach), à la gorge (throat). NOT possessive: J\'ai mal à la tête (not "ma tête"). Parts: la tête, les yeux, le nez, la bouche, le bras, la jambe.' },
    { title: 'Depuis + Present Tense', desc: 'For actions starting in past and continuing now, use PRESENT + depuis. Je travaille ici depuis 5 ans (I\'ve been working here for 5 years). Depuis quand? (Since when?). Depuis combien de temps? (For how long?). Contrast: pendant (during/for completed actions).' },
    { title: 'Medical Vocabulary', desc: 'le médecin/docteur, un rendez-vous, une ordonnance (prescription), un médicament (medicine), un symptôme, de la fièvre (fever), tousser (cough), éternuer (sneeze), se sentir mal (feel unwell), guérir (heal), avoir besoin de repos.' }
  ]
};

UNIT_DATA[20] = {
  title_fr: 'À la banque',
  title_en: 'At the Bank',
  dialogue: [
    { speaker: 'Client', fr: 'Je voudrais ouvrir un compte avec accès en ligne.', en: 'I\'d like to open an account with online access.' },
    { speaker: 'Employé', fr: 'Bien sûr. Notre appli mobile est très pratique.', en: 'Of course. Our mobile app is very convenient.' },
    { speaker: 'Client', fr: 'Est-ce que je peux faire des virements depuis mon téléphone?', en: 'Can I make transfers from my phone?' },
    { speaker: 'Employé', fr: 'Oui, et aussi payer sans contact avec Apple Pay ou Google Pay.', en: 'Yes, and also pay contactlessly with Apple Pay or Google Pay.' },
    { speaker: 'Client', fr: 'Parfait. Et pour la sécurité?', en: 'Perfect. And for security?' },
    { speaker: 'Employé', fr: 'Vous aurez l\'authentification à deux facteurs et les notifications en temps réel.', en: 'You\'ll have two-factor authentication and real-time notifications.' }
  ],
  grammar: [
    { title: 'Banking Vocabulary', desc: 'la banque, un compte (account), un compte courant (checking), un compte d\'épargne (savings), un virement (transfer), retirer (withdraw), déposer (deposit), le solde (balance), un prêt (loan), le taux d\'intérêt (interest rate), un distributeur/DAB (ATM).' },
    { title: 'Financial Transactions', desc: 'Je voudrais ouvrir un compte. Faire un virement (make a transfer). Encaisser un chèque (cash a check). Payer par carte (pay by card). Payer sans contact (contactless). Signer (sign). Le code PIN. Le relevé de compte (bank statement).' },
    { title: 'Numbers: Large Amounts', desc: 'cent (100), deux cents (200) but deux cent un (201 - no s before another number). mille (1000, invariable). un million de (1,000,000 - needs "de"). Currency: euros et centimes. 1 500€ = mille cinq cents euros.' }
  ]
};

UNIT_DATA[21] = {
  title_fr: 'Les transports',
  title_en: 'Transportation',
  dialogue: [
    { speaker: 'Voyageur', fr: 'Je cherche la Tour Eiffel. Mon GPS ne fonctionne plus.', en: 'I\'m looking for the Eiffel Tower. My GPS isn\'t working anymore.' },
    { speaker: 'Passant', fr: 'Pas de problème. Vous pouvez prendre le métro ou commander un Uber.', en: 'No problem. You can take the metro or order an Uber.' },
    { speaker: 'Voyageur', fr: 'Le métro est moins cher. Quelle ligne?', en: 'The metro is cheaper. Which line?' },
    { speaker: 'Passant', fr: 'La ligne 6, descendez à Bir-Hakeim. Vous pouvez acheter un ticket sur l\'appli.', en: 'Line 6, get off at Bir-Hakeim. You can buy a ticket on the app.' },
    { speaker: 'Voyageur', fr: 'Super, je télécharge l\'application tout de suite.', en: 'Great, I\'ll download the app right now.' },
    { speaker: 'Passant', fr: 'Bonne visite! Et rechargez votre téléphone, la batterie est basse!', en: 'Enjoy your visit! And charge your phone, the battery is low!' }
  ],
  grammar: [
    { title: 'Transportation Vocabulary', desc: 'les transports en commun (public transport), le métro, le bus, le tramway, le train, le taxi, un VTC/Uber, le vélo (bike), la trottinette (scooter), la voiture, une station, un arrêt (stop), un trajet (journey), une correspondance (transfer).' },
    { title: 'Getting Around', desc: 'Prendre le métro/bus (take the metro/bus). Changer à... (transfer at...). Descendre à... (get off at...). C\'est direct? (Is it direct?). Combien d\'arrêts? (How many stops?). C\'est quelle direction? (Which direction?). Le prochain arrive dans X minutes.' },
    { title: 'Technology & Apps', desc: 'une application/appli (app), télécharger (download), le GPS, commander (order/book), fonctionner (work/function), recharger (recharge), le trajet le plus rapide (fastest route), en temps réel (real-time), partager sa position (share location).' }
  ]
};

UNIT_DATA[22] = {
  title_fr: 'La politique',
  title_en: 'Politics',
  dialogue: [
    { speaker: 'A', fr: 'Avez-vous suivi les élections?', en: 'Have you followed the elections?' },
    { speaker: 'B', fr: 'Oui, les résultats étaient très serrés.', en: 'Yes, the results were very close.' },
    { speaker: 'A', fr: 'Que pensez-vous du nouveau gouvernement?', en: 'What do you think of the new government?' },
    { speaker: 'B', fr: 'Il est trop tôt pour juger, mais j\'espère qu\'ils tiendront leurs promesses.', en: 'It\'s too early to judge, but I hope they\'ll keep their promises.' },
    { speaker: 'A', fr: 'La politique économique sera cruciale.', en: 'Economic policy will be crucial.' },
    { speaker: 'B', fr: 'Je suis d\'accord. Le chômage reste un problème majeur.', en: 'I agree. Unemployment remains a major problem.' }
  ],
  grammar: [
    { title: 'Political Vocabulary', desc: 'les élections (elections), voter (vote), un candidat, un parti politique, le gouvernement, le président, le premier ministre, l\'Assemblée nationale, le Sénat, une loi (law), une réforme, la gauche/droite (left/right), un sondage (poll).' },
    { title: 'Espérer vs Souhaiter', desc: 'Espérer (hope) takes INDICATIVE: J\'espère qu\'il viendra (I hope he will come - future indicative). Souhaiter (wish) takes SUBJUNCTIVE: Je souhaite qu\'il vienne (I wish he would come - subjunctive). Similar: penser/croire (think/believe) take indicative in affirmative.' },
    { title: 'Discussing Current Events', desc: 'Qu\'est-ce que vous pensez de...? (What do you think of...?). À mon avis... (In my opinion...). Je suis pour/contre... (I\'m for/against...). Il paraît que... (It seems that...). Selon les sondages... (According to polls...). C\'est une question de... (It\'s a matter of...).' }
  ]
};

UNIT_DATA[23] = {
  title_fr: 'L\'économie',
  title_en: 'The Economy',
  dialogue: [
    { speaker: 'A', fr: 'Comment se porte l\'économie française en ce moment?', en: 'How is the French economy doing at the moment?' },
    { speaker: 'B', fr: 'La croissance est modérée, environ deux pour cent.', en: 'Growth is moderate, about two percent.' },
    { speaker: 'A', fr: 'Et l\'inflation?', en: 'And inflation?' },
    { speaker: 'B', fr: 'Elle reste sous contrôle, heureusement.', en: 'It remains under control, fortunately.' },
    { speaker: 'A', fr: 'Le commerce extérieur a-t-il augmenté?', en: 'Has foreign trade increased?' },
    { speaker: 'B', fr: 'Les exportations ont légèrement progressé, surtout vers l\'Allemagne.', en: 'Exports have slightly increased, especially to Germany.' }
  ],
  grammar: [
    { title: 'Economic Vocabulary', desc: 'l\'économie, la croissance (growth), la récession, l\'inflation, le chômage (unemployment), le PIB (GDP), les impôts (taxes), le budget, la dette, les exportations/importations, le commerce extérieur (foreign trade), le marché, une entreprise (company).' },
    { title: 'Expressing Change', desc: 'augmenter (increase), diminuer (decrease), progresser (progress), baisser (drop), stagner (stagnate), doubler (double). Past: ont augmenté de 5% (increased by 5%). Noun forms: une augmentation, une baisse, une hausse, une progression.' },
    { title: 'Statistics & Percentages', desc: 'X pour cent (X percent). Le taux de chômage est de 8%. Les prix ont augmenté de 3%. Par rapport à l\'année dernière (compared to last year). En hausse/baisse (rising/falling). Selon les statistiques... (According to statistics...).' }
  ]
};

UNIT_DATA[24] = {
  title_fr: 'Discours final',
  title_en: 'Final Discourse',
  dialogue: [
    { speaker: 'Professeur', fr: 'Félicitations! Vous avez terminé le cours de français.', en: 'Congratulations! You have finished the French course.' },
    { speaker: 'Étudiant', fr: 'Merci beaucoup. J\'ai appris énormément.', en: 'Thank you very much. I\'ve learned a lot.' },
    { speaker: 'Professeur', fr: 'N\'oubliez pas de pratiquer tous les jours.', en: 'Don\'t forget to practice every day.' },
    { speaker: 'Étudiant', fr: 'Je continuerai à lire et à écouter du français.', en: 'I will continue to read and listen to French.' },
    { speaker: 'Professeur', fr: 'C\'est la clé du succès. Bonne chance!', en: 'That\'s the key to success. Good luck!' },
    { speaker: 'Étudiant', fr: 'Merci pour tout. Au revoir!', en: 'Thank you for everything. Goodbye!' }
  ],
  grammar: [],
  noDrills: true  // No drills for final review - dialogue practice only
};

// Set register (formal/informal)
function setRegister(reg) {
  register = reg;
  document.getElementById('formalBtn').classList.toggle('active', reg === 'formal');
  document.getElementById('informalBtn').classList.toggle('active', reg === 'informal');
  // Update current drill display
  updateDrillDisplay();
}

// Open a unit - show detail view with dialogue, grammar, drills
function openUnit(unitId) {
  currentUnit = unitId;
  const unit = UNIT_DATA[unitId];
  if (!unit) return;

  // Update title
  document.getElementById('unitDetailTitle').textContent = `UNIT ${unitId}: ${unit.title_fr}`;

  // Render dialogue
  const dialogueHtml = unit.dialogue.map(line => `
    <div style="margin-bottom: 10px;">
      <strong style="color: var(--accent-blue);">${line.speaker}:</strong>
      <span style="color: #000;">${line.fr}</span>
      <br>
      <span style="color: #666; font-size: 14px;">${line.en}</span>
    </div>
  `).join('');
  document.getElementById('dialogueContent').innerHTML = dialogueHtml;

  // Render grammar intro (hide if empty or noDrills)
  const grammarSection = document.getElementById('grammarIntroContent').parentElement;
  if (unit.grammar && unit.grammar.length > 0) {
    const grammarHtml = unit.grammar.map(g => `
      <div style="margin-bottom: 12px;">
        <strong style="color: #8B4513;">${g.title}</strong>
        <div style="margin-top: 4px;">${g.desc}</div>
      </div>
    `).join('');
    document.getElementById('grammarIntroContent').innerHTML = grammarHtml;
    grammarSection.style.display = 'block';
  } else {
    grammarSection.style.display = 'none';
  }

  // Update drill count and hide drills section if noDrills flag set
  const unitDrills = drillsData ? drillsData.drills.filter(d => d.unit === unitId) : [];
  const drillsSection = document.getElementById('startDrillsBtn')?.parentElement;
  if (unit.noDrills || unitDrills.length === 0) {
    if (drillsSection) drillsSection.style.display = 'none';
  } else {
    if (drillsSection) drillsSection.style.display = 'block';
    document.getElementById('drillCount').textContent = unitDrills.length;
  }

  // Show unit detail view, hide others
  document.getElementById('linearView').style.display = 'none';
  document.getElementById('srsView').style.display = 'none';
  document.getElementById('unitDetailView').style.display = 'block';
}

// Close unit detail view
function closeUnitDetail() {
  document.getElementById('unitDetailView').style.display = 'none';
  document.getElementById('linearView').style.display = 'block';
}

// Play dialogue with pre-generated ElevenLabs audio
let dialogueAudio = null;
function playDialogue() {
  const unit = UNIT_DATA[currentUnit];
  if (!unit) return;

  // Stop any currently playing audio
  if (dialogueAudio) {
    dialogueAudio.pause();
    dialogueAudio = null;
  }

  // Use pre-generated MP3 from CDN audio folder (or local fallback)
  const unitNum = String(currentUnit).padStart(2, '0');
  const audioPath = cdnUrl(`${CDN_CONFIG.audio.dialogues}unit${unitNum}_dialogue.mp3`);

  dialogueAudio = new Audio(audioPath);
  dialogueAudio.onerror = () => {
    // Fallback to browser TTS if audio file not found
    console.log('Audio file not found, using browser TTS');
    let index = 0;
    function speakNext() {
      if (index >= unit.dialogue.length) return;
      const line = unit.dialogue[index];
      const utterance = new SpeechSynthesisUtterance(line.fr);
      utterance.lang = 'fr-FR';
      utterance.rate = 0.85;
      utterance.onend = () => {
        index++;
        setTimeout(speakNext, 500);
      };
      speechSynthesis.speak(utterance);
    }
    speakNext();
  };
  dialogueAudio.play();
}

// Start drills from unit detail view
function startUnitDrills() {
  loadUnitDrills(currentUnit);
}

// Start dialogue as drills - practice typing the dialogue lines
function startDialogueDrills() {
  const unit = UNIT_DATA[currentUnit];
  if (!unit || !unit.dialogue) {
    alert('No dialogue available for this unit.');
    return;
  }

  // Convert dialogue lines to drill format
  currentDrills = unit.dialogue.map((line, index) => ({
    id: `dialogue_${currentUnit}_${index}`,
    type: 'DIALOGUE',
    french: line.fr,
    french_informal: line.fr,
    english: `${line.speaker}: ${line.en}`,
    speaker: line.speaker,
    commonality: 1.0
  }));

  currentDrillIndex = 0;
  sessionCorrect = 0;
  sessionTotal = 0;

  // Hide unit detail, show drill view
  document.getElementById('unitDetailView').style.display = 'none';
  showDrill();
}

// Load drills for a unit
function loadUnitDrills(unitId) {
  if (!drillsData) {
    console.error('Drills data not loaded');
    return;
  }

  // Filter drills for this unit from the database
  const unitDrills = drillsData.drills.filter(d => d.unit === unitId);

  if (unitDrills.length === 0) {
    alert(`No drills available for Unit ${unitId} yet.`);
    return;
  }

  // Get seen drills from progress
  const progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const cards = progress.cards || {};

  // Convert to display format
  currentDrills = unitDrills.map(d => ({
    id: d.id,
    type: d.type,
    french: d.french_formal,
    french_informal: d.french_informal,
    english: d.english,
    pos_pattern: d.pos_pattern,
    commonality: d.commonality,
    seen: !!cards[d.id]
  }));

  // Sort: unseen first (by commonality), then seen
  currentDrills.sort((a, b) => {
    if (a.seen !== b.seen) return a.seen ? 1 : -1;
    return b.commonality - a.commonality;
  });

  currentDrillIndex = 0;
  console.log('Unit drills:', currentDrills.length, 'unseen:', currentDrills.filter(d => !d.seen).length);
  sessionCorrect = 0;
  sessionTotal = 0;

  // Hide unit detail, show drill view
  document.getElementById('unitDetailView').style.display = 'none';
  showDrill();
}

// Update SRS statistics display
function updateSRSStats() {
  // Use Storage.getStats() for accurate counts
  const stats = Storage.getStats();
  const totalDrills = drillsData?.total_drills || 0;

  // Calculate new cards: total drills minus cards we've seen
  const newCards = totalDrills - stats.total;

  document.getElementById('dueToday').textContent = stats.dueToday || 0;
  document.getElementById('newCards').textContent = newCards > 0 ? newCards : 0;
  document.getElementById('reviewCards').textContent = stats.learning + stats.review || 0;
  document.getElementById('masteredCards').textContent = stats.mastered || 0;

  // Update accuracy
  if (sessionTotal > 0) {
    const acc = Math.round((sessionCorrect / sessionTotal) * 100);
    document.getElementById('accuracy').textContent = acc;
  }
}

// Review units (6, 12, 18, 24) - these are refresher/revision units
const REVIEW_UNITS = [6, 12, 18, 24];

// Check if user has completed Unit 1 (all Unit 1 drills reviewed at least once)
function hasCompletedUnit1() {
  const progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const cards = progress.cards || {};
  const unit1Drills = drillsData.drills.filter(d => d.unit === 1);
  const seenCount = unit1Drills.filter(d => cards[d.id]).length;
  return seenCount >= unit1Drills.length * 0.8; // 80% threshold
}

// Start SRS session
function startSRSSession() {
  if (!drillsData) {
    alert('Drills not loaded. If using file://, try a local server.');
    return;
  }

  const unit1Complete = hasCompletedUnit1();
  const now = new Date();

  // Build drill queue with unit info and review unit tagging
  currentDrills = drillsData.drills.filter(d => d.unit <= 12).map(d => {
    const card = Storage.getCard(d.id);
    return {
      id: d.id,
      type: d.type,
      french: d.french_formal,
      french_informal: d.french_informal,
      english: d.english,
      pos_pattern: d.pos_pattern,
      commonality: d.commonality,
      unit: d.unit,
      isReviewUnit: REVIEW_UNITS.includes(d.unit),
      singleSentenceMode: unit1Complete,
      // SRS state from storage
      srsState: card.state,  // 'new', 'learning', 'review', 'mastered'
      srsDue: card.due ? new Date(card.due) : null,
      srsReps: card.reps || 0
    };
  });

  // Filter: only show NEW cards or cards that are DUE for review
  currentDrills = currentDrills.filter(d => {
    if (d.srsState === 'new') return true;  // New cards always eligible
    if (d.srsState === 'mastered') return false;  // Skip mastered
    if (d.srsDue && d.srsDue <= now) return true;  // Due for review
    return false;  // Not due yet
  });

  // Sort: NEW cards first (by commonality), then DUE cards (by due date)
  currentDrills.sort((a, b) => {
    // New cards before review cards
    if (a.srsState === 'new' && b.srsState !== 'new') return -1;
    if (b.srsState === 'new' && a.srsState !== 'new') return 1;
    // Within new: sort by commonality (most common first)
    if (a.srsState === 'new' && b.srsState === 'new') {
      const aScore = a.commonality + (a.isReviewUnit ? -0.1 : 0);
      const bScore = b.commonality + (b.isReviewUnit ? -0.1 : 0);
      return bScore - aScore;
    }
    // Within due: sort by due date (oldest first)
    return (a.srsDue || 0) - (b.srsDue || 0);
  });

  // Limit to 20 cards per session
  currentDrills = currentDrills.slice(0, 20);

  if (currentDrills.length === 0) {
    const stats = Storage.getStats();
    if (stats.total > 0 && stats.dueToday === 0) {
      alert(`All caught up! ${stats.total} cards reviewed.\nNext reviews due tomorrow.`);
    } else {
      alert('No cards available!');
    }
    return;
  }

  currentDrillIndex = 0;
  sessionCorrect = 0;
  sessionTotal = 0;
  currentMode = 'srs';

  document.getElementById('srsView').style.display = 'none';
  showDrill();
}

// Show drill view
function showDrill() {
  document.getElementById('drillView').classList.add('active');
  document.getElementById('linearView').style.display = 'none';
  updateDrillDisplay();
}

// Update drill display
function updateDrillDisplay() {
  const drill = currentDrills[currentDrillIndex];
  if (!drill) return;

  document.getElementById('drillType').textContent = drill.type.toUpperCase();
  document.getElementById('drillProgress').textContent = `${currentDrillIndex + 1} / ${currentDrills.length}`;

  let frenchText = drill.french;
  // Apply tu conversion if informal
  if (register === 'informal') {
    frenchText = convertToTu(frenchText);
  }

  const promptFr = document.getElementById('promptFr');
  const promptEn = document.getElementById('promptEn');
  const grammarHints = document.getElementById('grammarHints');
  const hintsContent = document.getElementById('hintsContent');

  promptFr.textContent = frenchText;
  promptEn.textContent = drill.english || '(translate to French)';

  // Handle drill mode display
  if (drillMode === 'translate') {
    // Translation mode: show English prompt, hide French answer, show grammar hints
    if (drill.english && drill.english.trim()) {
      // Has English - show English, hide French
      promptEn.style.display = 'block';
      promptEn.style.fontSize = '20px';
      promptFr.style.display = 'none';
    } else {
      // No English - show French with instruction to type it
      promptEn.textContent = '(Type the French sentence below)';
      promptEn.style.display = 'block';
      promptEn.style.fontSize = '14px';
      promptFr.style.display = 'block';
      promptFr.style.fontSize = '20px';
    }
    grammarHints.style.display = 'block';
    hintsContent.textContent = generateGrammarHints(frenchText, drill.english || '');
  } else {
    // Repeat mode: show French to copy, English below, no hints
    promptFr.style.display = 'block';
    promptFr.style.fontSize = '22px';
    promptEn.style.display = 'block';
    promptEn.style.fontSize = '14px';
    grammarHints.style.display = 'none';
  }

  // Reset input
  const input = document.getElementById('userInput');
  input.value = '';
  input.className = '';
  input.focus();

  // Reset feedback
  document.getElementById('feedback').classList.remove('show', 'success', 'error');

  // Reset buttons
  document.getElementById('checkBtn').style.display = 'inline-block';
  document.getElementById('nextBtn').style.display = 'none';
}

// Convert formal to informal
function convertToTu(text) {
  return text
    .replace(/\bvous\b/gi, 'tu')
    .replace(/\bvotre\b/gi, 'ton')
    .replace(/\bvos\b/gi, 'tes')
    .replace(/\ballez\b/gi, 'vas')
    .replace(/\bavez\b/gi, 'as')
    .replace(/\bêtes\b/gi, 'es')
    .replace(/Comment allez-vous/gi, 'Comment vas-tu');
}

// Check answer
function checkAnswer() {
  const input = document.getElementById('userInput');
  const drill = currentDrills[currentDrillIndex];

  let expected = drill.french;
  if (register === 'informal') {
    expected = convertToTu(expected);
  }

  // Use error classifier
  const result = FSI_Error.classify(input.value, expected);

  const feedback = document.getElementById('feedback');
  const feedbackTitle = document.getElementById('feedbackTitle');
  const feedbackDetail = document.getElementById('feedbackDetail');
  const drillLink = document.getElementById('drillLink');

  if (result.correct) {
    input.className = 'correct';
    feedback.className = 'feedback show success';
    feedbackTitle.textContent = 'Correct!';
    feedbackDetail.textContent = expected;
    drillLink.style.display = 'none';

    // Track correct answer
    sessionCorrect++;
    sessionTotal++;

    // Mark drill as seen for Unit 1 completion tracking
    // Update SRS storage with review result
    Storage.reviewCard(drill.id, 2);  // quality=2 (good)
    Storage.setUnitProgress(currentUnit, currentDrillIndex, drill.id);

    // Auto-advance after 1 second
    setTimeout(() => nextDrill(), 1000);
  } else {
    input.className = 'incorrect';
    feedback.className = 'feedback show error';
    feedbackTitle.textContent = result.primaryError?.type || 'Incorrect';
    feedbackDetail.innerHTML = result.feedback.replace(/\n/g, '<br>');
    sessionTotal++;

    if (result.primaryError?.drillLink) {
      drillLink.textContent = `Review: ${result.primaryError.drillLink}`;
      drillLink.style.display = 'inline-block';
    } else {
      drillLink.style.display = 'none';
    }

    // SRS: Add wrong drill back to queue for later review
    if (currentMode === 'srs') {
      const wrongDrill = {...drill, wrongCount: (drill.wrongCount || 0) + 1};
      // Insert it 3-5 drills later for immediate reinforcement
      const insertAt = Math.min(currentDrillIndex + 3 + Math.floor(Math.random() * 3), currentDrills.length);
      currentDrills.splice(insertAt, 0, wrongDrill);
    }

    // Show next button
    document.getElementById('checkBtn').style.display = 'none';
    document.getElementById('nextBtn').style.display = 'inline-block';
  }
}

// Next drill
function nextDrill() {
  currentDrillIndex++;
  if (currentDrillIndex >= currentDrills.length) {
    // Session complete
    closeDrill();
    const acc = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0;
    alert(`Session Complete!\n\nCorrect: ${sessionCorrect}/${sessionTotal}\nAccuracy: ${acc}%`);
  } else {
    updateDrillDisplay();
  }
}

// Show hint
function showHint() {
  const drill = currentDrills[currentDrillIndex];
  let expected = drill.french;
  if (register === 'informal') {
    expected = convertToTu(expected);
  }
  // Show first few characters
  const hint = expected.substring(0, Math.min(10, expected.length)) + '...';
  alert('Hint: ' + hint);
}

// Skip drill
function skipDrill() {
  nextDrill();
}

// Close drill view
function closeDrill() {
  document.getElementById('drillView').classList.remove('active');
  document.getElementById('drillView').classList.remove('fullscreen');
  updateStatsBar();  // Refresh stats after drill session
  // Return to correct view based on current mode
  if (currentMode === 'srs') {
    document.getElementById('srsView').style.display = 'block';
    updateSRSStats();  // Update SRS stats to show remaining cards
  } else if (currentUnit) {
    // Return to unit detail view if we came from a unit
    document.getElementById('unitDetailView').style.display = 'block';
    renderUnits();  // Refresh unit progress
  } else {
    document.getElementById('linearView').style.display = 'block';
    renderUnits();  // Refresh unit progress
  }
}

// Show save indicator animation
function showSaveIndicator() {
  const indicator = document.getElementById('saveIndicator');
  if (indicator) {
    indicator.classList.remove('show');
    void indicator.offsetWidth; // Force reflow
    indicator.classList.add('show');
  }
}

// Toggle fullscreen mode for drill view
function toggleFullscreen() {
  const drillView = document.getElementById('drillView');
  const btn = document.getElementById('fullscreenBtn');
  drillView.classList.toggle('fullscreen');
  btn.textContent = drillView.classList.contains('fullscreen') ? '✕' : '⛶';
}

// Play audio - use generated MP3 if available, fallback to TTS
let currentAudio = null;
let audioFallbackUsed = false;

let audioEndCallback = null;

function playAudio(lang = 'fr', onComplete = null) {
  // Stop ALL audio first
  speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  audioFallbackUsed = false;
  audioEndCallback = onComplete;

  const drill = currentDrills[currentDrillIndex];
  if (!drill) {
    if (onComplete) onComplete();
    return;
  }

  // Use audio mapping if available (maps drill ID to correct audio file)
  // audioMapping fixes 48% misaligned audio files discovered via transcription
  // If drill NOT in mapping, skip audio entirely (may contain garbage like "WE DON'T COUNT IT")
  const audioFileId = audioMapping ? audioMapping[drill.id] : null;

  const useTTSFallback = () => {
    if (audioFallbackUsed) return;
    audioFallbackUsed = true;
    currentAudio = null;

    // Always read from screen to ensure sync
    const text = lang === 'fr'
      ? document.getElementById('promptFr').textContent
      : document.getElementById('promptEn').textContent;
    if (!text) {
      if (audioEndCallback) audioEndCallback();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'fr' ? 'fr-FR' : 'en-GB';
    utterance.rate = 0.9;
    utterance.onend = () => { if (audioEndCallback) audioEndCallback(); };
    speechSynthesis.speak(utterance);
  };

  // If no valid audio mapping, use TTS immediately (avoids garbage audio)
  if (!audioFileId) {
    console.log('No audio mapping for', drill.id, '- using TTS');
    useTTSFallback();
    return;
  }

  const audioFile = cdnUrl(`${CDN_CONFIG.audio.drills}${audioFileId}_${lang}.mp3`);
  console.log('Loading audio:', drill.id, '->', audioFileId, lang, audioFile);

  // Check if MP3 exists first
  currentAudio = new Audio();

  // Only play if file loads successfully
  currentAudio.oncanplaythrough = () => {
    if (!audioFallbackUsed) {
      currentAudio.play().catch(() => {});
    }
  };

  currentAudio.onended = () => { if (audioEndCallback) audioEndCallback(); };
  currentAudio.onerror = useTTSFallback;

  // Try MP3 first, fall back to TTS if error
  currentAudio.src = audioFile;

  // Timeout fallback if load takes too long
  setTimeout(() => {
    if (!audioFallbackUsed && currentAudio && currentAudio.readyState < 3) {
      useTTSFallback();
    }
  }, 1000);
}

function playAudioEn() {
  playAudio('en');
}

// ============================================
// VOICE RECOGNITION - Optimized for Non-Native Speakers
// ============================================

let recognition = null;
let isRecording = false;
let handsFreeMode = false;
let handsFreeActive = false;
let slowMode = false;
let listenTimeout = null;

// Normalize text for comparison (strip accents, lowercase, remove punctuation)
function normalizeForComparison(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // Strip accents
    .replace(/[^a-z0-9\s]/g, '')  // Remove punctuation
    .replace(/\s+/g, ' ')  // Normalize spaces
    .trim();
}

// Fuzzy match for non-native speakers (allows ~30% error)
function fuzzyMatch(spoken, expected) {
  const s = normalizeForComparison(spoken);
  const e = normalizeForComparison(expected);

  // Exact match after normalization
  if (s === e) return { match: true, score: 100 };

  // Check word-by-word similarity
  const spokenWords = s.split(' ').filter(w => w.length > 0);
  const expectedWords = e.split(' ').filter(w => w.length > 0);

  let matchedWords = 0;
  for (const sw of spokenWords) {
    for (const ew of expectedWords) {
      if (sw === ew || levenshteinSimilarity(sw, ew) > 0.6) {
        matchedWords++;
        break;
      }
    }
  }

  const score = (matchedWords / Math.max(spokenWords.length, expectedWords.length)) * 100;
  return { match: score >= 60, score: Math.round(score) };  // 60% threshold for non-natives
}

// Levenshtein similarity (0-1)
function levenshteinSimilarity(a, b) {
  if (a.length === 0) return b.length === 0 ? 1 : 0;
  if (b.length === 0) return 0;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j-1] === b[i-1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i-1][j] + 1,
        matrix[i][j-1] + 1,
        matrix[i-1][j-1] + cost
      );
    }
  }

  const maxLen = Math.max(a.length, b.length);
  return 1 - (matrix[b.length][a.length] / maxLen);
}

// Initialize speech recognition
function initVoiceRecognition() {
  // Reuse existing recognition object to avoid permission prompts
  if (recognition) return true;
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn('Speech recognition not supported');
    document.getElementById('micBtn').classList.add('disabled');
    return false;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.continuous = true;  // Keep listening until timeout
  recognition.interimResults = true;
  recognition.maxAlternatives = 5;

  recognition.onstart = () => {
    isRecording = true;
    document.getElementById('micBtn').classList.add('recording');
    document.getElementById('voiceStatus').textContent = '🎤 Listening...';
    document.getElementById('voiceStatus').style.color = '#dc3545';
    
    // Calculate timeout based on expected response length
    const drill = currentDrills[currentDrillIndex];
    const expectedLen = drill?.french?.length || 20;
    // ~100ms per character + base time, more in slow mode
    const baseTime = slowMode ? 4000 : 2500;
    const perCharTime = slowMode ? 120 : 80;
    const timeout = baseTime + (expectedLen * perCharTime);
    
    if (listenTimeout) clearTimeout(listenTimeout);
    listenTimeout = setTimeout(() => {
      if (isRecording && recognition) {
        recognition.stop();
      }
    }, timeout);
  };

  recognition.onresult = (event) => {
    const results = event.results;
    const lastResult = results[results.length - 1];

    if (lastResult.isFinal) {
      // Try all alternatives to find best match
      const drill = currentDrills[currentDrillIndex];
      const expected = drill.french;

      let bestTranscript = lastResult[0].transcript;
      let bestScore = 0;

      for (let i = 0; i < lastResult.length; i++) {
        const alt = lastResult[i].transcript;
        const result = fuzzyMatch(alt, expected);
        if (result.score > bestScore) {
          bestScore = result.score;
          bestTranscript = alt;
        }
      }

      document.getElementById('userInput').value = bestTranscript;
      document.getElementById('voiceStatus').textContent = 'Heard: "' + bestTranscript + '" (' + bestScore + '% match)';
      document.getElementById('voiceStatus').style.color = bestScore >= 60 ? '#28a745' : '#ffc107';

      // Auto-check in hands-free mode
      if (handsFreeMode) {
        setTimeout(() => checkVoiceAnswer(bestTranscript, expected), 300);
      }
    } else {
      document.getElementById('voiceStatus').textContent = '🎤 "' + lastResult[0].transcript + '"...';
    }
  };

  recognition.onerror = (event) => {
    let msg = '';
    switch(event.error) {
      case 'no-speech': msg = 'No speech heard - try again'; break;
      case 'audio-capture': msg = 'No microphone found'; break;
      case 'not-allowed': msg = 'Mic blocked - allow in browser'; break;
      default: msg = event.error;
    }
    document.getElementById('voiceStatus').textContent = msg;
    document.getElementById('voiceStatus').style.color = '#dc3545';
    stopRecording();

    // In hands-free, retry after a pause
    if (handsFreeMode && event.error === 'no-speech') {
      setTimeout(() => startListening(), 2000);
    }
  };

  recognition.onend = () => {
    stopRecording();
  };

  return true;
}

function checkVoiceAnswer(spoken, expected) {
  const result = fuzzyMatch(spoken, expected);
  const drill = currentDrills[currentDrillIndex];

  if (result.match) {
    // Good enough for a non-native speaker!
    document.getElementById('userInput').value = expected;  // Show correct version
    document.getElementById('voiceStatus').textContent = 'Correct! (' + result.score + '%)';
    document.getElementById('voiceStatus').style.color = '#28a745';

    // Trigger success
    const input = document.getElementById('userInput');
    input.className = 'correct';
    const feedback = document.getElementById('feedback');
    feedback.className = 'feedback show success';
    document.getElementById('feedbackTitle').textContent = 'Correct!';
    document.getElementById('feedbackDetail').textContent = expected;

    sessionCorrect++;
    sessionTotal++;

    // Save progress
    // Update SRS storage with review result
    Storage.reviewCard(drill.id, 2);  // quality=2 (good)
    Storage.setUnitProgress(currentUnit, currentDrillIndex, drill.id);

    // Play French confirmation, then auto-advance
    if (handsFreeMode) {
      playAudio('fr', () => {
        // After confirmation finishes, advance to next
        setTimeout(() => {
          nextDrill();
          setTimeout(() => startHandsFreeFlow(), 300);
        }, 300);
      });
    } else {
      setTimeout(() => nextDrill(), 1500);
    }
  } else {
    // Show what was expected
    document.getElementById('voiceStatus').textContent = 'Try again (' + result.score + '%)';
    document.getElementById('voiceStatus').style.color = '#dc3545';

    const feedback = document.getElementById('feedback');
    feedback.className = 'feedback show error';
    document.getElementById('feedbackTitle').textContent = 'Not quite';
    document.getElementById('feedbackDetail').innerHTML = 'You said: "' + spoken + '"<br>Expected: "' + expected + '"';

    sessionTotal++;

    // SRS: Re-queue wrong drill
    if (currentMode === 'srs') {
      const wrongDrill = {...drill, wrongCount: (drill.wrongCount || 0) + 1};
      const insertAt = Math.min(currentDrillIndex + 3 + Math.floor(Math.random() * 3), currentDrills.length);
      currentDrills.splice(insertAt, 0, wrongDrill);
    }

    // In hands-free, replay French then listen again
    if (handsFreeMode) {
      setTimeout(() => {
        playAudio('fr', () => {
          // After replay finishes, listen for retry
          setTimeout(() => startListening(), 300);
        });
      }, 1500);  // Brief pause to read feedback
    }
  }
}

function toggleVoiceInput() {
  if (!recognition && !initVoiceRecognition()) {
    alert('Voice not supported. Use Chrome or Edge.');
    return;
  }

  if (isRecording) {
    recognition.stop();
  } else {
    startListening();
  }
}

function startListening() {
  if (!recognition) initVoiceRecognition();
  if (isRecording) return;

  // HARD STOP all audio before listening
  speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }

  document.getElementById('userInput').value = '';
  try {
    recognition.start();
  } catch (e) {
    setTimeout(() => startListening(), 200);
  }
}

function stopRecording() {
  isRecording = false;
  document.getElementById('micBtn').classList.remove('recording');
}

// TRUE HANDS-FREE FLOW
function startHandsFreeFlow() {
  if (!handsFreeMode) return;
  handsFreeActive = true;

  const drill = currentDrills[currentDrillIndex];
  if (!drill) {
    handsFreeActive = false;
    return;
  }

  document.getElementById('voiceStatus').textContent = 'Playing audio...';
  document.getElementById('voiceStatus').style.color = '#666';

  // Play prompt, wait for it to END, then listen
  playAudio('en', () => {
    // Ensure audio fully stopped before listening
    speechSynthesis.cancel();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    setTimeout(() => {
      document.getElementById('voiceStatus').textContent = '🎤 Say it in French!';
      startListening();
    }, 300);
  });
}

function setupHandsFreeMode() {
  const checkbox = document.getElementById('handsFreeMode');
  const slowCheckbox = document.getElementById('slowMode');
  
  // Slow mode toggle
  slowCheckbox.addEventListener('change', (e) => {
    slowMode = e.target.checked;
  });
  
  checkbox.addEventListener('change', (e) => {
    handsFreeMode = e.target.checked;

    if (handsFreeMode) {
      if (!recognition) initVoiceRecognition();
      document.getElementById('voiceStatus').textContent = 'Hands-free ON';
      document.getElementById('voiceStatus').style.color = '#28a745';

      // Start if already in a drill
      if (document.getElementById('drillView').classList.contains('active')) {
        startHandsFreeFlow();
      }
    } else {
      handsFreeActive = false;
      if (recognition && isRecording) recognition.stop();
      document.getElementById('voiceStatus').textContent = '';
    }
  });
}

// Hook into drill display updates
const originalUpdateDrillDisplay = updateDrillDisplay;
updateDrillDisplay = function() {
  originalUpdateDrillDisplay();

  if (handsFreeMode) {
    setTimeout(() => startHandsFreeFlow(), 500);
  }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupHandsFreeMode();
  initVoiceRecognition();
});


// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('drillView').classList.contains('active')) return;

  if (e.key === 'Enter') {
    if (document.getElementById('nextBtn').style.display !== 'none') {
      nextDrill();
    } else {
      checkAnswer();
    }
  } else if (e.key === 'Tab') {
    e.preventDefault();
    showHint();
  } else if (e.key === 'Escape') {
    closeDrill();
  }
});

// Event listeners (Chrome extension CSP requires this instead of inline onclick)
document.getElementById('exportBtn')?.addEventListener('click', exportProgress);
document.getElementById('importBtn')?.addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile')?.addEventListener('change', importProgress);
document.getElementById('linearModeBtn')?.addEventListener('click', () => setMode('linear'));
document.getElementById('srsModeBtn')?.addEventListener('click', () => setMode('srs'));
document.getElementById('startSRSBtn')?.addEventListener('click', startSRSSession);
document.getElementById('closeUnitBtn')?.addEventListener('click', closeUnitDetail);
document.getElementById('playDialogueBtn')?.addEventListener('click', playDialogue);
document.getElementById('practiceDialogueBtn')?.addEventListener('click', startDialogueDrills);
document.getElementById('startDrillsBtn')?.addEventListener('click', startUnitDrills);
document.getElementById('playFrBtn')?.addEventListener('click', () => playAudio('fr'));
document.getElementById('playEnBtn')?.addEventListener('click', () => playAudio('en'));
document.getElementById('fullscreenBtn')?.addEventListener('click', toggleFullscreen);
document.getElementById('closeDrillBtn')?.addEventListener('click', closeDrill);
document.getElementById('formalBtn')?.addEventListener('click', () => setRegister('formal'));
document.getElementById('informalBtn')?.addEventListener('click', () => setRegister('informal'));
document.getElementById('repeatBtn')?.addEventListener('click', () => setDrillMode('repeat'));
document.getElementById('translateBtn')?.addEventListener('click', () => setDrillMode('translate'));
document.getElementById('micBtn')?.addEventListener('click', toggleVoiceInput);
document.getElementById('hintBtn')?.addEventListener('click', showHint);
document.getElementById('skipBtn')?.addEventListener('click', skipDrill);
document.getElementById('checkBtn')?.addEventListener('click', checkAnswer);
document.getElementById('nextBtn')?.addEventListener('click', nextDrill);

// Title style - Style 32: Fleur accent with tricolor underline
const TITLE_STYLES = [
  `<div style="text-align: center; padding: 15px;">
    <div style="font-size: 12px; color: #002395;">⚜</div>
    <div style="font-family: Georgia, serif; font-size: 28px; font-weight: normal; color: #333;">Rhodes French</div>
    <div style="height: 3px; background: linear-gradient(to right, #002395, #fff, #ED2939); margin: 10px auto; width: 150px;"></div>
    <div style="font-size: 11px; color: #888; letter-spacing: 3px;">COMPLETE COURSE</div>
  </div>`
];

function setTitleStyle(index) {
  const display = document.getElementById('titleDisplay');
  if (display && TITLE_STYLES[index]) {
    display.innerHTML = TITLE_STYLES[index];
  }
  // Update button states
  document.querySelectorAll('.title-option').forEach((btn, i) => {
    if (i === index) {
      btn.style.background = '#002395';
      btn.style.color = 'white';
      btn.classList.add('active');
    } else {
      btn.style.background = '#fff';
      btn.style.color = '#333';
      btn.classList.remove('active');
    }
  });
  // Save preference
  localStorage.setItem('fsi_title_style', index);
}

// Title option click handlers
document.querySelectorAll('.title-option').forEach(btn => {
  btn.addEventListener('click', () => {
    const index = parseInt(btn.dataset.title);
    setTitleStyle(index);
  });
});

// Always apply the single title style
setTitleStyle(0);

// Initialize
loadCourse();
