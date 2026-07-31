# OzIntel Alerts — Capacitor (mobile GPS)

Capacitor wraps the **alerts home page** in a native iOS/Android shell so Safe Arrival / SEND HELP can use **native GPS**. Contacts stay in **on-device `localStorage` only**. SMS still goes through existing MessageMedia `/api/send-sms`.

Desktop/browser geolocation is unchanged (`navigator.geolocation` fallback) and is **not** a focus area.

## Architecture

- Native app = thin WebView loading your **deployed Next.js URL** (`server.url`).
- No full static export of the Next app.
- Location helper: `src/lib/alerts/getAlertLocation.ts`
  - **Native:** `@capacitor/geolocation` + permissions
  - **Web:** existing `navigator.geolocation`
  - If location fails, SMS still sends (without coords)

## Prerequisites

- Deployed OzIntel site (Vercel or similar) with working `/` and `/api/send-sms`
- Node.js + npm
- **Android:** Android Studio (works on Windows)
- **iOS:** macOS + Xcode (cannot build iOS on Windows)

## Configure server URL

```powershell
# PowerShell — production
$env:CAPACITOR_SERVER_URL = "https://YOUR-DEPLOYED-OZINTEL-URL"

# Local Next.js reachable from a phone on the same LAN
$env:CAPACITOR_SERVER_URL = "http://192.168.1.10:3000"
```

Or set `NEXT_PUBLIC_APP_URL` to the same value. Then:

```powershell
npm run cap:sync
```

If `CAPACITOR_SERVER_URL` is unset, the shell loads the local `www/` fallback page (reminder to configure the URL).

## One-time: add platforms

### Android (Windows OK)

```powershell
npx cap add android
npm run cap:sync
npm run cap:open:android
```

In Android Studio: sync Gradle, run on a device/emulator. Confirm location permission prompts when sending an alert.

Android location permissions are provided by `@capacitor/geolocation` (`ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION`).

### iOS (macOS + Xcode required)

On a Mac, from this repo:

```bash
npm install
export CAPACITOR_SERVER_URL="https://YOUR-DEPLOYED-OZINTEL-URL"
npx cap add ios
npm run cap:sync
npm run cap:open:ios
```

#### Required iOS privacy keys

Edit `ios/App/App/Info.plist` and add both (Capacitor Geolocation requires Always key in the plist even though alerts only use When In Use at runtime):

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>OzIntel needs your location when you send Safe Arrival or emergency SMS so contacts receive your coordinates and a map link.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>OzIntel needs your location when you send Safe Arrival or emergency SMS so contacts receive your coordinates and a map link.</string>
```

#### Ship to App Store (high level)

1. Open the project in Xcode (`npm run cap:open:ios`).
2. Set signing team, bundle id `com.ozintel.alerts`, version/build.
3. Run on a physical iPhone; grant location; send a test Safe Arrival / SEND HELP and confirm the SMS Maps link.
4. Archive → Distribute App → App Store Connect.
5. Complete privacy nutrition labels (location used for emergency/safe SMS).

`ios/` may not be committed from Windows — run `npx cap add ios` on the Mac if the folder is missing.

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run cap:sync` | Copy web assets + sync native plugins |
| `npm run cap:open:ios` | Open Xcode (macOS) |
| `npm run cap:open:android` | Open Android Studio |

## Out of scope

- Server-side contact sync
- Push notifications
- Wrapping accounting / forestry / pub / receipts specially
- Polishing desktop browser geolocation

## Verify

1. On a phone with the native build, open the alerts home (`/`).
2. Add contacts (still local to the device).
3. Allow location when prompted.
4. Send Safe Arrival or SEND HELP — SMS should include lat/lng + Maps link via existing API.
