# Decision Brief (layer-3 business intel)

Separate silo from Accounting / Operations. Home button sits under **Logistics Operations**.

## Owner flow

1. Open **Decision Brief** (needs Accounting access).
2. **Refresh from Accounting** — pulls Electricity (`1331`) / Gas (`1358`) and energy-like bank descriptions into an energy profile.
3. Share the **connect code** with an energy retailer.
4. **Scan scheme updates** — fetches curated public sources (energy.gov.au, CER) into “What changed”.

## Retailer flow (no OzIntel login)

1. Go to `/decision-brief/retailer`
2. Enter connect code + company name + email
3. Receive an **API key**
4. `POST /api/decision-brief/retailer/push` with `Authorization: Bearer <key>` and bill fields (`amountAud`, `kwh`, period dates)

## Update agent (cron)

Set `DECISION_BRIEF_SCAN_SECRET` on Render. Schedule daily:

```bash
curl -X POST https://ozintel.com.au/api/decision-brief/scan-updates \
  -H "x-ozintel-scan-secret: $DECISION_BRIEF_SCAN_SECRET"
```

Manual scan from the Decision Brief page (logged-in) also works.

## Data locations

- Owner silo: `data/owners/{email}/decision-brief/store.json`
- Global connect index + retailer registry: `data/decision-brief/`
