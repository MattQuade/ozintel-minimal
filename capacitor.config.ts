import type { CapacitorConfig } from "@capacitor/cli";

/**
 * OzIntel Alerts — Capacitor shell for reliable native geolocation on mobile.
 *
 * The WebView loads the deployed Next.js site (not a static export), so
 * /api/send-sms and the alerts home page keep working.
 *
 * Set CAPACITOR_SERVER_URL before `npm run cap:sync`:
 *   Production:  https://your-ozintel-deployment.example
 *   Local device: http://192.168.x.x:3000
 *
 * See docs/capacitor-alerts.md
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "";

const config: CapacitorConfig = {
  appId: "com.ozintel.alerts",
  appName: "OzIntel Alerts",
  webDir: "www",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://"),
        },
      }
    : {}),
};

export default config;
