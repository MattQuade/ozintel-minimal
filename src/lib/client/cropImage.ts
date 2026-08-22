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

export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await loadImageFromBlobUrl(url);
  } finally {
    // Keep URL alive until caller is done? Image already loaded into memory.
    URL.revokeObjectURL(url);
  }
}

/**
 * Draw the normalised crop region to a canvas and return a JPEG File.
 * Uses shared ATO receipt settings (1280px long edge, JPEG 0.6) by default.
 */
export async function exportCroppedJpeg(args: {
  source: CanvasImageSource & { width?: number; naturalWidth?: number; height?: number; naturalHeight?: number };
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
