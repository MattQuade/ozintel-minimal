/**
 * Alert-only geolocation helper.
 * Native (Capacitor): @capacitor/geolocation
 * Web: navigator.geolocation
 * Never throws — SMS can still send without coordinates.
 *
 * iPhone: a high-accuracy request times out when Precise Location is off,
 * or when the first GPS fix is slow. A coarse fix still produces a map link.
 */

export type AlertCoords = { lat: number; lng: number };

const PRECISE_MS = 7000;
const COARSE_MS = 8000;
const HARD_CAP_MS = 17000;
const FRESH_MS = 2 * 60 * 1000;

type GeoOptions = {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
};

let cached: { lat: number; lng: number; at: number } | null = null;

function remember(coords: AlertCoords): AlertCoords {
  cached = { lat: coords.lat, lng: coords.lng, at: Date.now() };
  return coords;
}

function freshCache(): AlertCoords | null {
  if (!cached) return null;
  if (Date.now() - cached.at > FRESH_MS) return null;
  return { lat: cached.lat, lng: cached.lng };
}

function browserOnce(options: GeoOptions): Promise<AlertCoords | null> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (coords: AlertCoords | null) => {
      if (settled) return;
      settled = true;
      resolve(coords);
    };
    const timer = setTimeout(() => finish(null), options.timeout + 400);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        finish(
          remember({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          })
        );
      },
      (geoErr) => {
        clearTimeout(timer);
        console.warn("Browser geolocation failed:", geoErr);
        finish(null);
      },
      options
    );
  });
}

async function getBrowserLocation(): Promise<AlertCoords | null> {
  const cachedFix = freshCache();
  if (cachedFix) return cachedFix;

  const precise = await browserOnce({
    enableHighAccuracy: true,
    timeout: PRECISE_MS,
    maximumAge: FRESH_MS,
  });
  if (precise) return precise;

  const coarse = await browserOnce({
    enableHighAccuracy: false,
    timeout: COARSE_MS,
    maximumAge: 10 * 60 * 1000,
  });
  if (coarse) return coarse;

  return freshCache();
}

async function nativeOnce(options: GeoOptions): Promise<AlertCoords | null> {
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: options.enableHighAccuracy,
      timeout: options.timeout,
      maximumAge: options.maximumAge,
    });
    return remember({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    });
  } catch (geoErr) {
    console.warn("Capacitor geolocation failed:", geoErr);
    return null;
  }
}

async function getNativeLocation(): Promise<AlertCoords | null> {
  const cachedFix = freshCache();
  if (cachedFix) return cachedFix;
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const permission = await Geolocation.requestPermissions();
    const granted =
      permission.location === "granted" ||
      permission.coarseLocation === "granted";
    if (!granted) {
      console.warn("Native location permission not granted:", permission);
      return null;
    }
  } catch (geoErr) {
    console.warn("Capacitor geolocation failed:", geoErr);
    return null;
  }

  const precise = await nativeOnce({
    enableHighAccuracy: true,
    timeout: PRECISE_MS,
    maximumAge: FRESH_MS,
  });
  if (precise) return precise;
  return nativeOnce({
    enableHighAccuracy: false,
    timeout: COARSE_MS,
    maximumAge: 10 * 60 * 1000,
  });
}

/**
 * Returns coordinates for Safe Arrival / SEND HELP SMS, or null if unavailable.
 * Uses Capacitor Geolocation on native; otherwise browser geolocation.
 * Hard-capped so a hung geo prompt cannot block alert send forever.
 */
export async function getAlertLocation(): Promise<AlertCoords | null> {
  const work = async (): Promise<AlertCoords | null> => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        return await getNativeLocation();
      }
    } catch {
      // Capacitor unavailable (SSR / plain web) — fall through
    }
    return getBrowserLocation();
  };

  try {
    return await Promise.race([
      work(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), HARD_CAP_MS)),
    ]);
  } catch {
    return null;
  }
}
