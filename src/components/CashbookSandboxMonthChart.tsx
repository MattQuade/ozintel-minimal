'use client';

import type { CSSProperties } from 'react';
import {
  monthlyCashInOut,
  type SandboxCashOutAmount,
  type SandboxCloseAmounts,
} from '@/lib/cashbookSandbox/monthly';

const IN = '#4ade80';
const OUT = '#fb7185';

const wrap: CSSProperties = {
  margin: '0 0 16px',
  paddingBottom: 12,
  borderBottom: '1px solid #1e293b',
};

function aud(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function axisMoney(n: number): string {
  if (n >= 10000) return `$${Math.round(n / 1000)}k`;
  if (n >= 1000) {
    const k = n / 1000;
    const text = Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1);
    return `$${text}k`;
  }
  return `$${Math.round(n)}`;
}

function niceMax(n: number): number {
  if (n <= 0) return 0;
  const exp = 10 ** Math.floor(Math.log10(n));
  const fraction = n / exp;
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * exp;
}

type Props = {
  entries: SandboxCloseAmounts[];
  cashOuts: SandboxCashOutAmount[];
  year: number;
  years: number[];
  onYear: (year: number) => void;
};

/** Xero-style paired columns: cash in beside cash out, one pair per month. */
export default function CashbookSandboxMonthChart({
  entries,
  cashOuts,
  year,
  years,
  onYear,
}: Props) {
  const bars = monthlyCashInOut(entries, cashOuts, year);
  const peak = Math.max(...bars.map((bar) => Math.max(bar.cashIn, bar.cashOut)));
  const max = niceMax(peak);
  const yearIn = bars.reduce((sum, bar) => sum + bar.cashIn, 0);
  const yearOut = bars.reduce((sum, bar) => sum + bar.cashOut, 0);

  const padL = 34;
  const padR = 2;
  const padT = 4;
  const padB = 16;
  const width = 360;
  const height = 148;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const groupW = plotW / bars.length;
  const barW = 7;
  const baseline = padT + plotH;

  const described = bars
    .filter((bar) => bar.cashIn > 0 || bar.cashOut > 0)
    .map((bar) => `${bar.label} in ${aud(bar.cashIn)}, out ${aud(bar.cashOut)}`)
    .join('; ');

  return (
    <div style={wrap}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        <p style={{ color: '#f97316', fontWeight: 700, margin: 0, fontSize: '0.95rem' }}>
          Cash in and out
        </p>
        {years.length > 1 ? (
          <label style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
            Year{' '}
            <select
              value={year}
              onChange={(e) => onYear(Number(e.target.value))}
              style={{
                background: '#1e2937',
                color: 'white',
                border: '1px solid #475569',
                borderRadius: 6,
                padding: '2px 4px',
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{year}</span>
        )}
      </div>

      <p style={{ margin: '8px 0 10px', fontSize: '0.95rem' }}>
        <span style={{ color: IN, fontWeight: 700 }}>In {aud(yearIn)}</span>
        <span style={{ color: '#64748b' }}> · </span>
        <span style={{ color: OUT, fontWeight: 700 }}>Out {aud(yearOut)}</span>
      </p>

      {max <= 0 ? (
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '8px 0' }}>
          No sandbox totals in {year} yet.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="img"
          aria-label={
            described
              ? `Cash in and out for ${year}. ${described}`
              : `Cash in and out for ${year}`
          }
        >
          {[0, 0.5, 1].map((tick) => {
            const y = baseline - tick * plotH;
            const value = tick * max;
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  x2={width - padR}
                  y1={y}
                  y2={y}
                  stroke="#334155"
                  strokeWidth={1}
                />
                <text
                  x={padL - 4}
                  y={y + 3}
                  textAnchor="end"
                  fill="#94a3b8"
                  fontSize="9"
                >
                  {axisMoney(value)}
                </text>
              </g>
            );
          })}
          {bars.map((bar, i) => {
            const pairW = barW * 2 + 2;
            const x = padL + i * groupW + (groupW - pairW) / 2;
            const inH = (bar.cashIn / max) * plotH;
            const outH = (bar.cashOut / max) * plotH;
            return (
              <g key={bar.key}>
                {inH > 0.4 ? (
                  <rect
                    x={x}
                    y={baseline - inH}
                    width={barW}
                    height={inH}
                    fill={IN}
                    rx={1}
                  />
                ) : null}
                {outH > 0.4 ? (
                  <rect
                    x={x + barW + 2}
                    y={baseline - outH}
                    width={barW}
                    height={outH}
                    fill={OUT}
                    rx={1}
                  />
                ) : null}
                <text
                  x={x + pairW / 2}
                  y={baseline + 12}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="8"
                >
                  {bar.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '8px 0 0' }}>
        <span style={{ color: IN }}>■</span> In — EFTPOS plus cash banked.{' '}
        <span style={{ color: OUT }}>■</span> Out — receipt totals.
      </p>
    </div>
  );
}
