# Decision Brief / Analysis (layer-3 business intel)

Separate silo from Accounting / Operations. Home button is labelled **Analysis**.

## Owner flow

1. Open **Analysis** (needs Accounting access).
2. **Refresh from Accounting** — pulls Electricity (`1331`) / Gas (`1358`) and energy-like bank descriptions into an energy profile.
3. Share the **connect code** with:
   - a **power retailer** (`/decision-brief/retailer`) for bill/usage data, and/or
   - a **solar/battery installer** (`/decision-brief/installer`) for quotes.
4. Review the **Subsidy schemes** catalogue (federal + NSW) — including whether discounts can stack on the same quote.
5. **Scan scheme updates** — refreshes curated public pages into “What changed” (failures are not sticky).

## Pub / business quote stacking (NSW)

**Yes — both can apply to the same eligible install** when each scheme’s rules are met:

| Scheme | Role |
| --- | --- |
| **Cheaper Home Batteries Program (federal)** | Battery discount via STCs (installer nets off quote) |
| **NSW Batteries for businesses (PDRS)** | Business battery discount via PRCs (ACP / installer) — higher when new solar is added with the battery |
| **SRES solar (federal)** | Separate solar STC discount |

Official NSW guidance states the NSW business battery discount can be combined with the Australian Government’s Cheaper Home Batteries Program. Ask the installer to show each discount line on the quote.

## Power retailer flow (no OzIntel login)

1. Go to `/decision-brief/retailer`
2. Enter connect code + company name + email
3. Receive an **API key**
4. `POST /api/decision-brief/retailer/push` with `Authorization: Bearer <key>` and bill fields (`amountAud`, `kwh`, period dates)

## Solar / battery installer flow (no OzIntel login)

1. Go to `/decision-brief/installer`
2. Enter the same connect code + installer company + email
3. Receive an **API key** (`dbi_…`)
4. `POST /api/decision-brief/installer/push` with quote fields (`solarKw`, `batteryKwh`, `quoteAud`, `paybackYears`, `notes`)

## Update agent (cron)

Set `DECISION_BRIEF_SCAN_SECRET` on Render. Schedule daily:

```bash
curl -X POST https://ozintel.com.au/api/decision-brief/scan-updates \
  -H "x-ozintel-scan-secret: $DECISION_BRIEF_SCAN_SECRET"
```

Manual scan from Analysis (logged-in) also works. Unreachable government pages no longer stick as the headline on every open.

## Data locations

- Owner silo: `data/owners/{email}/decision-brief/store.json`
- Global connect index + retailer/installer registries: `data/decision-brief/`
- Curated catalogue: `src/lib/decisionBrief/schemes.ts`
