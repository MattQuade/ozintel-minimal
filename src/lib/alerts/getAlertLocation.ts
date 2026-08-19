/**
 * Alert-only geolocation helper.
 * Native (Capacitor): @capacitor/geolocation
 * Web: navigator.geolocation
 * Never throws — SMS can still send without coordinates.
 */

export type AlertCoords = { lat: number; lng: number };

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 3500,
  maximumAge: 60000,
} as const;

async function getBrowserLocation(): Promise<AlertCoords | null> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return null;
  }
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS);
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (geoErr) {
    console.warn("Browser geolocation failed:", geoErr);
    return null;
  }
}

async function getNativeLocation(): Promise<AlertCoords | null> {
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
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: GEO_OPTIONS.enableHighAccuracy,
      timeout: GEO_OPTIONS.timeout,
      maximumAge: GEO_OPTIONS.maximumAge,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (geoErr) {
    console.warn("Capacitor geolocation failed:", geoErr);
    return null;
  }
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
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
  } catch {
    return null;
  }
}
