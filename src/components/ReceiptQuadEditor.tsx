'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { clampCrop, type CropRectNorm } from '@/lib/client/cropImage';
import { QUAD_LABELS, defaultQuadCrops, quadsOverlap } from '@/lib/client/quadCrops';

type Edge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | 'move';

const BOX_COLORS = ['#38bdf8', '#a3e635', '#fbbf24', '#f472b6'];

type Props = {
  src: string;
  crops: CropRectNorm[];
  selected: number;
  onSelect: (index: number) => void;
  onCropsChange: (crops: CropRectNorm[]) => void;
};

/**
 * Four labelled crop boxes on one photo. Tap a box to select it, then
 * drag that box like the single-receipt crop editor.
 */
export default function ReceiptQuadEditor({
  src,
  crops,
  selected,
  onSelect,
  onCropsChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const cropsRef = useRef(crops);
  cropsRef.current = crops;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onCropsChangeRef = useRef(onCropsChange);
  onCropsChangeRef.current = onCropsChange;
  const [display, setDisplay] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const displayRef = useRef(display);
  displayRef.current = display;
  const dragRef = useRef<{
    edge: Edge;
    startX: number;
    startY: number;
    startCrop: CropRectNorm;
  } | null>(null);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img || !img.naturalWidth) return;
    const wrapRect = wrap.getBoundingClientRect();
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const scale = Math.min(wrapRect.width / nw, wrapRect.height / nh);
    const width = nw * scale;
    const height = nh * scale;
    const left = (wrapRect.width - width) / 2;
    const top = (wrapRect.height - height) / 2;
    setDisplay({ left, top, width, height });
  }, []);

  useEffect(() => {
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure, src]);

  const publish = (index: number, next: CropRectNorm) => {
    const copy = cropsRef.current.map((c, i) =>
      i === index ? clampCrop(next) : c
    );
    cropsRef.current = copy;
    onCropsChangeRef.current(copy);
  };

  const onPointerDown =
    (index: number, edge: Edge) => (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      if (index !== selectedRef.current) onSelect(index);
      dragRef.current = {
        edge,
        startX: e.clientX,
        startY: e.clientY,
        startCrop: cropsRef.current[index],
      };
    };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    const disp = displayRef.current;
    const index = selectedRef.current;
    if (!drag || !disp.width || !disp.height) return;
    const dx = (e.clientX - drag.startX) / disp.width;
    const dy = (e.clientY - drag.startY) / disp.height;
    const s = drag.startCrop;
    let next = { ...s };

    const resizeW = (delta: number, fromLeft: boolean) => {
      if (fromLeft) {
        next.x = s.x + delta;
        next.w = s.w - delta;
      } else {
        next.w = s.w + delta;
      }
    };
    const resizeH = (delta: number, fromTop: boolean) => {
      if (fromTop) {
        next.y = s.y + delta;
        next.h = s.h - delta;
      } else {
        next.h = s.h + delta;
      }
    };

    switch (drag.edge) {
      case 'move':
        next = {
          ...s,
          x: Math.min(1 - s.w, Math.max(0, s.x + dx)),
          y: Math.min(1 - s.h, Math.max(0, s.y + dy)),
          w: s.w,
          h: s.h,
        };
        publish(index, next);
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
    publish(index, next);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const handle = (index: number, edge: Edge, pos: CSSProperties) => (
    <div
      key={edge}
      onPointerDown={onPointerDown(index, edge)}
      style={{
        position: 'absolute',
        touchAction: 'none',
        zIndex: 4,
        ...pos,
      }}
      aria-label={`Receipt ${QUAD_LABELS[index]} ${edge}`}
    />
  );

  const overlapping = crops.some((a, i) =>
    crops.some((b, j) => i < j && quadsOverlap(a, b))
  );

  return (
    <div>
      <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#94a3b8' }}>
        Keep each box on one docket. If a total appears twice, shrink the overlapping box.
      </p>
      {overlapping ? (
        <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#fbbf24' }}>
          Two boxes overlap — a total can be read twice.
        </p>
      ) : null}
      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          width: '100%',
          height: 'min(62vh, 520px)',
          background: '#0f172a',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #334155',
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
          alt="Four receipts"
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
        {crops.map((crop, index) => {
          const color = BOX_COLORS[index];
          const active = index === selected;
          const boxLeft = display.left + crop.x * display.width;
          const boxTop = display.top + crop.y * display.height;
          const boxW = crop.w * display.width;
          const boxH = crop.h * display.height;
          return (
            <div
              key={QUAD_LABELS[index]}
              onPointerDown={onPointerDown(index, 'move')}
              style={{
                position: 'absolute',
                left: boxLeft,
                top: boxTop,
                width: boxW,
                height: boxH,
                border: `${active ? 3 : 2}px solid ${color}`,
                boxSizing: 'border-box',
                background: active ? 'rgba(56,189,248,0.08)' : 'transparent',
                zIndex: active ? 3 : 2,
                touchAction: 'none',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 4,
                  top: 4,
                  minWidth: 22,
                  height: 22,
                  borderRadius: 11,
                  background: color,
                  color: '#0f172a',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                {QUAD_LABELS[index]}
              </span>
              {active
                ? [
                    handle(index, 'n', {
                      left: 12,
                      right: 12,
                      top: -10,
                      height: 20,
                      cursor: 'ns-resize',
                    }),
                    handle(index, 's', {
                      left: 12,
                      right: 12,
                      bottom: -10,
                      height: 20,
                      cursor: 'ns-resize',
                    }),
                    handle(index, 'w', {
                      top: 12,
                      bottom: 12,
                      left: -10,
                      width: 20,
                      cursor: 'ew-resize',
                    }),
                    handle(index, 'e', {
                      top: 12,
                      bottom: 12,
                      right: -10,
                      width: 20,
                      cursor: 'ew-resize',
                    }),
                    handle(index, 'nw', {
                      left: -12,
                      top: -12,
                      width: 24,
                      height: 24,
                      cursor: 'nwse-resize',
                      background: color,
                      borderRadius: 4,
                    }),
                    handle(index, 'ne', {
                      right: -12,
                      top: -12,
                      width: 24,
                      height: 24,
                      cursor: 'nesw-resize',
                      background: color,
                      borderRadius: 4,
                    }),
                    handle(index, 'sw', {
                      left: -12,
                      bottom: -12,
                      width: 24,
                      height: 24,
                      cursor: 'nesw-resize',
                      background: color,
                      borderRadius: 4,
                    }),
                    handle(index, 'se', {
                      right: -12,
                      bottom: -12,
                      width: 24,
                      height: 24,
                      cursor: 'nwse-resize',
                      background: color,
                      borderRadius: 4,
                    }),
                  ]
                : null}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {QUAD_LABELS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(index)}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 8,
              border: `2px solid ${BOX_COLORS[index]}`,
              background: selected === index ? BOX_COLORS[index] : '#1e2937',
              color: selected === index ? '#0f172a' : '#e2e8f0',
              fontWeight: 800,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onCropsChange(defaultQuadCrops())}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: 'none',
            background: '#334155',
            color: '#e2e8f0',
            fontWeight: 700,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
