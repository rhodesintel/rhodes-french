/**
 * Google Apps Script - FSI French Course Analytics
 *
 * SETUP:
 * 1. Create a Google Sheet named "FSI French Analytics"
 * 2. Go to Extensions > Apps Script
 * 3. Paste this code
 * 4. Click Deploy > New deployment > Web app
 * 5. Set "Execute as" = Me, "Who has access" = Anyone
 * 6. Copy the web app URL
 * 7. Paste URL into fsi-auth.js SHEETS_WEBHOOK_URL
 */

// Sheet ID - linked directly to avoid binding issues
const SHEET_ID = '1jzmxkOCNjQ9p6CwLAU3sOzh8-QnBmTay4c7MKcyCHc4';

// Simple API key to prevent casual spam (not true security - visible in client code)
// Change this to a unique value when deploying your own instance
const API_KEY = 'rhodes-french-2024-x7k9m';

// Sheet names
const RESPONSES_SHEET = 'Responses';
const SUMMARY_SHEET = 'Summary';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Validate API key (simple spam protection)
    if (data.apiKey !== API_KEY) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Invalid API key' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.type === 'response') {
      logResponse(data.payload);
    } else if (data.type === 'progress') {
      logProgress(data.payload);
    }

    // Return JSON response (CORS handled by Apps Script for deployed web apps)
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, timestamp: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  // Health check endpoint - also used for CORS preflight
  // When deployed as "Anyone can access", Apps Script handles CORS automatically
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'ok',
      message: 'Rhodes French Analytics API',
      timestamp: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function logResponse(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(RESPONSES_SHEET);

  // Create sheet with headers if doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(RESPONSES_SHEET);
    sheet.appendRow([
      'Timestamp',
      'User ID',
      'Card ID',
      'Unit',
      'Drill Type',
      'Prompt (EN)',
      'Expected (FR)',
      'User Answer',
      'Correct',
      'Grade',
      'Response Time (ms)',
      'Errors',
      'Mode',
      'Register',
      'Card State',
      'Card Reps',
      'Card Lapses'
    ]);
    sheet.getRange(1, 1, 1, 17).setFontWeight('bold');
  }

  // Append response data
  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.userId || 'anonymous',
    data.cardId || '',
    data.unit || '',
    data.drillType || '',
    data.promptEn || '',
    data.expectedFr || '',
    data.userAnswer || '',
    data.correct ? 'TRUE' : 'FALSE',
    data.grade || '',
    data.responseTimeMs || '',
    JSON.stringify(data.errors || []),
    data.mode || '',
    data.register || '',
    data.cardState || '',
    data.cardReps || '',
    data.cardLapses || ''
  ]);
}

function logProgress(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SUMMARY_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(SUMMARY_SHEET);
    sheet.appendRow([
      'Timestamp',
      'User ID',
      'Total Reviews',
      'Correct',
      'Incorrect',
      'Accuracy %',
      'Units Completed',
      'Session Duration (min)'
    ]);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
  }

  sheet.appendRow([
    new Date().toISOString(),
    data.userId || 'anonymous',
    data.totalReviews || 0,
    data.correct || 0,
    data.incorrect || 0,
    data.accuracy || 0,
    data.unitsCompleted || 0,
    data.sessionDuration || 0
  ]);
}

// Test function
function testPost() {
  const testData = {
    type: 'response',
    apiKey: API_KEY,  // Required for authentication
    payload: {
      timestamp: new Date().toISOString(),
      userId: 'test-user',
      cardId: 'unit1_001',
      unit: 1,
      drillType: 'translation',
      promptEn: 'Good morning',
      expectedFr: 'Bonjour',
      userAnswer: 'Bonjour',
      correct: true,
      grade: 3,
      responseTimeMs: 2500,
      errors: [],
      mode: 'srs',
      register: 'formal'
    }
  };

  const e = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };

  const result = doPost(e);
  Logger.log(result.getContent());
}
