/** Client helpers: load an image and export a cropped JPEG File. */

import {
  RECEIPT_JPEG_QUALITY,
  RECEIPT_MAX_EDGE,
} from '@/lib/client/compressReceiptImage';

export type CropRectNorm = {
  /** Left edge as fraction of image width (0–1). */
  x: number;
  /** Top edge as fraction of image height (0–1). */
  y: number;
  /** Width as fraction of image width (0–1). */
  w: number;
  /** Height as fraction of image height (0–1). */
  h: number;
};

export const FULL_CROP: CropRectNorm = { x: 0, y: 0, w: 1, h: 1 };

const MIN_FRAC = 0.08;

export function clampCrop(rect: CropRectNorm): CropRectNorm {
  let { x, y, w, h } = rect;
  x = Math.min(1 - MIN_FRAC, Math.max(0, x));
  y = Math.min(1 - MIN_FRAC, Math.max(0, y));
  w = Math.min(1 - x, Math.max(MIN_FRAC, w));
  h = Math.min(1 - y, Math.max(MIN_FRAC, h));
  return { x, y, w, h };
}

export function loadImageFromBlobUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    // crossOrigin on blob:/data: URLs breaks decode on iOS Safari.
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = url;
  });
}

async function bitmapFromBlob(blob: Blob): Promise<{
  source: ImageBitmap;
  width: number;
  height: number;
  close: () => void;
}> {
  // Prefer plain decode first (same as receipt compress — most reliable on phones).
  // Orientation option is a best-effort second try for EXIF rotation.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    bitmap = await createImageBitmap(
      blob,
      { imageOrientation: 'from-image' } as ImageBitmapOptions
    );
  }
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => {
      if (typeof bitmap.close === 'function') bitmap.close();
    },
  };
}

async function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    } catch {
      resolve(null);
    }
  });
  if (blob) return blob;

  // iOS sometimes returns null from toBlob on large canvases — use data URL.
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const res = await fetch(dataUrl);
  const fallback = await res.blob();
  if (!fallback.size) throw new Error('Crop export failed');
  return fallback;
}

function jpegFileFromBlob(blob: Blob, fileName?: string): File {
  const base = (fileName || 'photo').replace(/\.[^.]+$/, '') || 'photo';
  const name = `${base}.jpg`;
  try {
    return new File([blob], name, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    // Very old WebKit without File ctor — FormData still accepts Blob+filename.
    const legacy = blob as Blob & { name?: string; lastModified?: number };
    Object.defineProperty(legacy, 'name', { value: name, configurable: true });
    Object.defineProperty(legacy, 'lastModified', {
      value: Date.now(),
      configurable: true,
    });
    return legacy as File;
  }
}

/**
 * Load pixels with EXIF orientation applied when the browser supports it,
 * so crop maths match what the user sees in an <img>.
 */
export async function loadOrientedSource(src: string): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      // blob:/data: must not use credentials — Safari/iOS fails those fetches.
      const isLocal =
        src.startsWith('blob:') || src.startsWith('data:');
      const res = await fetch(
        src,
        isLocal
          ? { cache: 'no-store' }
          : { credentials: 'include', cache: 'no-store' }
      );
      if (!res.ok) throw new Error('fetch failed');
      return await bitmapFromBlob(await res.blob());
    } catch {
      // fall through to <img>
    }
  }
  const img = await loadImageFromBlobUrl(src);
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    close: () => undefined,
  };
}

/** Prefer decoding the original File/Blob — no revoked blob: URL races. */
export async function loadOrientedBlob(blob: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await bitmapFromBlob(blob);
    } catch {
      // fall through
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImageFromBlobUrl(url);
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      close: () => {
        URL.revokeObjectURL(url);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * Draw the normalised crop region to a canvas and return a JPEG File.
 * Defaults to stored ATO settings (1280px / JPEG 0.2). Pass higher
 * maxEdge/quality for OCR preview crops (see RECEIPT_OCR_*).
 */
export async function exportCroppedJpeg(args: {
  source: CanvasImageSource & {
    width?: number;
    naturalWidth?: number;
    height?: number;
    naturalHeight?: number;
  };
  crop: CropRectNorm;
  fileName?: string;
  maxEdge?: number;
  quality?: number;
}): Promise<File> {
  const crop = clampCrop(args.crop);
  const naturalW =
    ('naturalWidth' in args.source && args.source.naturalWidth) ||
    args.source.width ||
    0;
  const naturalH =
    ('naturalHeight' in args.source && args.source.naturalHeight) ||
    args.source.height ||
    0;
  if (!naturalW || !naturalH) throw new Error('Invalid image size');

  const sx = Math.round(crop.x * naturalW);
  const sy = Math.round(crop.y * naturalH);
  const sw = Math.max(1, Math.round(crop.w * naturalW));
  const sh = Math.max(1, Math.round(crop.h * naturalH));

  const maxEdge = args.maxEdge ?? RECEIPT_MAX_EDGE;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(args.source, sx, sy, sw, sh, 0, 0, dw, dh);

  const quality = args.quality ?? RECEIPT_JPEG_QUALITY;
  const blob = await canvasToJpegBlob(canvas, quality);
  return jpegFileFromBlob(blob, args.fileName || 'receipt');
}

/** Crop from a URL/blob URL using orientation-aware decoding. */
export async function exportCroppedJpegFromSrc(args: {
  src: string;
  crop: CropRectNorm;
  fileName?: string;
  maxEdge?: number;
  quality?: number;
}): Promise<File> {
  const loaded = await loadOrientedSource(args.src);
  try {
    return await exportCroppedJpeg({
      source: loaded.source as CanvasImageSource & {
        width?: number;
        naturalWidth?: number;
        height?: number;
        naturalHeight?: number;
      },
      crop: args.crop,
      fileName: args.fileName,
      maxEdge: args.maxEdge,
      quality: args.quality,
    });
  } finally {
    loaded.close();
  }
}

/** Crop from the original camera/gallery File — most reliable on phones. */
export async function exportCroppedJpegFromBlob(args: {
  blob: Blob;
  crop: CropRectNorm;
  fileName?: string;
  maxEdge?: number;
  quality?: number;
}): Promise<File> {
  const loaded = await loadOrientedBlob(args.blob);
  try {
    return await exportCroppedJpeg({
      source: loaded.source as CanvasImageSource & {
        width?: number;
        naturalWidth?: number;
        height?: number;
        naturalHeight?: number;
      },
      crop: args.crop,
      fileName: args.fileName,
      maxEdge: args.maxEdge,
      quality: args.quality,
    });
  } finally {
    loaded.close();
  }
}
