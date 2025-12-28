# Analytics Setup - Handoff

## Status: 90% Complete - Needs Final Deploy

### What's Done
1. ✅ Google Sheet created: https://docs.google.com/spreadsheets/d/1jzmxkOCNjQ9p6CwLAU3sOzh8-QnBmTay4c7MKcyCHc4/edit
2. ✅ Apps Script project exists: https://script.google.com/home/projects/10ptUMyaB3Z_JvlT-Lhs7Cb1iZsW_aDelc7ySlXmlpB4rfMdiaOkVd_E5/edit
3. ✅ Webhook URL in fsi-auth.js: `https://script.google.com/macros/s/AKfycbwNUVQqYVSWkbO9PTRoygc86_PALHpbf2PtWOBkeRpQUlo4RNlwWff4WD2l4IloucHn/exec`
4. ✅ fsi-srs.js updated to check `SHEETS_WEBHOOK_URL` instead of `firestoreEnabled`

### What's Broken
The Apps Script code needs to use `openById()` instead of `getActiveSpreadsheet()` because the script is standalone (not bound to sheet).

### To Fix
1. Open Apps Script: https://script.google.com/home/projects/10ptUMyaB3Z_JvlT-Lhs7Cb1iZsW_aDelc7ySlXmlpB4rfMdiaOkVd_E5/edit
2. Replace ALL code with contents of: `/home/priv/claudes/allonsy/fsi-french-content/google-apps-script.js`
3. Save (Ctrl+S)
4. Deploy → Manage deployments → Edit (pencil icon) → Version: New version → Deploy

### Key Change in Script
```javascript
// OLD (broken):
const ss = SpreadsheetApp.getActiveSpreadsheet();

// NEW (fixed):
const SHEET_ID = '1jzmxkOCNjQ9p6CwLAU3sOzh8-QnBmTay4c7MKcyCHc4';
const ss = SpreadsheetApp.openById(SHEET_ID);
```

### Test After Deploy
1. Hard refresh site: Ctrl+Shift+R on https://rhodesintel.github.io/rhodes-french/
2. Do one drill
3. Check sheet for new row in "Responses" tab

### Files Modified
- `js/fsi-auth.js` - Has webhook URL
- `js/fsi-srs.js` - Fixed to check SHEETS_WEBHOOK_URL
- `google-apps-script.js` - Updated with openById()
