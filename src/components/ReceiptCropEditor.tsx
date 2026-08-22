'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  clampCrop,
  FULL_CROP,
  type CropRectNorm,
} from '@/lib/client/cropImage';

type Edge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | 'move';

type Props = {
  /** Object URL or absolute/relative image URL. */
  src: string;
  /** Initial crop in normalised image coords. */
  initialCrop?: CropRectNorm;
  /** Dark theme for home PWA; light for Accounting desktop. */
  theme?: 'dark' | 'light';
  className?: string;
  style?: CSSProperties;
  onCropChange?: (crop: CropRectNorm) => void;
};

/**
 * Samsung-style border crop: drag edges/corners (or the box) to trim
 * wasted space around a receipt photo.
 */
export default function ReceiptCropEditor({
  src,
  initialCrop = FULL_CROP,
  theme = 'dark',
  className = '',
  style,
  onCropChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<CropRectNorm>(() =>
    clampCrop(initialCrop)
  );
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [display, setDisplay] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const dragRef = useRef<{
    edge: Edge;
    startX: number;
    startY: number;
    startCrop: CropRectNorm;
  } | null>(null);

  const dark = theme === 'dark';

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img || !img.naturalWidth) return;
    const wrapRect = wrap.getBoundingClientRect();
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const scale = Math.min(wrapRect.width / nw, wrapRect.height / nh, 1);
    const width = nw * scale;
    const height = nh * scale;
    const left = (wrapRect.width - width) / 2;
    const top = (wrapRect.height - height) / 2;
    setNatural({ w: nw, h: nh });
    setDisplay({ left, top, width, height });
  }, []);

  useEffect(() => {
    setCrop(clampCrop(initialCrop));
  }, [src, initialCrop]);

  useEffect(() => {
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure, src]);

  useEffect(() => {
    onCropChange?.(crop);
  }, [crop, onCropChange]);

  const updateCrop = (next: CropRectNorm) => {
    setCrop(clampCrop(next));
  };

  const onPointerDown = (edge: Edge) => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: crop,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !display.width || !display.height) return;
    const dx = (e.clientX - drag.startX) / display.width;
    const dy = (e.clientY - drag.startY) / display.height;
    const s = drag.startCrop;
    let next = { ...s };

    const resizeW = (delta: number, fromLeft: boolean) => {
      if (fromLeft) {
        const x = s.x + delta;
        const w = s.w - delta;
        next.x = x;
        next.w = w;
      } else {
        next.w = s.w + delta;
      }
    };
    const resizeH = (delta: number, fromTop: boolean) => {
      if (fromTop) {
        const y = s.y + delta;
        const h = s.h - delta;
        next.y = y;
        next.h = h;
      } else {
        next.h = s.h + delta;
      }
    };

    switch (drag.edge) {
      case 'move':
        next = { ...s, x: s.x + dx, y: s.y + dy };
        // Keep size; clamp position
        next.x = Math.min(1 - s.w, Math.max(0, next.x));
        next.y = Math.min(1 - s.h, Math.max(0, next.y));
        next.w = s.w;
        next.h = s.h;
        setCrop(next);
        return;
      case 'w':
        resizeW(dx, true);
        break;
      case 'e':
        resizeW(dx, false);
        break;
      case 'n':
        resizeH(dy, true);
        break;
      case 's':
        resizeH(dy, false);
        break;
      case 'nw':
        resizeW(dx, true);
        resizeH(dy, true);
        break;
      case 'ne':
        resizeW(dx, false);
        resizeH(dy, true);
        break;
      case 'sw':
        resizeW(dx, true);
        resizeH(dy, false);
        break;
      case 'se':
        resizeW(dx, false);
        resizeH(dy, false);
        break;
    }
    updateCrop(next);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const boxLeft = display.left + crop.x * display.width;
  const boxTop = display.top + crop.y * display.height;
  const boxW = crop.w * display.width;
  const boxH = crop.h * display.height;

  const handle = (edge: Edge, pos: CSSProperties) => (
    <div
      key={edge}
      onPointerDown={onPointerDown(edge)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute',
        touchAction: 'none',
        zIndex: 3,
        ...pos,
      }}
      aria-label={`Crop ${edge}`}
    />
  );

  const edgeColor = dark ? '#38bdf8' : '#0ea5e9';
  const dim = dark ? 'rgba(15,23,42,0.72)' : 'rgba(15,23,42,0.55)';

  return (
    <div className={className} style={style}>
      <p
        style={{
          margin: '0 0 8px',
          fontSize: '0.85rem',
          color: dark ? '#94a3b8' : '#64748b',
        }}
      >
        Drag the borders to trim wasted space around the receipt.
        {natural.w ? (
          <span>
            {' '}
            ({natural.w}×{natural.h}px)
          </span>
        ) : null}
      </p>
      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          width: '100%',
          height: 'min(62vh, 520px)',
          background: dark ? '#0f172a' : '#e2e8f0',
          borderRadius: 12,
          overflow: 'hidden',
          border: dark ? '1px solid #334155' : '1px solid #cbd5e1',
          userSelect: 'none',
          touchAction: 'none',
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt="Receipt to crop"
          onLoad={measure}
          draggable={false}
          style={{
            position: 'absolute',
            left: display.left,
            top: display.top,
            width: display.width,
            height: display.height,
            maxWidth: 'none',
            pointerEvents: 'none',
          }}
        />

        {/* Dim outside crop */}
        <div
          style={{
            position: 'absolute',
            left: display.left,
            top: display.top,
            width: display.width,
            height: Math.max(0, boxTop - display.top),
            background: dim,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: display.left,
            top: boxTop + boxH,
            width: display.width,
            height: Math.max(
              0,
              display.top + display.height - (boxTop + boxH)
            ),
            background: dim,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: display.left,
            top: boxTop,
            width: Math.max(0, boxLeft - display.left),
            height: boxH,
            background: dim,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: boxLeft + boxW,
            top: boxTop,
            width: Math.max(
              0,
              display.left + display.width - (boxLeft + boxW)
            ),
            height: boxH,
            background: dim,
            pointerEvents: 'none',
          }}
        />

        {/* Crop box */}
        <div
          onPointerDown={onPointerDown('move')}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: 'absolute',
            left: boxLeft,
            top: boxTop,
            width: boxW,
            height: boxH,
            border: `2px solid ${edgeColor}`,
            boxSizing: 'border-box',
            cursor: 'move',
            touchAction: 'none',
            zIndex: 2,
          }}
        >
          {/* Edge hit areas */}
          {handle('n', {
            left: 12,
            right: 12,
            top: -10,
            height: 20,
            cursor: 'ns-resize',
          })}
          {handle('s', {
            left: 12,
            right: 12,
            bottom: -10,
            height: 20,
            cursor: 'ns-resize',
          })}
          {handle('w', {
            top: 12,
            bottom: 12,
            left: -10,
            width: 20,
            cursor: 'ew-resize',
          })}
          {handle('e', {
            top: 12,
            bottom: 12,
            right: -10,
            width: 20,
            cursor: 'ew-resize',
          })}
          {/* Corners */}
          {handle('nw', {
            left: -12,
            top: -12,
            width: 24,
            height: 24,
            cursor: 'nwse-resize',
            background: edgeColor,
            borderRadius: 4,
          })}
          {handle('ne', {
            right: -12,
            top: -12,
            width: 24,
            height: 24,
            cursor: 'nesw-resize',
            background: edgeColor,
            borderRadius: 4,
          })}
          {handle('sw', {
            left: -12,
            bottom: -12,
            width: 24,
            height: 24,
            cursor: 'nesw-resize',
            background: edgeColor,
            borderRadius: 4,
          })}
          {handle('se', {
            right: -12,
            bottom: -12,
            width: 24,
            height: 24,
            cursor: 'nwse-resize',
            background: edgeColor,
            borderRadius: 4,
          })}
        </div>
      </div>
    </div>
  );
}

export { FULL_CROP };
export type { CropRectNorm };
