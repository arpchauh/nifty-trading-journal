# Nifty Trading Journal

A mobile-friendly, installable trading journal for your Nifty options risk plan.

## Included
- Editable initial capital, target capital and number of sessions
- Separate first- and second-trade stop-loss and target settings
- Automatic daily outcomes, P&L, capital balance, win rate and target progress
- Local browser storage
- CSV export and JSON backup/restore
- Installable PWA for Android home-screen use

## Publish free with GitHub Pages
1. Create a new **public** GitHub repository, for example `nifty-trading-journal`.
2. Upload all files in this folder to the repository root.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main** and folder **/(root)**, then Save.
6. Wait for GitHub Pages to publish. Your URL will look like:
   `https://YOUR-GITHUB-USERNAME.github.io/nifty-trading-journal/`

## Add to Android home screen
1. Open the published URL in Chrome.
2. Tap the three-dot menu.
3. Choose **Install app** or **Add to Home screen**.
4. Confirm. The journal opens like an app.

## Important data note
Journal entries are stored in the browser on that device. Use **Backup data** regularly. Clearing browser storage or changing devices can remove local entries; restore from your JSON backup when needed.

## Risk logic
- First target = +Trade 1 target
- First SL and stop = -Trade 1 SL
- First SL then second target = -Trade 1 SL + Trade 2 target
- Both SL = -(Trade 1 SL + Trade 2 SL)

This is a journal, not a broker connection or trading signal. P&L excludes brokerage, taxes and slippage.
