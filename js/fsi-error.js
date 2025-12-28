/**
 * FSI Course 2.0 - Error Classification System
 * Analyzes user input against expected French, identifies error types
 *
 * Error Types:
 * 1. spelling - Typos, accent errors
 * 2. grammar - Conjugation, agreement, article errors
 * 3. word_order - French word order violations
 * 4. confusable - Common confusion pairs (son/sa, au/à la)
 */

const FSI_Error = {
  // French accent normalization
  accents: {
    'a': ['à', 'â'],
    'e': ['é', 'è', 'ê', 'ë'],
    'i': ['î', 'ï'],
    'o': ['ô'],
    'u': ['ù', 'û', 'ü'],
    'c': ['ç'],
    'oe': ['œ']
  },

  // Normalize for comparison (lowercase, strip punctuation, normalize hyphens)
  normalize(text) {
    return text
      .toLowerCase()
      .replace(/-/g, ' ')  // Treat hyphens as spaces (Est-elle = Est elle)
      .replace(/[.,!?;:'"«»]/g, '')  // Strip punctuation
      .trim()
      .replace(/\s+/g, ' ');  // Collapse multiple spaces
  },

  // Strip accents for fuzzy matching
  stripAccents(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  },

  // Levenshtein distance
  levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i-1) === a.charAt(j-1)) {
          matrix[i][j] = matrix[i-1][j-1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i-1][j-1] + 1,
            matrix[i][j-1] + 1,
            matrix[i-1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  },

  // Tokenize French text
  tokenize(text) {
    // Handle French contractions and punctuation
    return text
      .replace(/([.,!?;:])/g, ' $1 ')
      .replace(/([''])/g, "$1 ")
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(t => t.length > 0);
  },

  // Simple POS tagger for French (rule-based, for common patterns)
  // In production, use pre-computed POS from spaCy
  simplePOS(word) {
    const w = word.toLowerCase();

    // Articles
    if (['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'au', 'aux'].includes(w)) return 'DET';

    // Pronouns
    if (['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
         'me', 'te', 'se', 'lui', 'leur', 'y', 'en', 'moi', 'toi'].includes(w)) return 'PRON';

    // Common verbs (être, avoir, aller, faire)
    if (['suis', 'es', 'est', 'sommes', 'êtes', 'sont', 'étais', 'était', 'été',
         'ai', 'as', 'a', 'avons', 'avez', 'ont', 'avais', 'avait', 'eu',
         'vais', 'vas', 'va', 'allons', 'allez', 'vont', 'allé',
         'fais', 'fait', 'faisons', 'faites', 'font'].includes(w)) return 'VERB';

    // Verb endings
    if (w.match(/(er|ir|re|é|i|u|ant|ons|ez|ent|ais|ait|aient|ai|as|a|erai|eras|era)$/)) return 'VERB';

    // Prepositions
    if (['à', 'de', 'en', 'dans', 'sur', 'sous', 'avec', 'pour', 'par', 'chez', 'vers'].includes(w)) return 'ADP';

    // Conjunctions
    if (['et', 'ou', 'mais', 'donc', 'car', 'ni', 'que', 'qui', 'quand', 'si'].includes(w)) return 'CONJ';

    // Adverbs
    if (['très', 'bien', 'mal', 'peu', 'beaucoup', 'trop', 'assez', 'plus', 'moins',
         'toujours', 'jamais', 'souvent', 'parfois', 'ici', 'là', 'où', 'comment',
         'pourquoi', 'ne', 'pas', 'non', 'oui'].includes(w)) return 'ADV';

    // Punctuation
    if (['.', ',', '!', '?', ';', ':', "'", '"'].includes(w)) return 'PUNCT';

    // Numbers
    if (w.match(/^\d+$/) || ['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept',
         'huit', 'neuf', 'dix', 'vingt', 'cent', 'mille'].includes(w)) return 'NUM';

    // Adjectives (common endings)
    if (w.match(/(eux|euse|if|ive|al|ale|el|elle|ien|ienne|ier|ière|ique|able|ible)$/)) return 'ADJ';

    // Default to noun
    return 'NOUN';
  },

  // Get POS sequence for a sentence
  getPOSPattern(text) {
    const tokens = this.tokenize(text);
    return tokens.map(t => this.simplePOS(t)).join(' ');
  },

  // Main classification function
  classify(userInput, expected, precomputedPOS = null) {
    const errors = [];

    // Quick exact match
    if (this.normalize(userInput) === this.normalize(expected)) {
      return { correct: true, errors: [] };
    }

    const userTokens = this.tokenize(userInput);
    const expectedTokens = this.tokenize(expected);

    // 1. Check spelling errors
    const spellingErrors = this.checkSpelling(userTokens, expectedTokens);
    errors.push(...spellingErrors);

    // 2. Check grammar errors (using POS)
    const userPOS = precomputedPOS?.user || userTokens.map(t => this.simplePOS(t));
    const expectedPOS = precomputedPOS?.expected || expectedTokens.map(t => this.simplePOS(t));
    const grammarErrors = this.checkGrammar(userTokens, expectedTokens, userPOS, expectedPOS);
    errors.push(...grammarErrors);

    // 3. Check word order
    const orderErrors = this.checkWordOrder(userTokens, expectedTokens);
    errors.push(...orderErrors);

    // 4. Check confusables
    const confusableErrors = this.checkConfusables(userInput, expected);
    errors.push(...confusableErrors);

    // Deduplicate and prioritize
    const uniqueErrors = this.deduplicateErrors(errors);

    return {
      correct: false,
      errors: uniqueErrors,
      primaryError: uniqueErrors[0] || null,
      feedback: this.generateFeedback(uniqueErrors)
    };
  },

  // Check spelling errors
  checkSpelling(userTokens, expectedTokens) {
    const errors = [];

    for (let i = 0; i < userTokens.length; i++) {
      const userWord = userTokens[i];

      // Skip punctuation
      if (this.simplePOS(userWord) === 'PUNCT') continue;

      // Find closest expected word
      let minDist = Infinity;
      let closest = null;
      let closestIdx = -1;

      for (let j = 0; j < expectedTokens.length; j++) {
        const expWord = expectedTokens[j];
        const dist = this.levenshtein(userWord.toLowerCase(), expWord.toLowerCase());
        if (dist < minDist) {
          minDist = dist;
          closest = expWord;
          closestIdx = j;
        }
      }

      // If close but not exact, it's likely a spelling error
      if (minDist > 0 && minDist <= 2 && closest) {
        // Check if it's just an accent issue
        if (this.stripAccents(userWord) === this.stripAccents(closest)) {
          errors.push({
            type: 'spelling',
            subtype: 'accent',
            position: i,
            got: userWord,
            expected: closest,
            feedback: `Accent error: "${userWord}" → "${closest}"`
          });
        } else {
          errors.push({
            type: 'spelling',
            subtype: 'typo',
            position: i,
            got: userWord,
            expected: closest,
            feedback: `Spelling: "${userWord}" → "${closest}"`
          });
        }
      }
    }

    return errors;
  },

  // Check grammar errors - CONTENT-BASED, not position-based
  checkGrammar(userTokens, expectedTokens, userPOS, expectedPOS) {
    const errors = [];

    // Normalize tokens for comparison (lowercase, no punctuation)
    const userWords = userTokens
      .map(t => t.toLowerCase())
      .filter(t => this.simplePOS(t) !== 'PUNCT');
    const expectedWords = expectedTokens
      .map(t => t.toLowerCase())
      .filter(t => this.simplePOS(t) !== 'PUNCT');

    // Find ACTUALLY missing words (in expected but not in user's answer)
    const userSet = new Set(userWords);
    const missingWords = expectedWords.filter(w => !userSet.has(w));

    // Find extra words (in user's answer but not expected)
    const expectedSet = new Set(expectedWords);
    const extraWords = userWords.filter(w => !expectedSet.has(w));

    // Report missing words (but only important ones, not articles/punctuation)
    for (const word of missingWords) {
      const pos = this.simplePOS(word);
      // Skip common small words that might just be style differences
      if (['PUNCT'].includes(pos)) continue;

      errors.push({
        type: 'missing',
        subtype: pos.toLowerCase(),
        expected: word,
        expectedPOS: pos,
        feedback: `Missing: "${word}"`
      });
    }

    // Report extra words
    for (const word of extraWords) {
      const pos = this.simplePOS(word);
      if (['PUNCT'].includes(pos)) continue;

      errors.push({
        type: 'extra',
        subtype: pos.toLowerCase(),
        got: word,
        gotPOS: pos,
        feedback: `Extra word: "${word}"`
      });
    }

    // Check verb-subject agreement (je + -e, tu + -es, il + -e, etc.)
    for (let i = 0; i < userTokens.length - 1; i++) {
      if (userPOS[i] === 'PRON' && userPOS[i+1] === 'VERB') {
        const pronoun = userTokens[i].toLowerCase();
        const verb = userTokens[i+1].toLowerCase();

        // Check for common conjugation mismatches
        if (pronoun === 'je' && verb.endsWith('es')) {
          errors.push({
            type: 'grammar',
            subtype: 'verb_conjugation',
            position: i+1,
            got: userTokens[i+1],
            feedback: `With "je", use 1st person singular (not -es ending)`,
            drillLink: 'verb_conjugation'
          });
        }
        if (pronoun === 'tu' && verb.endsWith('e') && !verb.endsWith('es')) {
          errors.push({
            type: 'grammar',
            subtype: 'verb_conjugation',
            position: i+1,
            got: userTokens[i+1],
            feedback: `With "tu", use 2nd person singular (-es ending for -er verbs)`,
            drillLink: 'verb_conjugation'
          });
        }
      }
    }

    return errors;
  },

  // Check word order errors
  checkWordOrder(userTokens, expectedTokens) {
    const errors = [];

    // Normalize for comparison
    const userNorm = userTokens.map(t => t.toLowerCase()).filter(t => this.simplePOS(t) !== 'PUNCT');
    const expNorm = expectedTokens.map(t => t.toLowerCase()).filter(t => this.simplePOS(t) !== 'PUNCT');

    // Check for transpositions (adjacent swaps)
    for (let i = 0; i < userNorm.length - 1; i++) {
      if (i + 1 < expNorm.length) {
        if (userNorm[i] === expNorm[i+1] && userNorm[i+1] === expNorm[i]) {
          errors.push({
            type: 'word_order',
            position: i,
            swapped: [userNorm[i], userNorm[i+1]],
            feedback: `Word order: "${userNorm[i+1]}" should come before "${userNorm[i]}"`,
            drillLink: 'word_order'
          });
        }
      }
    }

    // Check for adjective placement (French: most adjectives after noun)
    // BANGS adjectives before: Beauty, Age, Number, Goodness, Size
    const bangs = ['beau', 'belle', 'joli', 'jolie', 'vieux', 'vieille', 'jeune', 'nouveau', 'nouvelle',
                   'bon', 'bonne', 'mauvais', 'mauvaise', 'grand', 'grande', 'petit', 'petite',
                   'gros', 'grosse', 'long', 'longue', 'premier', 'première', 'dernier', 'dernière'];

    for (let i = 0; i < userNorm.length - 1; i++) {
      const word = userNorm[i];
      const nextWord = userNorm[i+1];

      // If adjective before noun and not BANGS
      if (this.simplePOS(word) === 'ADJ' && this.simplePOS(nextWord) === 'NOUN') {
        if (!bangs.includes(word)) {
          errors.push({
            type: 'word_order',
            subtype: 'adjective_placement',
            position: i,
            got: `${word} ${nextWord}`,
            feedback: `In French, most adjectives come AFTER the noun: "${nextWord} ${word}"`,
            drillLink: 'adjective_placement'
          });
        }
      }
    }

    return errors;
  },

  // Check confusable pairs
  checkConfusables(userInput, expected) {
    const errors = [];
    const userLower = userInput.toLowerCase();
    const expLower = expected.toLowerCase();

    // Load from confusables.json in production
    const confusables = [
      { pair: ['le', 'la'], rule: 'article_gender', drill: 'unit1_articles' },
      { pair: ['un', 'une'], rule: 'article_gender', drill: 'unit2_articles' },
      { pair: ['son', 'sa'], rule: 'possessive_gender', drill: 'unit4_possessives' },
      { pair: ['mon', 'ma'], rule: 'possessive_gender', drill: 'unit4_possessives' },
      { pair: ['ton', 'ta'], rule: 'possessive_gender', drill: 'unit4_possessives' },
      { pair: ['ce', 'cette'], rule: 'demonstrative_gender', drill: 'unit3_demonstratives' },
      { pair: ['au', 'à la'], rule: 'contraction', drill: 'unit3_contractions' },
      { pair: ['du', 'de la'], rule: 'contraction', drill: 'unit4_partitives' },
      { pair: ['bon', 'bien'], rule: 'adj_vs_adv', drill: 'unit7_adjectives' },
      { pair: ['c\'est', 'il est'], rule: 'cest_vs_ilest', drill: 'unit2_etre' },
      { pair: ['savoir', 'connaître'], rule: 'know_verbs', drill: 'unit7_modals' },
      { pair: ['y', 'en'], rule: 'pronoun_y_en', drill: 'unit8_pronouns' },
      { pair: ['qui', 'que'], rule: 'relative_pronouns', drill: 'unit9_relatives' },
      { pair: ['être', 'avoir'], rule: 'auxiliary_choice', drill: 'unit9_passe_compose' }
    ];

    for (const conf of confusables) {
      const [a, b] = conf.pair;
      // User used A where expected uses B
      if (userLower.includes(a) && expLower.includes(b) && !expLower.includes(a)) {
        errors.push({
          type: 'confusable',
          got: a,
          expected: b,
          rule: conf.rule,
          feedback: `Confusion: "${a}" vs "${b}" — check ${conf.rule.replace(/_/g, ' ')}`,
          drillLink: conf.drill
        });
      }
      // User used B where expected uses A
      if (userLower.includes(b) && expLower.includes(a) && !expLower.includes(b)) {
        errors.push({
          type: 'confusable',
          got: b,
          expected: a,
          rule: conf.rule,
          feedback: `Confusion: "${b}" vs "${a}" — check ${conf.rule.replace(/_/g, ' ')}`,
          drillLink: conf.drill
        });
      }
    }

    return errors;
  },

  // Remove duplicate errors
  deduplicateErrors(errors) {
    const seen = new Set();
    return errors.filter(e => {
      const key = `${e.type}:${e.position}:${e.got}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  // Generate user-friendly feedback
  generateFeedback(errors) {
    if (errors.length === 0) return 'Correct!';

    const primary = errors[0];
    let feedback = primary.feedback;

    // Add drill suggestion if available
    if (primary.drillLink) {
      feedback += `\n→ Review: ${primary.drillLink.replace(/_/g, ' ')}`;
    }

    // Add count of other errors
    if (errors.length > 1) {
      feedback += `\n(+${errors.length - 1} other issue${errors.length > 2 ? 's' : ''})`;
    }

    return feedback;
  }
};

// Export for use in extension
if (typeof module !== 'undefined') {
  module.exports = FSI_Error;
}
