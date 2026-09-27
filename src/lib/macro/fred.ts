import { env } from "@/lib/env";

const BASE = "https://api.stlouisfed.org/fred/series/observations";

export interface FredSeries {
  id: string;
  label: string;
  value: number | null;
  date: string | null;
  unit: string;
  hint: string; // what a healthy/normal read looks like, in plain words
}

// units=pc1 = percent change from a year ago (used for CPI → YoY inflation).
const SERIES: { id: string; label: string; unit: string; units: "lin" | "pc1"; hint: string }[] = [
  { id: "CPIAUCSL", label: "Inflation (CPI, YoY)", unit: "%", units: "pc1", hint: "Fed targets ~2%" },
  { id: "FEDFUNDS", label: "Fed funds rate", unit: "%", units: "lin", hint: "the Fed's policy rate" },
  { id: "MORTGAGE30US", label: "30-yr mortgage", unit: "%", units: "lin", hint: "housing affordability" },
  { id: "UNRATE", label: "Unemployment", unit: "%", units: "lin", hint: "lower = tighter labor market" },
];

function toNum(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

async function fetchSeries(s: (typeof SERIES)[number]): Promise<FredSeries> {
  const key = env().FRED_API_KEY;
  const base: FredSeries = { id: s.id, label: s.label, value: null, date: null, unit: s.unit, hint: s.hint };
  if (!key) return base;
  const url = `${BASE}?series_id=${s.id}&api_key=${key}&file_type=json&sort_order=desc&limit=1&units=${s.units}`;
  try {
    const r = await fetch(url, { next: { revalidate: 3600 } });
    if (!r.ok) return base;
    const j = (await r.json()) as { observations?: { value: string; date: string }[] };
    const o = j.observations?.[0];
    if (!o || o.value === ".") return base;
    return { ...base, value: toNum(o.value), date: o.date };
  } catch {
    return base;
  }
}

/** Official economic series from FRED. Empty when FRED_API_KEY isn't set (dashboard degrades). */
export async function fetchFred(): Promise<FredSeries[]> {
  if (!env().FRED_API_KEY) return [];
  return Promise.all(SERIES.map(fetchSeries));
}

export function fredConfigured(): boolean {
  return Boolean(env().FRED_API_KEY);
}
