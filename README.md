# Universal Trading Journal

Mobile-friendly, installable multi-instrument trading journal.

## Supported markets
Index, stocks, crypto, commodities, forex and other custom symbols. Each trade stores its market, symbol, product type, Buy/Long or Sell/Short direction, entry, quantity, stop-loss, target, optional actual exit, option details, strategy, notes and chart screenshot.

## Preserved features
- Existing monthly archive and calendar
- Existing monthly storage key and archive data structure
- Existing two-trade workflow (Trade 2 unlocks after Trade 1 SL)
- Capital, target, sessions, win rate and P&L metrics
- CSV export and JSON backup/restore including screenshots
- Existing Nifty records default to Index / NIFTY / Options / Buy
- Existing PWA icons and install support

## Publish
Upload all files in this folder to the root of your GitHub Pages repository. In GitHub: Settings → Pages → Deploy from a branch → `main` → `/(root)`.

## Data protection
The app keeps `niftyJournalMonthlyV5` and the existing screenshot IndexedDB name. Back up before deployment or clearing site data. Storage errors now show a warning. The service worker uses network-first loading for app pages and a new cache version to reduce stale HTML.

## P&L
Buy/Long: quantity × (exit − entry). Sell/Short: quantity × (entry − exit). An entered actual exit price overrides the selected target or stop-loss. Brokerage, taxes, funding and slippage are excluded.
