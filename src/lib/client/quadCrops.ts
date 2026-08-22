import { clampCrop, type CropRectNorm } from "@/lib/client/cropImage";

export const QUAD_COUNT = 4;
export const QUAD_LABELS = ["1", "2", "3", "4"] as const;

/**
 * 2×2 layout with a small gutter so dockets don't share an edge.
 * Order: top-left, top-right, bottom-left, bottom-right.
 */
export function defaultQuadCrops(gutter = 0.04): CropRectNorm[] {
  const g = Math.min(0.12, Math.max(0.01, gutter));
  const cellW = (1 - g * 3) / 2;
  const cellH = (1 - g * 3) / 2;
  const cols = [g, g + cellW + g];
  const rows = [g, g + cellH + g];
  return [
    clampCrop({ x: cols[0], y: rows[0], w: cellW, h: cellH }),
    clampCrop({ x: cols[1], y: rows[0], w: cellW, h: cellH }),
    clampCrop({ x: cols[0], y: rows[1], w: cellW, h: cellH }),
    clampCrop({ x: cols[1], y: rows[1], w: cellW, h: cellH }),
  ];
}

function area(r: CropRectNorm): number {
  return r.w * r.h;
}

export function quadsOverlap(a: CropRectNorm, b: CropRectNorm): boolean {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const overlapW = Math.min(ax2, bx2) - Math.max(a.x, b.x);
  const overlapH = Math.min(ay2, by2) - Math.max(a.y, b.y);
  if (overlapW <= 0.002 || overlapH <= 0.002) return false;
  return overlapW * overlapH > Math.min(area(a), area(b)) * 0.08;
}
