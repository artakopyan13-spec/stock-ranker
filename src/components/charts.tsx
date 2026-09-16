import { compact } from "@/lib/format";

interface BarPoint {
  label: string;
  value: number | null;
}

/** Animated grow-in bars, colored by sign. Pure inline SVG, responsive via viewBox. */
export function BarChart({ points, currency = "USD", title, height = 150 }: { points: BarPoint[]; currency?: string; title?: string; height?: number }) {
  const vals = points.map((p) => p.value ?? 0);
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const w = 320;
  const pad = { l: 6, r: 6, t: 18, b: 24 };
  const innerH = height - pad.t - pad.b;
  const zeroY = pad.t + (max / range) * innerH;
  const slot = (w - pad.l - pad.r) / Math.max(points.length, 1);
  const bw = Math.min(34, slot * 0.62);
  return (
    <figure className="w-full">
      {title && <figcaption className="text-xs text-muted mb-1">{title}</figcaption>}
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-auto" role="img" aria-label={title ?? "bar chart"}>
        <line x1={pad.l} x2={w - pad.r} y1={zeroY} y2={zeroY} stroke="var(--line)" />
        {points.map((p, i) => {
          const x = pad.l + i * slot + (slot - bw) / 2;
          if (p.value === null) {
            return (
              <g key={p.label}>
                <text x={x + bw / 2} y={zeroY - 4} textAnchor="middle" fontSize="8" fill="var(--dim)">
                  n/a
                </text>
                <text x={x + bw / 2} y={height - 8} textAnchor="middle" fontSize="8" fill="var(--muted)">
                  {p.label}
                </text>
              </g>
            );
          }
          const h = (Math.abs(p.value) / range) * innerH;
          const y = p.value >= 0 ? zeroY - h : zeroY;
          const fill = p.value >= 0 ? "var(--green)" : "var(--red)";
          return (
            <g key={p.label}>
              <rect className={`bar ${p.value < 0 ? "bar-neg" : ""}`} x={x} y={y} width={bw} height={Math.max(h, 1)} rx="3" fill={fill} style={{ animationDelay: `${i * 60}ms` }} />
              <text x={x + bw / 2} y={p.value >= 0 ? y - 4 : y + h + 9} textAnchor="middle" fontSize="8" fill="var(--muted)">
                {compact(p.value)}
              </text>
              <text x={x + bw / 2} y={height - 8} textAnchor="middle" fontSize="8" fill="var(--muted)">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="text-[0.65rem] text-dim">{currency}</div>
    </figure>
  );
}

interface LineSeries {
  name: string;
  color: string;
  values: Array<number | null>;
}

/** Draw-in multi-series line chart (used for margins — the honest gauge for cyclicals). */
export function LineChart({ labels, series, title, height = 150, unit = "%" }: { labels: string[]; series: LineSeries[]; title?: string; height?: number; unit?: string }) {
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (!all.length) return <div className="text-xs text-dim">No margin history available.</div>;
  const max = Math.max(...all, 0);
  const min = Math.min(...all, 0);
  const range = max - min || 1;
  const w = 320;
  const pad = { l: 30, r: 8, t: 12, b: 22 };
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (labels.length > 1 ? (i / (labels.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => pad.t + ((max - v) / range) * innerH;
  const ticks = [max, (max + min) / 2, min];
  return (
    <figure className="w-full">
      {title && <figcaption className="text-xs text-muted mb-1">{title}</figcaption>}
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-auto" role="img" aria-label={title ?? "line chart"}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="2 3" />
            <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" fontSize="8" fill="var(--muted)">
              {t.toFixed(0)}
              {unit}
            </text>
          </g>
        ))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter((p): p is string => p !== null);
          return <polyline key={s.name} className="line-draw" points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {labels.map((l, i) => (
          <text key={l} x={x(i)} y={height - 6} textAnchor="middle" fontSize="8" fill="var(--muted)">
            {l}
          </text>
        ))}
      </svg>
      <div className="flex gap-3 text-[0.68rem] text-muted">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-0.5" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** 52-week range with the current price marker. */
export function RangeMarker({ low, high, current, currency = "USD" }: { low: number | null; high: number | null; current: number | null; currency?: string }) {
  if (low === null || high === null || current === null || high <= low) return <div className="text-xs text-dim">52-week range unverified.</div>;
  const pos = Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
  return (
    <div>
      <svg viewBox="0 0 320 34" className="w-full h-auto" role="img" aria-label="52-week range">
        <line x1="10" x2="310" y1="18" y2="18" stroke="var(--line)" strokeWidth="6" strokeLinecap="round" />
        <line className="line-draw" x1="10" x2={10 + pos * 3} y1="18" y2="18" stroke="var(--purple)" strokeWidth="6" strokeLinecap="round" />
        <circle cx={10 + pos * 3} cy="18" r="6" fill="var(--gold)" stroke="var(--bg)" strokeWidth="2" />
        <text x="10" y="32" fontSize="8" fill="var(--muted)">
          {compact(low)}
        </text>
        <text x="310" y="32" fontSize="8" fill="var(--muted)" textAnchor="end">
          {compact(high)}
        </text>
      </svg>
      <div className="text-xs text-muted">
        {pos.toFixed(0)}% of the 52-week range ({currency})
      </div>
    </div>
  );
}

/** Bear / base / bull bands for the 12-month view. */
export function ForecastBands({ current, bear, base, bull, currency = "USD" }: { current: number | null; bear: number | null; base: number | null; bull: number | null; currency?: string }) {
  if (current === null || bear === null || base === null || bull === null) return null;
  const lo = Math.min(bear, current) * 0.95;
  const hi = Math.max(bull, current) * 1.05;
  const x = (v: number) => 10 + ((v - lo) / (hi - lo || 1)) * 300;
  return (
    <svg viewBox="0 0 320 56" className="w-full h-auto" role="img" aria-label="12-month forecast bands">
      <line x1={x(bear)} x2={x(current)} y1="22" y2="22" stroke="var(--red)" strokeWidth="8" strokeLinecap="round" className="line-draw" />
      <line x1={x(current)} x2={x(bull)} y1="22" y2="22" stroke="var(--green)" strokeWidth="8" strokeLinecap="round" className="line-draw" />
      <circle cx={x(base)} cy="22" r="6" fill="var(--purple)" />
      <circle cx={x(current)} cy="22" r="5" fill="var(--gold)" stroke="var(--bg)" strokeWidth="2" />
      <text x={x(bear)} y="44" fontSize="8" fill="var(--red)" textAnchor="middle">
        bear {compact(bear)}
      </text>
      <text x={x(base)} y="12" fontSize="8" fill="var(--purple)" textAnchor="middle">
        base {compact(base)}
      </text>
      <text x={x(bull)} y="44" fontSize="8" fill="var(--green)" textAnchor="middle">
        bull {compact(bull)}
      </text>
      <text x="310" y="54" fontSize="7" fill="var(--dim)" textAnchor="end">
        {currency} · gold = current
      </text>
    </svg>
  );
}
