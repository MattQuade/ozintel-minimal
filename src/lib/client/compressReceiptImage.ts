/** Client-side receipt image resize/compress before upload (PWA / phone camera). */

export const RECEIPT_MAX_BYTES = 18 * 1024 * 1024;

/**
 * ATO-style expense proof needs merchant/date/amount/ABN legible.
 * 1280px long edge + JPEG 0.2 — trial for smallest ATO-readable files.
 */
export const RECEIPT_MAX_EDGE = 1280;
export const RECEIPT_JPEG_QUALITY = 0.2;

const MAX_EDGE = RECEIPT_MAX_EDGE;
const JPEG_QUALITY = RECEIPT_JPEG_QUALITY;

export type CompressStatus = 'compressing' | 'ready';

function isPdf(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  return mime === 'application/pdf' || /\.pdf$/i.test(file.name || '');
}

function isLikelyImage(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name || '');
}

function loadViaImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Browser cannot decode this image'));
    };
    img.src = url;
  });
}

async function loadImageSource(
  file: File
): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // HEIC/HEIF or unsupported — try <img>
    }
  }
  return loadViaImageElement(file);
}

async function compressImageFile(
  file: File,
  maxEdge: number,
  quality: number
): Promise<File> {
  const source = await loadImageSource(file);
  try {
    const width =
      'naturalWidth' in source ? source.naturalWidth || source.width : source.width;
    const height =
      'naturalHeight' in source
        ? source.naturalHeight || source.height
        : source.height;
    if (!width || !height) throw new Error('Invalid image dimensions');

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Compress failed'))),
        'image/jpeg',
        quality
      );
    });

    const base = (file.name || 'receipt').replace(/\.[^.]+$/, '') || 'receipt';
    return new File([blob], `${base}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    if (
      typeof ImageBitmap !== 'undefined' &&
      source instanceof ImageBitmap &&
      typeof source.close === 'function'
    ) {
      source.close();
    }
  }
}

/**
 * Prepare a receipt file for upload: compress/resize images; leave PDFs as-is.
 * Falls back to the original file when the browser cannot decode (e.g. some HEIC).
 */
export async function prepareReceiptFile(
  file: File,
  onStatus?: (status: CompressStatus) => void
): Promise<File> {
  if (isPdf(file)) {
    if (file.size > RECEIPT_MAX_BYTES) {
      throw new Error('PDF too large (max 18MB). Please use a smaller file.');
    }
    return file;
  }

  if (!isLikelyImage(file)) {
    if (file.size > RECEIPT_MAX_BYTES) {
      throw new Error('File too large (max 18MB)');
    }
    return file;
  }

  onStatus?.('compressing');
  try {
    const compressed = await compressImageFile(file, MAX_EDGE, JPEG_QUALITY);
    onStatus?.('ready');
    // Prefer the smaller of compressed vs original
    const chosen = compressed.size < file.size ? compressed : file;
    if (chosen.size > RECEIPT_MAX_BYTES) {
      if (compressed.size <= RECEIPT_MAX_BYTES) return compressed;
      throw new Error('Image still too large after compression (max 18MB)');
    }
    // Always prefer compressed when original is large (phone photos) even if
    // sizes are close — compressed is already JPEG at target dimensions.
    if (file.size > 800 * 1024) return compressed;
    return chosen;
  } catch (err) {
    onStatus?.('ready');
    if (file.size > RECEIPT_MAX_BYTES) {
      throw new Error(
        err instanceof Error && /too large/i.test(err.message)
          ? err.message
          : 'Could not compress this image and it exceeds 18MB. Try JPEG/PNG or a smaller photo.'
      );
    }
    // HEIC decode failure etc. — upload original if under the cap
    return file;
  }
}
