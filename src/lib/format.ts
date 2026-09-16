const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹", KRW: "₩", CAD: "C$", AUD: "A$", CHF: "CHF ", HKD: "HK$", TWD: "NT$" };

export const UNVERIFIED = "unverified";

export function sym(currency: string): string {
  return CURRENCY_SYMBOL[currency] ?? `${currency} `;
}

/** 5.12T / 302.9B / 41.8M in the native currency. */
export function money(v: number | null | undefined, currency = "USD", digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return UNVERIFIED;
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  const s = sym(currency);
  if (abs >= 1e12) return `${sign}${s}${(abs / 1e12).toFixed(digits)}T`;
  if (abs >= 1e9) return `${sign}${s}${(abs / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${sign}${s}${(abs / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${sign}${s}${(abs / 1e3).toFixed(digits)}K`;
  return `${sign}${s}${abs.toFixed(2)}`;
}

export function price(v: number | null | undefined, currency = "USD"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return UNVERIFIED;
  return `${sym(currency)}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(v: number | null | undefined, digits = 1, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return UNVERIFIED;
  const s = signed && v > 0 ? "+" : "";
  return `${s}${v.toFixed(digits)}%`;
}

export function multiple(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return UNVERIFIED;
  return `${v.toFixed(digits)}x`;
}

export function compact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return UNVERIFIED;
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toLocaleString("en-US");
}

export function ago(iso: string | Date, now: Date = new Date()): string {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}

export function dateLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const MULTIPLE_LABEL: Record<string, string> = {
  trailingPE: "P/E (TTM)",
  forwardPE: "Fwd P/E",
  evToEbitda: "EV/EBITDA",
  priceToSales: "P/S",
  priceToFcf: "P/FCF",
  priceToBook: "P/B",
};
