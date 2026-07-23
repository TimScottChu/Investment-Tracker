# Investment Tracker

Mobile-first PWA for manually logging cryptocurrency buys and sells in USD.

## Version 1

- ETH and USDT transaction entry
- USD amount and execution-rate input with automatic quantity calculation
- Weighted-average cost basis
- Per-sale realized gain/loss in USD and percent
- Cumulative realized and unrealized performance
- Optional Binance ETH/USDT reference price with manual override
- Editable ledger entries
- CSV export and JSON backup/restore
- Device-local storage and offline app shell

No Binance account connection or API credentials are used. Transaction data remains in the browser unless exported.

## Local development

```text
npm run dev
```

After changes:

```text
npm run build
npm test
```
