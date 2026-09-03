# OzIntel

Alert pad (SAFE ARRIVAL / SEND HELP) plus siloed Accounting, receipts, and operations. Live production deploys from GitHub `main` on Render.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Restore an approved account from the home screen. Accounting, receipts, and ops then ask for a 4-digit PIN (Set PIN the first time, Enter PIN after that). Unlock lasts 30 minutes. Alerts stay on restore-by-email only.

## Notes

- Invoice lines can be GST-inclusive; GST is 1/11 (`src/lib/accounting/invoiceMath.ts`).
- `/accounting/shops` is the receipt-OCR supplier chip list, not bills.
- Persistent data lives in `data/` locally, or `OZINTEL_DATA_DIR` on Render. Do not delete that path.
- PIN hashes are stored in `accounting-pins.json` next to other account data, not on the user record.
