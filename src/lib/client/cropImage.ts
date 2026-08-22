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
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
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
      const res = await fetch(src, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const bitmap = await createImageBitmap(
        blob,
        { imageOrientation: 'from-image' } as ImageBitmapOptions
      );
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => {
          if (typeof bitmap.close === 'function') bitmap.close();
        },
      };
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

/**
 * Draw the normalised crop region to a canvas and return a JPEG File.
 * Defaults to stored ATO settings (1280px / JPEG 0.1). Pass higher
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
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Crop export failed'))),
      'image/jpeg',
      quality
    );
  });

  const base =
    (args.fileName || 'receipt').replace(/\.[^.]+$/, '') || 'receipt';
  return new File([blob], `${base}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
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
