# Computer Use Tool Issues Log

## Session: 2025-12-28 Firebase Setup

### Issues Encountered

1. **Virtual display clicks not registering on Firebase cards**
   - Clicked on "Get started by setting up a Firebase project" card multiple times
   - Coordinates appeared correct (525, 440) but nothing happened
   - Same issue on multiple attempts with single and double clicks
   - **Workaround**: Had to use Tab + Enter keyboard navigation instead

2. **Chrome opened on user's desktop instead of virtual display**
   - `DISPLAY=:10 google-chrome` opened tab in existing Chrome session on :0
   - Chrome shares sessions across displays by default
   - **Fix needed**: Use `--user-data-dir` flag for isolated profile, or use Firefox

3. **Firefox worked but clicks still unreliable**
   - Firefox opened correctly on :10
   - Clicks on page elements often didn't register
   - Move + click separately sometimes helped, sometimes not

4. **Text input worked only after Tab navigation**
   - Clicking on input fields didn't focus them
   - Had to Tab to input field, then typing worked
   - Direct `xdotool type` after click did nothing

5. **Accidental link clicks instead of button clicks**
   - Pressed Enter when focused on a link instead of Continue button
   - Opened help page in new tab instead of proceeding

6. **Coordinates may be off due to scaling/resolution**
   - 1920x1080 virtual display
   - Screenshots showed correct layout but clicks missed targets
   - Possible DPI scaling issue?

### Root Causes (Hypotheses)

1. **xdotool click doesn't wait for window focus**
   - Window may not be properly focused when click sent
   - Need `windowactivate --sync` before clicks

2. **Web page elements need time to become interactive**
   - JavaScript-heavy pages like Firebase console
   - Elements visible but not yet clickable
   - Need longer delays after page load

3. **Virtual display lacks window manager context**
   - Xvfb alone may not handle focus correctly
   - May need a lightweight WM like openbox running

4. **Mouse position vs click position mismatch**
   - `mousemove X Y click 1` may not be atomic
   - Try `xdotool mousemove --sync X Y click 1`

### Recommendations

1. **Always use real desktop for browser automation** (user's desktops 2-4)
2. **Add --sync flag to xdotool commands**
3. **Add explicit waits after clicks before screenshots**
4. **Prefer keyboard navigation (Tab + Enter) over mouse clicks**
5. **Use window activation before any interaction**:
   ```bash
   DISPLAY=:X xdotool search --name "Window" windowactivate --sync
   DISPLAY=:X xdotool mousemove --sync X Y click 1
   ```

### Time Wasted

- ~10 minutes trying to click Firebase card on virtual display
- Would have taken <1 minute on real desktop

---

## Policy Update Needed

Virtual displays (:10+) should only be used for:
- Headless testing
- Parallel isolated tasks

Real desktops (2, 3, 4) should be used for:
- Any interactive browser automation
- Tasks requiring reliable clicking

---

## Session: 2025-12-28 Google Sheets Setup

### CRITICAL ERROR: Wrong Google Account

**Issue**: Opened Google Sheets in personal account instead of Rhodes account

**What happened**:
- Used `google-chrome "https://docs.google.com/spreadsheets/u/0/create"`
- `/u/0/` defaults to first logged-in account (personal)
- Should have used Rhodes account

**Fix needed**:
- ALWAYS verify which Google account is active before creating resources
- Use account switcher URL: `https://docs.google.com/spreadsheets/u/1/create` or `/u/2/` etc
- Or explicitly switch accounts first: `https://accounts.google.com/AccountChooser`
- ASK USER which account number Rhodes is before proceeding

**Prevention**:
1. Before ANY Google service action, confirm account
2. Take screenshot and verify account avatar/email in top-right
3. Use explicit account index in URL (/u/0/, /u/1/, /u/2/)
4. When in doubt, ASK USER for the correct account index

**CORRECT PROCEDURE for Rhodes account**:
1. User switches Chrome profile to Rhodes (rhodesintel@gmail.com)
2. Use the switched tab/window for all Rhodes operations
3. DO NOT use `/u/0/` URLs - use profile switching instead
4. Verify profile by checking avatar in top-right corner of Chrome

### ERROR: Typed in wrong window/location
- Attempted Ctrl+T then type URL
- Typing went to wrong place (not URL bar?)
- Need to verify URL bar is focused before typing
- Should use xdotool key ctrl+l to focus URL bar explicitly

### ERROR: Forgot to update firestoreEnabled check
- Replaced Firebase with Google Sheets but left `firestoreEnabled` check
- Should have changed to `SHEETS_WEBHOOK_URL` check immediately
- Trivial oversight that broke the entire feature
- **Always search for all references when changing a system**
