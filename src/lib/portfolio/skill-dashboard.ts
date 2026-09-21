/**
 * Faithful TypeScript port of the portfolio-review skill's scripts/build_dashboard.py.
 * Takes the skill's data JSON and returns the exact self-contained HTML dashboard
 * (CSS-only tabbed sub-pages, (?) tooltips, zone rulers, quarterly-trend bars, donut, etc.).
 * The CSS is copied verbatim from the skill's assets/template.html.
 */
import { GLOSSARY } from "@/lib/portfolio/skill-glossary";

// ---------- data shapes (the skill's JSON) ----------
export type Kv = [string, string];
export interface SkillTrend {
  label: string;
  unit?: string;
  periods: string[];
  values: Array<number | null>;
  yoy?: Array<string | null>;
  fmt?: string;
  pct_points?: boolean;
  note?: string | null;
  period?: string;
}
export interface SkillKGroup {
  name: string;
  items: Array<Array<string>>; // [label, value, flag?]
}
export interface SkillCard {
  t: string;
  name?: string;
  tag: string;
  tone: string;
  rate: number;
  one: string;
  k?: Kv[];
  kgroups?: SkillKGroup[];
  trends?: SkillTrend[];
  history?: SkillTrend[];
  range52?: [number, number] | null;
  fcf: [string, string, string];
  best?: string;
  partners?: string;
  bull?: string;
  bear?: string;
  trip?: string;
  cat?: string;
  why?: string;
  f: [number, number, number];
  watch?: boolean;
  open?: boolean;
  no_trends_reason?: string;
}
export interface SkillZone {
  t: string;
  price?: number | null;
  strong_buy_below?: number | null;
  buy_below?: number | null;
  trim_above?: number | null;
  sell_above?: number | null;
  stop_below?: number | null;
  basis?: string;
}
export interface SkillEvent {
  date: string;
  end?: string;
  time?: string;
  type?: string;
  impact?: string;
  tickers?: string[];
  title: string;
  watch?: string;
  est?: boolean;
}
export interface SkillData {
  meta: { title?: string; eyebrow?: string; headline: string; thesis?: string; build_date: string; price_date: string; new_cash: number; today?: string };
  positions: Array<{ t: string; name?: string; shares: number; avg: number; price: number; color?: string }>;
  themes?: Array<{ label: string; pct: number; sub?: string; tone?: string }>;
  honest_read?: string;
  alltime?: { account_value: number; net_deposits: number; realized?: number; deposits_note?: string; value_note?: string; realized_note?: string; source_note?: string; closed?: Array<{ t: string; pl: number; note?: string }>; insights?: string[]; footnote?: string };
  chips?: Array<{ label: string; pct: number; tone?: string }>;
  alloc_note?: string;
  calendar_title?: string;
  calendar?: Array<{ date: string; title: string; text?: string; done?: boolean }>;
  macro?: Array<{ h: string; p: string }>;
  plan?: { allocations: Array<{ name: string; amt: number; sub?: string; color?: string }>; why?: string; no_adds?: string[]; tranches?: Array<{ name: string; amt: number; window: string; buy: string; logic: string }>; tranche_note?: string };
  actions?: Array<{ action: string; tone?: string; position: string; size?: string; why: string; tax?: string }>;
  ideas?: Array<{ sector: string; gap?: string; picks?: Array<{ t: string; name?: string; why: string; numbers?: string; risk?: string }>; leaders?: Array<{ t: string; name?: string; perf_1y?: string; fwd_pe?: string; fcf?: string; note?: string }> }>;
  guardrails?: string[];
  cards: SkillCard[];
  events?: SkillEvent[];
  zones?: SkillZone[];
  review?: { grade?: string; grade_note?: string; summary: string; good?: string[]; bad?: string[]; suggestions?: string[]; per_stock?: Array<{ t: string; call?: string; tone?: string; line: string }> };
  next_steps?: string[];
  sources?: string[];
  unverified?: string;
  glossary_extra?: Record<string, string>;
}

interface Row {
  t: string;
  n: string;
  s: number;
  a: number;
  p: number;
  cost: number;
  val: number;
  pl: number;
  plp: number;
  c: string;
  w: number;
}

const PALETTE = ["#5AC8C8", "#3FA3A3", "#7C9A82", "#8E86D8", "#6F68B8", "#C9A35C", "#A8843F", "#4E7FB8", "#B07A6E", "#9CC7E6", "#D59A8C", "#B3ADEA", "#DCB86F", "#6FA08A"];
const TONE: Record<string, string> = { green: "g", gold: "y", yellow: "y", red: "r", purple: "p", cyan: "c", g: "g", y: "y", r: "r", p: "p", c: "c" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ETYPE: Record<string, string> = { earnings: "Earnings", dividend: "Dividend", fed: "Fed", macro: "Economic data", political: "Politics", company: "Company event", other: "Event" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
function fmtNum(x: number, d = 0): string {
  return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function money(x: number, d = 0): string {
  return (x < 0 ? "-$" : "$") + fmtNum(Math.abs(x), d);
}
function sgm(x: number): string {
  return `${x >= 0 ? "+" : "−"}$${fmtNum(Math.abs(x), 0)}`;
}
function sgp(x: number, d = 1): string {
  return `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}%`;
}
function price(v: number): string {
  return v < 100 && v !== Math.trunc(v) ? `$${fmtNum(v, 2)}` : `$${fmtNum(v, 0)}`;
}
function applyFmt(fmt: string | undefined, v: number): string {
  const m = fmt ? /\{:,?\.(\d+)f\}/.exec(fmt) : null;
  const d = m ? Number(m[1]) : 2;
  const commas = !fmt || fmt.includes(",");
  return commas ? fmtNum(v, d) : v.toFixed(d);
}

/** One dashboard build. All mutable state (section counter, used glossary terms) is local. */
export function buildSkillDashboard(d: SkillData): string {
  const GL: Record<string, string> = { ...GLOSSARY, ...(d.glossary_extra ?? {}) };
  const KEYS = Object.keys(GL).sort((a, b) => b.length - a.length);
  const usedTerms: string[] = [];
  let sec = 0;

  const mark = (k: string) => {
    if (!usedTerms.includes(k)) usedTerms.push(k);
  };
  const qmark = (term: string, cls = ""): string => {
    const key = Object.keys(GL).find((k) => k.toLowerCase() === term.toLowerCase());
    if (!key) return "";
    mark(key);
    const tip = esc(`${key} — ${GL[key]}`);
    return `<span class="q ${cls}" tabindex="0" role="note" aria-label="${tip}" data-tip="${tip}">?</span>`;
  };
  const findTerms = (label: string): string[] => {
    const low = label.toLowerCase();
    const taken: Array<[number, number]> = [];
    const found: Array<[number, string]> = [];
    for (const k of KEYS) {
      const re = new RegExp(`(?<![a-z0-9/])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9/])`);
      const m = re.exec(low);
      if (m && !taken.some(([a, b]) => a < m.index + m[0].length && m.index < b)) {
        taken.push([m.index, m.index + m[0].length]);
        found.push([m.index, k]);
      }
    }
    return found.sort((a, b) => a[0] - b[0]).map(([, k]) => k);
  };
  const T = (label: string, cls = ""): string => {
    const ks = findTerms(label);
    if (!ks.length) return label;
    ks.forEach(mark);
    const tip = esc(ks.map((k) => `${k} — ${GL[k]}`).join("  •  "));
    return `${label}<span class="q ${cls}" tabindex="0" role="note" aria-label="${tip}" data-tip="${tip}">?</span>`;
  };
  const sanitize = (t: string): string =>
    t
      .replace(/<\s*(script|style|iframe|object|embed|link|meta|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/<\s*(script|style|iframe|object|embed|link|meta|form)\b[^>]*\/?>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*/gi, "$1=$2#");
  const rich = (text: string | null | undefined): string => {
    if (text === null || text === undefined) return "";
    return sanitize(String(text)).replace(/\{\{\?([^}]+)\}\}/g, (_m, g1: string) => {
      const [term, shown] = g1.includes("|") ? [g1.slice(0, g1.indexOf("|")), g1.slice(g1.indexOf("|") + 1)] : [g1, ""];
      return (shown || term).trim() + qmark(term.trim(), "i");
    });
  };
  const h2 = (title: string, sub = "", term?: string): string => {
    sec += 1;
    const s = sub ? ` <span class="sub mut">— ${rich(sub)}</span>` : "";
    return `<h2><b>${String(sec).padStart(2, "0")}</b> · ${title}${term ? qmark(term) : ""}${s}</h2>`;
  };
  const sid = (t: string) => t.replace(/[^A-Za-z0-9]/g, "-");

  // ---------- sections ----------
  const secHero = (m: SkillData["meta"]): string => {
    const orbs = [
      [8, 78, 20, "#5AC8C8", "pl 5s ease-in-out infinite"], [11, 88, 55, "#8E86D8", "f1 7s ease-in-out infinite"],
      [6, 68, 70, "#C9A35C", "f2 6s ease-in-out infinite"], [14, 93, 18, "#7C9A82", "f2 9s ease-in-out infinite"],
      [5, 60, 30, "#5AC8C8", "pl 4s ease-in-out infinite"], [9, 82, 82, "#8E86D8", "f1 8s ease-in-out infinite"],
    ].map(([w, l, t, c, a]) => `<span class="orb" style="width:${w}px;height:${w}px;left:${l}%;top:${t}%;background:${c};animation:${a}"></span>`).join("");
    return `<section class="hero"><div class="qfield">${orbs}</div>
 <div class="eyebrow">${rich(m.eyebrow ?? "Research notebook")}</div>
 <h1>${rich(m.headline)}</h1><p>${rich(m.thesis ?? "")}</p>
 <span class="stamp">Every figure is sourced and dated in the Glossary tab</span></section>`;
  };

  const secScore = (rows: Row[], TV: number, TC: number, themes: NonNullable<SkillData["themes"]>): string => {
    const pl = TV - TC;
    const col = pl >= 0 ? "var(--green)" : "var(--red)";
    const cells: Array<[string, string, string, string]> = [
      ["Market value", money(TV), `${rows.length} positions`, ""],
      ["Cost basis", money(TC), "shares × your averages", ""],
      ["Unrealized P/L", sgm(pl), sgp(TC ? (pl / TC) * 100 : 0), col],
    ];
    for (const th of themes.slice(0, 2)) cells.push([th.label, `${th.pct.toFixed(1)}%`, th.sub ?? "", `var(--${th.tone ?? "cyan"})`]);
    let out = "";
    cells.forEach(([l, v, s, c], i) => {
      const st = c ? ` style="color:${c}"` : "";
      out += `<div class="panel sc" style="animation-delay:${(0.05 + i * 0.07).toFixed(2)}s"><span class="l">${T(l, i === 0 ? "s" : "")}</span><b${st}>${v}</b><i>${s}</i></div>`;
    });
    return `<div class="score">${out}</div>`;
  };

  const secAlltime = (a: NonNullable<SkillData["alltime"]>): string => {
    const av = a.account_value;
    const nd = a.net_deposits;
    const pl = av - nd;
    const col = pl >= 0 ? "var(--green)" : "var(--red)";
    const cells: Array<[string, string, string, string]> = [
      ["Net deposits", money(nd), a.deposits_note ?? "", ""],
      ["Account value", money(av), a.value_note ?? "", ""],
      ["All-time P/L", sgm(pl), sgp(nd ? (pl / nd) * 100 : 0) + " on money put in", col],
      ["Realized", sgm(a.realized ?? 0), a.realized_note ?? "", (a.realized ?? 0) < 0 ? "var(--red)" : "var(--green)"],
    ];
    let sc = "";
    cells.forEach(([l, v, s, c], i) => {
      const st = c ? ` style="color:${c}"` : "";
      sc += `<div class="panel sc"><span class="l">${T(l, i === 0 ? "s" : i === 3 ? "e" : "")}</span><b${st}>${v}</b><i>${s}</i></div>`;
    });
    const closed = a.closed ?? [];
    let bars = "";
    if (closed.length) {
      const mx = Math.max(...closed.map((c) => Math.abs(c.pl))) || 1;
      [...closed].sort((x, y) => x.pl - y.pl).forEach((c, j) => {
        const colr = c.pl >= 0 ? "var(--green)" : "var(--red)";
        const note = c.note ? ` <i>${c.note}</i>` : "";
        bars += `<div class="hb"><span><b>${c.t}</b></span><span class="ht"><span class="hf" style="width:${Math.max(2, (Math.abs(c.pl) / mx) * 100).toFixed(0)}%;background:${colr};animation-delay:${(j * 0.07).toFixed(2)}s"></span></span><span class="hv" style="color:${colr}">${sgm(c.pl)}${note}</span></div>`;
      });
    }
    const ins = (a.insights ?? []).map((x) => `<li>${rich(x)}</li>`).join("");
    let grid = "";
    if (bars || ins) {
      grid = `<div class="grid2" style="margin-top:10px"><div class="panel pad"><div class="cap">Closed positions — realized${qmark("Realized")}</div>${bars}</div><div class="panel pad"><div class="cap">What the history says</div><ol class="rules">${ins}</ol><p class="mut" style="font-size:12px;margin:10px 0 0">${rich(a.footnote ?? "Tax notes are observations from the trade log, not tax advice.")}</p></div></div>`;
    }
    return h2("All-time scorecard", a.source_note ?? "") + `<div class="score c4">${sc}</div>` + grid;
  };

  const secAlloc = (rows: Row[], TV: number, chips: NonNullable<SkillData["chips"]>, note: string): string => {
    const C = 2 * Math.PI * 50;
    let segs = "";
    let acc = 0;
    rows.forEach((r, i) => {
      const L = (r.w / 100) * C;
      segs += `<circle class="seg" cx="60" cy="60" r="50" fill="none" stroke="${r.c}" stroke-width="15" stroke-dasharray="${Math.max(L - 1.2, 0.5).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 60 60)" style="animation-delay:${(0.15 + i * 0.08).toFixed(2)}s"/>`;
      acc += L;
    });
    const legend = rows.map((r) => `<div class="lg"><span class="sw" style="background:${r.c}"></span><b>${r.t}</b><span class="mut">${r.w.toFixed(1)}%</span><span class="mut r">${money(r.val)}</span></div>`).join("");
    const mx = Math.max(...rows.map((r) => Math.abs(r.pl))) || 1;
    let pl = "";
    [...rows].sort((a, b) => b.pl - a.pl).forEach((r, j) => {
      const col = r.pl >= 0 ? "var(--green)" : "var(--red)";
      pl += `<div class="hb"><span><b>${r.t}</b></span><span class="ht"><span class="hf" style="width:${Math.max(2, (Math.abs(r.pl) / mx) * 100).toFixed(1)}%;background:${col};animation-delay:${(0.1 + j * 0.07).toFixed(2)}s"></span></span><span class="hv" style="color:${col}">${sgm(r.pl)} <i>${sgp(r.plp)}</i></span></div>`;
    });
    const ch = chips.map((c) => `<span class="chip ${c.tone ?? ""}"><b>${c.pct.toFixed(1)}%</b> ${rich(c.label)}</span>`).join("");
    return h2("Where the money is", "", "Weight") + `<div class="grid2"><div class="panel pad"><div class="donutw">
 <svg viewBox="0 0 120 120" width="190" height="190" style="flex:none"><circle cx="60" cy="60" r="50" fill="none" stroke="#1B2230" stroke-width="15"/>${segs}
 <text x="60" y="57" class="dv">${money(TV)}</text><text x="60" y="69" class="dc">TOTAL VALUE</text></svg><div class="lgw">${legend}</div></div><div class="chips">${ch}</div></div>
 <div class="panel pad"><div class="cap">${T("Unrealized P/L")} by position</div>${pl}<p class="mut" style="font-size:12.5px;margin:12px 0 0">${rich(note)}</p></div></div>`;
  };

  const secCalendar = (cal: NonNullable<SkillData["calendar"]>, macro: NonNullable<SkillData["macro"]>, title: string): string => {
    const steps = cal.map((s, i) => `<div class="panel step${s.done ? " done" : ""}" style="animation-delay:${(i * 0.08).toFixed(2)}s"><div class="dot" style="animation-delay:${(i * 0.6).toFixed(1)}s"></div><time>${s.date}</time><b>${rich(s.title)}</b><p>${rich(s.text ?? "")}</p></div>`).join("");
    const mc = macro.map((m) => `<div class="panel pad"><h4>${rich(m.h)}</h4><p>${rich(m.p)}</p></div>`).join("");
    return h2(title, "", "Catalyst") + `<div class="tl">${steps}</div>` + (mc ? `<div class="macro">${mc}</div>` : "");
  };

  const secPlan = (p: NonNullable<SkillData["plan"]>, newCash: number): string => {
    const al = p.allocations;
    const tot = al.reduce((s, a) => s + a.amt, 0) || 1;
    const mx = Math.max(...al.map((a) => a.amt)) || 1;
    const bars = al.map((a, i) => `<div class="ab"><span><b>${a.name}</b><small>${((a.amt / tot) * 100).toFixed(0)}% · ${rich(a.sub ?? "")}</small></span><span class="ht"><span class="hf" style="width:${((a.amt / mx) * 100).toFixed(1)}%;background:${a.color ?? PALETTE[i % PALETTE.length]};animation-delay:${(0.1 + i * 0.1).toFixed(1)}s"></span></span><b style="text-align:right">${money(a.amt)}</b></div>`).join("");
    const no = (p.no_adds ?? []).map((x) => `<span>${rich(x)}</span>`).join("");
    const rows = (p.tranches ?? []).map((t) => `<tr><td><b>${t.name} · ${money(t.amt)}</b></td><td>${t.window}</td><td>${rich(t.buy)}</td><td>${rich(t.logic)}</td></tr>`).join("");
    return h2(`Model plan for the ${money(newCash)}`, "a framework to react to, not a recommendation", "Tranche") + `<div class="plan"><div class="panel pad">${bars}
 <p class="mut" style="font-size:13px;margin:10px 0 0"><b style="color:var(--ink)">Why these:</b> ${rich(p.why ?? "")}</p><div class="no">${no}</div></div>
 <div class="panel pad"><div class="scroll"><table class="tbl"><tr><th>Tranche</th><th>Window</th><th>Buy</th><th>Logic</th></tr>${rows}</table></div>
 <p class="mut" style="font-size:12px;margin:10px 0 0">Tranches sum to ${money(newCash)}. ${rich(p.tranche_note ?? "")}</p></div></div>`;
  };

  const secActions = (acts: NonNullable<SkillData["actions"]>): string => {
    let out = "";
    for (const a of acts) {
      const tone = TONE[a.tone ?? "y"] ?? "y";
      const tax = a.tax ? `<p class="tax">Tax effect: ${rich(a.tax)}</p>` : "";
      out += `<div class="act"><div class="what"><span class="pill ${tone}">${a.action.toUpperCase()}</span><b>${a.position}</b><small>${rich(a.size ?? "")}</small></div><div><p>${rich(a.why)}</p>${tax}</div></div>`;
    }
    return h2("Sell · trim · hold", "what the data says about what you already own") + `<div class="panel">${out}</div>`;
  };

  const secIdeas = (ideas: NonNullable<SkillData["ideas"]>): string => {
    let out = "";
    for (const idea of ideas) {
      let picks = "";
      (idea.picks ?? []).forEach((pk, n0) => {
        const n = n0 + 1;
        picks += `<div class="pick"><span class="rk">#${n}</span><span class="tkr">${pk.t}</span> <span class="mut">${pk.name ?? ""}</span><p>${rich(pk.why)}</p><p class="n">${rich(pk.numbers ?? "")}</p><p class="risk">Risk: ${rich(pk.risk ?? "")}</p></div>`;
      });
      const leaders = idea.leaders ?? [];
      let tbl = "";
      if (leaders.length) {
        const rws = leaders.map((l) => `<tr><td><b>${l.t}</b> <span class="mut">${l.name ?? ""}</span></td><td>${l.perf_1y ?? "n/a"}</td><td>${l.fwd_pe ?? "n/a"}</td><td>${l.fcf ?? "n/a"}</td><td class="mut">${rich(l.note ?? "")}</td></tr>`).join("");
        tbl = `<div class="cap" style="margin-top:14px">${T("Peer leaders")} in ${idea.sector} — ranked by ${T("1-yr perf")}</div><div class="scroll"><table class="tbl"><tr><th>Company</th><th>1-yr perf</th><th>Fwd P/E</th><th>FCF (TTM)</th><th>Note</th></tr>${rws}</table></div><p class="mut" style="font-size:12px;margin:8px 0 0">Best-performing is not the same as best buy: a big past run usually means a higher price for the same business. The ranked picks above weigh cash flow and valuation, not just the chart.</p>`;
      }
      out += `<div class="panel pad idea"><h3>${idea.sector}</h3><p class="gap">${rich(idea.gap ?? "")}</p><div class="picks">${picks}</div>${tbl}</div>`;
    }
    return h2("Ideas to add", "stocks that fill the gaps in this portfolio, with their industry's leaders for comparison", "Concentration") + out;
  };

  const secEvents = (events: SkillEvent[], today: string | undefined, title?: string, sub?: string, legend = true): string => {
    const evs = [...events].sort((a, b) => a.date.localeCompare(b.date));
    let out = "";
    let cur: string | null = null;
    for (const e of evs) {
      const [y, mo, da] = e.date.split("-").map(Number);
      const key = `${y}-${mo}`;
      if (key !== cur) {
        cur = key;
        out += `<div class="evm">${MONTHS[mo - 1]} ${y}</div>`;
      }
      let end = "";
      if (e.end) {
        const [, m2, d2] = e.end.split("-").map(Number);
        end = m2 === mo ? `–${d2}` : ` – ${MONTHS[m2 - 1].slice(0, 3)} ${d2}`;
      }
      let imp = e.impact ?? "low";
      imp = imp === "medium" ? "med" : imp === "hi" ? "high" : imp;
      const past = today && (e.end ?? e.date) < today ? " past" : "";
      const tk = (e.tickers ?? []).map((t) => `<span class="tkc">${t}</span>`).join("");
      const est = e.est ? " <em>(est.)</em>" : "";
      const dow = new Date(Date.UTC(y, mo - 1, da)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
      const time = e.time ? `<small>${e.time}</small>` : `<small>${dow}</small>`;
      out += `<div class="ev${past}"><div class="d">${MONTHS[mo - 1].slice(0, 3)} ${da}${end}${time}</div><span class="fold ${imp}" title="${imp} impact"></span><div><div class="tt">${tk}${rich(e.title)}${est}<span class="ety">${ETYPE[e.type ?? "other"] ?? "Event"}</span></div><p>${rich(e.watch ?? "")}</p></div></div>`;
    }
    const nHi = evs.filter((e) => e.impact === "high" || e.impact === "hi").length;
    const leg = `<div class="evleg"><span><span class="fold high"></span>${T("Red folder")} = high impact (${nHi})</span><span><span class="fold med"></span>medium</span><span><span class="fold low"></span>low</span><span>“est.” = date estimated by a data vendor, not confirmed by the company</span></div>`;
    if (title) return h2(title, sub ?? "") + `<div class="panel">${out}${legend ? leg : ""}</div>`;
    return h2("Event calendar", "every holding's earnings, dividends and company events, plus the market-moving economic releases", "Impact") + `<div class="panel">${out}${leg}</div>`;
  };

  const zoneStatus = (z: SkillZone | undefined, px: number | null | undefined): [string, string, string] => {
    const blue = "background:#1c2a3a;color:#9cc7e6", green = "background:#1a2a20;color:#9fc3a6", gold = "background:#2a2416;color:#dcb86f", red = "background:#2b1b18;color:#d59a8c";
    if (!z || px === null || px === undefined) return ["—", blue, "none"];
    const g = (k: keyof SkillZone) => z[k] as number | null | undefined;
    if (g("stop_below") != null && px < (g("stop_below") as number)) return ["BELOW STOP", red, "stop"];
    if (g("strong_buy_below") != null && px <= (g("strong_buy_below") as number)) return ["IN STRONG-BUY ZONE", green, "buy"];
    if (g("buy_below") != null && px <= (g("buy_below") as number)) return ["IN BUY ZONE", green, "buy"];
    if (g("sell_above") != null && px >= (g("sell_above") as number)) return ["ABOVE SELL LEVEL", red, "sell"];
    if (g("trim_above") != null && px >= (g("trim_above") as number)) return ["IN TRIM ZONE", gold, "trim"];
    if (g("buy_below") == null) return ["NO BUY ZONE — HOLD ONLY", blue, "hold"];
    return ["IN FAIR RANGE — HOLD", blue, "hold"];
  };

  const zoneHtml = (z: SkillZone, W: Record<string, Row>, bare = false): string => {
    const r = W[z.t];
    const px = z.price != null ? z.price : r ? r.p : null;
    const avg = r ? r.a : null;
    const lv: Array<[string, number | null | undefined]> = [["stop", z.stop_below], ["sbuy", z.strong_buy_below], ["buy", z.buy_below], ["trim", z.trim_above], ["sell", z.sell_above]];
    const nums = lv.map(([, v]) => v).filter((v): v is number => v != null).concat([px, avg].filter((x): x is number => !!x));
    const lo = Math.min(...nums) * 0.88, hi = Math.max(...nums) * 1.12;
    const span = hi - lo || 1;
    const pos = (v: number) => ((v - lo) / span) * 100;
    const cuts: number[] = [lo];
    const names: string[] = [];
    const order: Array<[number | null | undefined, string]> = [[z.stop_below, "stop"], [z.strong_buy_below, "sbuy"], [z.buy_below, "buy"], [z.trim_above, "fair"], [z.sell_above, "trim"]];
    for (const [v, cls] of order) if (v != null) { cuts.push(v); names.push(cls); }
    cuts.push(hi);
    names.push(z.sell_above != null ? "sell" : z.trim_above != null ? "trim" : "fair");
    const segs = names.map((nm, i) => `<span class="z ${nm}" style="width:${(((cuts[i + 1] - cuts[i]) / span) * 100).toFixed(2)}%;animation-delay:${(i * 0.08).toFixed(2)}s"></span>`).join("");
    const edge = (v: number) => (pos(v) < 14 ? " le" : pos(v) > 86 ? " re" : "");
    let mk = px ? `<span class="mk${edge(px)}" style="left:${pos(px).toFixed(2)}%"><span>now ${price(px)}</span></span>` : "";
    if (avg) mk += `<span class="mk avg${edge(avg)}" style="left:${pos(avg).toFixed(2)}%"><span>your avg ${price(avg)}</span></span>`;
    const [vd, vc] = zoneStatus(z, px);
    let chips = "";
    for (const [lab, key, tone] of [["Strong buy ≤", "strong_buy_below", "zg"], ["Buy ≤", "buy_below", "zg"], ["Trim ≥", "trim_above", "zy"], ["Sell ≥", "sell_above", "zr"], ["Stop: close <", "stop_below", "zr"]] as Array<[string, keyof SkillZone, string]>) {
      const v = z[key] as number | null | undefined;
      if (v != null) chips += `<span class="${tone}">${lab} <b>${price(v)}</b></span>`;
    }
    let dist = "";
    if (px && z.buy_below != null && px > z.buy_below) dist = ` · ${((px / z.buy_below - 1) * 100).toFixed(0)}% above the buy level`;
    const style = bare ? ' style="padding:0;border:0"' : "";
    return `<div class="zn"${style}><div class="znh"><b class="t">${z.t}</b><span class="now">now <b>${price(px ?? 0)}</b>${dist}</span><span class="vd" style="${vc}">${vd}</span></div><div class="ruler">${segs}${mk}</div><div class="lv">${chips}</div><p><b>How these were set:</b> ${rich(z.basis ?? "")}</p></div>`;
  };

  const secZones = (zones: SkillZone[], W: Record<string, Row>): string => {
    const out = zones.map((z) => zoneHtml(z, W)).join("");
    return h2("Buy & sell price zones", "approximate levels from stated valuation math — estimates, not predictions", "Buy zone") + `<div class="panel">${out}</div><p class="mut" style="font-size:12px;margin:8px 4px 0">Green = ${T("Buy zone")} · slate = ${T("Fair value")} · gold = ${T("Trim zone")} · dark red = below the ${T("Stop")}. Levels move when earnings estimates move; they are rebuilt from live data each time this dashboard is generated.</p>`;
  };

  const trendBlock = (tr: SkillTrend): string => {
    const vals = tr.values, per = tr.periods;
    const yoy = tr.yoy ?? new Array(vals.length).fill(null);
    const mx = Math.max(...vals.filter((v): v is number => v != null).map((v) => Math.abs(v))) || 1;
    const neg = vals.some((v) => v != null && v < 0);
    const annual = tr.period === "annual";
    let tagq = annual ? "vs prior yr" : "QoQ";
    if (vals.length > 7) tagq = "";
    const H = 84;
    const upH = H * (neg ? 0.6 : 1.0), dnH = neg ? H * 0.4 : 0;
    let cols = "";
    vals.forEach((v, i) => {
      const last = i === vals.length - 1 ? " last" : "";
      if (v == null) {
        cols += `<div class="bc"><div class="v mut">n/a</div><div class="up" style="height:${upH.toFixed(0)}px"></div><div class="ax"></div>` + (neg ? `<div class="dn" style="height:${dnH.toFixed(0)}px"></div>` : "") + `<div class="p">${per[i]}</div></div>`;
        return;
      }
      const hpx = (Math.abs(v) / mx) * (v >= 0 ? upH : dnH);
      const upbar = v >= 0 ? `<i style="height:${hpx.toFixed(1)}px;animation-delay:${(i * 0.07).toFixed(2)}s"></i>` : "";
      const dnbar = v < 0 ? `<i style="height:${hpx.toFixed(1)}px;animation-delay:${(i * 0.07).toFixed(2)}s"></i>` : "";
      const prev = i ? vals[i - 1] : null;
      let chg = "";
      if (prev != null && prev !== 0) {
        if (tr.pct_points) {
          const c = v - prev;
          chg = `<div class="c ${c >= 0 ? "u" : "d"}">${c >= 0 ? "+" : "−"}${Math.abs(c).toFixed(1)} pts</div>`;
        } else if (prev > 0 && v >= 0) {
          const c = ((v - prev) / prev) * 100;
          chg = `<div class="c ${c >= 0 ? "u" : "d"}">${c >= 0 ? "+" : "−"}${Math.abs(c).toFixed(0)}% ${tagq}</div>`;
        } else if (prev > 0 && v < 0) chg = '<div class="c d">turned negative</div>';
        else if (prev < 0 && v >= 0) chg = '<div class="c u">turned positive</div>';
        else chg = `<div class="c ${v > prev ? "u" : "d"}">${v > prev ? "smaller loss" : "bigger loss"}</div>`;
      } else chg = '<div class="c">&nbsp;</div>';
      const y = yoy[i] ? `<div class="c2">${yoy[i]} YoY</div>` : "";
      cols += `<div class="bc${last}"><div class="v">${applyFmt(tr.fmt, v)}</div><div class="up" style="height:${upH.toFixed(0)}px">${upbar}</div><div class="ax"></div>` + (neg ? `<div class="dn" style="height:${dnH.toFixed(0)}px">${dnbar}</div>` : "") + `<div class="p">${per[i]}</div>${chg}${y}</div>`;
    });
    const note = tr.note ? `<p class="nt">${rich(tr.note)}</p>` : "";
    return `<div class="tr"><h5>${T(tr.label, "s")}</h5><span class="un">${tr.unit ?? ""} · ${annual ? "by year" : "by quarter"}${annual ? "" : qmark("QoQ")}</span><div class="bars">${cols}</div>${note}</div>`;
  };

  const secGuardrails = (g: string[]): string => h2("Mechanical guardrails", "", "Guardrail") + `<div class="panel pad"><ol class="rules">${g.map((x) => `<li>${rich(x)}</li>`).join("")}</ol></div>`;

  const rangeBar = (lo: number, hi: number, px: number, avg: number | null): string => {
    const span = hi - lo || 1;
    const pos = (v: number) => Math.min(100, Math.max(0, ((v - lo) / span) * 100));
    const edge = (v: number) => (pos(v) < 14 ? " le" : pos(v) > 86 ? " re" : "");
    let mk = `<span class="mk${edge(px)}" style="left:${pos(px).toFixed(1)}%"><span>now ${price(px)}</span></span>`;
    if (avg) mk += `<span class="mk avg${edge(avg)}" style="left:${pos(avg).toFixed(1)}%"><span>your avg ${price(avg)}</span></span>`;
    const off = (1 - px / hi) * 100;
    return `<div class="zn" style="border:0;padding:4px 0 0"><div class="znh" style="margin-bottom:26px"><span class="now">${price(lo)} low</span><span class="now mut">— ${pos(px).toFixed(0)}% of the way up the range · ${off.toFixed(0)}% below the high —</span><span class="now">${price(hi)} high</span></div><div class="ruler"><span class="z fair" style="width:100%"></span>${mk}</div></div>`;
  };

  const secStockTable = (rows: Row[], cards: SkillCard[], zones: SkillZone[]): string => {
    const Z: Record<string, SkillZone> = Object.fromEntries(zones.map((z) => [z.t, z]));
    const CT: Record<string, SkillCard> = Object.fromEntries(cards.map((c) => [c.t, c]));
    let trs = "";
    for (const r of rows) {
      const c = CT[r.t] ?? ({} as Partial<SkillCard>);
      const [vd, vc] = zoneStatus(Z[r.t], r.p);
      const col = r.pl >= 0 ? "var(--green)" : "var(--red)";
      trs += `<tr><td><label class="go" for="tab-s-${sid(r.t)}"><b style="color:${r.c}">${r.t}</b> →</label></td><td>${price(r.p)}</td><td>${r.w.toFixed(1)}%</td><td style="color:${col}">${sgm(r.pl)} <span class="mut">${sgp(r.plp)}</span></td><td><b style="color:var(--gold)">${c.rate ?? ""}</b>/10</td><td><span class="tag ${TONE[c.tone ?? "y"] ?? "y"}">${c.tag ?? ""}</span></td><td><span class="vd" style="${vc}">${vd}</span></td></tr>`;
    }
    return h2("All positions on one line each", "tap a ticker to open its full page") + `<div class="panel pad"><div class="scroll"><table class="tbl sum"><tr><th>Stock</th><th>Price</th><th>Weight</th><th>Profit / loss</th><th>Rating</th><th>Call</th><th>Price zone</th></tr>${trs}</table></div></div>`;
  };

  const secStockTiles = (cards: SkillCard[], W: Record<string, Row>): string => {
    let out = "";
    for (const c of cards) {
      const r = W[c.t];
      const color = r ? r.c : "#8E86D8";
      const fc = c.fcf;
      const sub = r ? `${money(r.val)} · ${r.w.toFixed(1)}% · <span style="color:${r.pl >= 0 ? "var(--green)" : "var(--red)"}">${sgm(r.pl)}</span>` : "watchlist";
      out += `<label class="panel stile" for="tab-s-${sid(c.t)}"><span class="tk" style="border-color:${color};color:${color}">${c.t}</span><span class="rt"><b>${Math.trunc(c.rate)}</b>/10</span><b class="n">${r ? r.n : c.name ?? c.t}</b><span class="s">${sub}</span><span class="tag ${TONE[c.tone ?? "y"] ?? "y"}">${c.tag}</span><span class="f">${fc[0]} ${rich(fc[1])}</span><i>Open full page →</i></label>`;
    }
    return h2("Open a stock", "each one has its own page: all numbers, dashboards, history, price zones, dates") + `<div class="stiles">${out}</div>`;
  };

  const stripMarkers = (t: string) => t.replace(/\{\{\?([^}|]+)(\|[^}]+)?\}\}/g, (_m, g1: string, g2: string | undefined) => (g2 ? g2.slice(1) : g1));

  const secGlance = (rows: Row[], today: string | undefined): string => {
    const Z: Record<string, SkillZone> = Object.fromEntries((d.zones ?? []).map((z) => [z.t, z]));
    const buy = rows.filter((r) => zoneStatus(Z[r.t], r.p)[2] === "buy").map((r) => r.t);
    const trim = rows.filter((r) => ["trim", "sell"].includes(zoneStatus(Z[r.t], r.p)[2])).map((r) => r.t);
    const stop = rows.filter((r) => zoneStatus(Z[r.t], r.p)[2] === "stop").map((r) => r.t);
    const held = new Set(rows.map((r) => r.t));
    const up = [...(d.events ?? [])].sort((a, b) => a.date.localeCompare(b.date)).filter((e) => !today || (e.end ?? e.date) >= today);
    const fmt = (e: SkillEvent) => {
      const [, mo, da] = e.date.split("-").map(Number);
      return `${MONTHS[mo - 1].slice(0, 3)} ${da}`;
    };
    const nred = up.find((e) => (e.impact === "high" || e.impact === "hi") && ["fed", "macro", "political"].includes(e.type ?? ""));
    const nearn = up.find((e) => e.type === "earnings" && (e.tickers ?? []).some((t) => held.has(t)));
    const tiles: Array<[string, string, string, string, string]> = [
      ["In a buy zone", buy.join(", ") || "none", "tab-prices", "see price zones", "green"],
      ["In a trim zone", trim.concat(stop.map((t) => `${t} (below stop)`)).join(", ") || "none", "tab-prices", "see what to trim", "gold"],
      ["Next red folder", nred ? `${fmt(nred)} · ${stripMarkers(nred.title)}` : "none scheduled", "tab-calendar", "open calendar", "red"],
      ["Next earnings you own", nearn ? `${fmt(nearn)} · ${(nearn.tickers ?? []).join(", ")}` : "none scheduled", "tab-calendar", "open calendar", "cyan"],
    ];
    if (d.plan && d.plan.tranches && d.plan.tranches.length) {
      const t0 = d.plan.tranches[0];
      tiles.push(["Next buy in the plan", `${t0.window} · ${stripMarkers(t0.buy).replace(/<br>/g, " + ")}`, "tab-plan", "open the plan", "purple"]);
    }
    const out = tiles.map(([lab, val, tab, cta, tone]) => `<div class="panel gl ${tone}"><span class="l">${lab}</span><b>${val}</b><label class="go" for="${tab}">${cta} →</label></div>`).join("");
    let steps = (d.next_steps ?? []).map((x) => `<li>${rich(x)}</li>`).join("");
    steps = steps ? `<div class="panel pad" style="margin-top:10px"><div class="cap">What to do, in order</div><ol class="rules">${steps}</ol></div>` : "";
    const more = '<p style="margin:12px 2px 0;font-size:13px"><label class="go" for="tab-review">Read the honest review →</label> &nbsp;·&nbsp; <label class="go" for="tab-stocks">Open a stock\'s full page →</label></p>';
    return h2("At a glance", "computed from today's prices, the price zones and the calendar") + `<div class="glance">${out}</div>${steps}${more}`;
  };

  const stockPage = (c: SkillCard, W: Record<string, Row>, order: string[]): string => {
    const r = W[c.t];
    const tone = TONE[c.tone ?? "y"] ?? "y";
    const name = r ? r.n : c.name ?? c.t;
    const color = r ? r.c : "#8E86D8";
    const chips = order.map((t) => `<label for="tab-s-${sid(t)}" class="sk${t === c.t ? " on" : ""}">${t}</label>`).join("");
    const head = `<div class="snav"><label class="go" for="tab-stocks">← All stocks</label><div class="sks">${chips}</div></div>`;
    const rate = Math.trunc(c.rate);
    const pips = Array.from({ length: 10 }, (_v, j) => `<i class="pip${j < rate ? " on" : ""}" style="animation-delay:${(0.05 * j).toFixed(2)}s"></i>`).join("");
    const title = `<div class="panel pad shead"><span class="tk big" style="border-color:${color};color:${color}">${c.t}</span><div class="nm"><b>${name}</b><small>${rich(c.one)}</small></div><div class="sr"><span class="tag ${tone}">${c.tag}</span><span class="rt"><b>${rate}</b>/10${qmark("Rating", "e")}</span></div><div class="pips" style="grid-column:1/-1;margin:4px 0 0">${pips}</div></div>`;
    let mine: string;
    if (r) {
      const col = r.pl >= 0 ? "var(--green)" : "var(--red)";
      mine = `<div class="mine"><div><span class="l">Shares</span><b>${(+r.s.toFixed(4)).toString()}</b></div><div><span class="l">Your avg</span><b>$${fmtNum(r.a, 2)}</b></div><div><span class="l">Value</span><b>${money(r.val)}</b></div><div><span class="l">${T("Unrealized P/L")}</span><b style="color:${col}">${sgm(r.pl)} · ${sgp(r.plp)}</b></div><div><span class="l">${T("Weight", "e")}</span><b>${r.w.toFixed(1)}%</b></div></div>`;
    } else {
      mine = '<div class="mine"><div><span class="l">Status</span><b>Not owned — watchlist</b></div></div>';
    }
    const fc = c.fcf;
    const fcl = ({ "✅": "ok", "⚠️": "warn", "❌": "bad" } as Record<string, string>)[fc[0]] ?? "na";
    const verdict = `<div class="verdict ${tone}" style="margin:0 0 10px;font-size:15px"><b>Bottom line:</b> ${rich(c.why ?? "")}</div>`;
    const acts = (d.actions ?? []).filter((a) => new RegExp(`(?<![A-Z])${c.t}(?![A-Z])`).test(a.position));
    const act = acts.map((a) => `<div class="act"><div class="what"><span class="pill ${TONE[a.tone ?? "y"] ?? "y"}">${a.action.toUpperCase()}</span><small>${rich(a.size ?? "")}</small></div><div><p>${rich(a.why)}</p>${a.tax ? `<p class=tax>Tax effect: ${rich(a.tax)}</p>` : ""}</div></div>`).join("");
    const parts: string[] = [head, title, mine, verdict, `<div class="fcf ${fcl}"><span class="fi">${fc[0]}</span><div><b>Free cash flow${qmark("FCF")} — ${rich(fc[1])}</b><p>${rich(fc[2])}</p></div></div>`];
    if (act) parts.push(h2("What to do with it") + `<div class="panel">${act}</div>`);
    const z = (d.zones ?? []).find((z) => z.t === c.t);
    let pr = "";
    if (z) pr += `<div class="cap">${T("Buy zone")} · fair · trim</div>` + zoneHtml(z, W, true);
    if (c.range52 && r) pr += `<div class="cap" style="margin-top:18px">${T("52-wk range")}</div>` + rangeBar(c.range52[0], c.range52[1], r.p, r.a);
    const [be, ba, bu] = c.f;
    pr += `<div class="fore"><span class="ft">${T("12-month view", "s")} <em>(author estimate, not a forecast you can bank)</em></span><div class="fb"><span class="b1">Bear ${price(be)}</span><span class="b2">Base ${price(ba)}</span><span class="b3">Bull ${price(bu)}</span></div></div>`;
    parts.push(h2("Price: where it is and where it is worth buying or selling") + `<div class="panel pad">${pr}</div>`);
    let ks = "";
    (c.k ?? []).forEach(([a, b], j) => {
      ks += `<div class="kpi"><span class="l">${T(a, j % 4 === 3 ? "e" : j % 4 === 0 ? "s" : "")}</span><b>${rich(b)}</b></div>`;
    });
    let groups = "";
    for (const g of c.kgroups ?? []) {
      const items = g.items.map((it, j) => `<div class="kpi ${it[2] ?? ""}"><span class="l">${T(it[0], j % 4 === 3 ? "e" : j % 4 === 0 ? "s" : "")}</span><b>${rich(it[1])}</b></div>`).join("");
      groups += `<div class="kg"><h5>${g.name}</h5><div class="kgrid">${items}</div></div>`;
    }
    const legend = '<p class="mut" style="font-size:12px;margin:12px 0 0">Colour key: <b style="color:#9fc3a6">green</b> = healthy · <b style="color:#dcb86f">amber</b> = watch · <b style="color:#d59a8c">red</b> = problem · white = neutral. Tap any (?) for a plain-English definition.</p>';
    parts.push(h2("All the numbers", "valuation · growth · profitability · debt") + `<div class="panel pad"><div class="kg" style="margin-top:0"><h5>Headline</h5><div class="kgrid">${ks}</div></div>${groups}${legend}</div>`);
    if (c.trends && c.trends.length) parts.push(h2("Quarter-by-quarter dashboards", "the number on every bar, % change underneath") + `<div class="trends" style="margin-top:0">${c.trends.map((t) => trendBlock(t)).join("")}</div>`);
    if (c.history && c.history.length) parts.push(h2("Long-term history", "year by year") + `<div class="trends" style="margin-top:0">${c.history.map((t) => trendBlock({ ...t, period: "annual" })).join("")}</div>`);
    if (c.no_trends_reason) parts.push(`<p class="mut" style="font-size:13px">No financial dashboards: ${rich(c.no_trends_reason)}.</p>`);
    parts.push(h2("The case") + `<div class="panel pad"><div class="two" style="margin-top:0"><div><h4 style="margin-top:0">Best at</h4><p>${rich(c.best ?? "")}</p><h4>Works with</h4><p>${rich(c.partners ?? "")}</p><h4>Next ${T("catalyst")}</h4><p>${rich(c.cat ?? "")}</p></div><div><h4 class="gt" style="margin-top:0">Bull case</h4><p>${rich(c.bull ?? "")}</p><h4 class="rtx">Bear case</h4><p>${rich(c.bear ?? "")}</p><h4>${T("Tripwire")}</h4><p>${rich(c.trip ?? "")}</p></div></div></div>`);
    const evs = (d.events ?? []).filter((e) => (e.tickers ?? []).includes(c.t));
    if (evs.length) parts.push(secEvents(evs, d.meta.today, `${c.t} dates`, '<label class="go" for="tab-calendar">full calendar →</label>', false));
    parts.push(head);
    return parts.join("\n");
  };

  const secReview = (rv: NonNullable<SkillData["review"]>): string => {
    const grade = rv.grade ? `<div class="grade"><b>${rv.grade}</b><span>${rich(rv.grade_note ?? "overall")}</span></div>` : "";
    const lst = (items: string[], cls: string) => items.map((x) => `<li class="${cls}">${rich(x)}</li>`).join("");
    const cols = `<div class="grid2" style="margin-top:10px"><div class="panel pad"><div class="cap" style="color:#9fc3a6">What you are doing right</div><ul class="ticks">${lst(rv.good ?? [], "ok")}</ul></div><div class="panel pad"><div class="cap" style="color:#d59a8c">What worries me</div><ul class="ticks">${lst(rv.bad ?? [], "no")}</ul></div></div>`;
    const sug = `<div class="panel pad" style="margin-top:10px"><div class="cap">What I would do, in plain words</div><ol class="rules">${(rv.suggestions ?? []).map((x) => `<li>${rich(x)}</li>`).join("")}</ol></div>`;
    let per = (rv.per_stock ?? []).map((x) => `<label class="ps" for="tab-s-${sid(x.t)}"><b>${x.t}</b><span class="pill ${TONE[x.tone ?? "y"] ?? "y"}">${(x.call ?? "").toUpperCase()}</span><span>${rich(x.line)}</span><i>open →</i></label>`).join("");
    per = per ? `<div class="panel" style="margin-top:10px"><div class="cap" style="padding:14px 16px 4px">One line per stock</div>${per}</div>` : "";
    return h2("The honest review", "short, plain language, no jargon") + `<div class="panel pad review">${grade}<p class="big">${rich(rv.summary)}</p></div>${cols}${sug}${per}<p class="mut" style="font-size:12px;margin:10px 4px 0">This is an AI's opinion built from public data on the build date. It can be wrong, it is not financial advice, and it does not know your whole financial picture.</p>`;
  };

  const secGlossary = (): string => {
    const items = [...usedTerms].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map((k) => `<li><b>${k}</b> — ${esc(GL[k])}</li>`).join("");
    return h2("Glossary", "every (?) on this page, in one place") + `<div class="panel pad"><ul class="gloss">${items}</ul></div>`;
  };

  const secFooter = (): string => {
    let src = (d.sources ?? []).map((s) => `<li>${rich(s)}</li>`).join("");
    if (d.unverified) src += `<li><b>Not verified in this build:</b> ${rich(d.unverified)}</li>`;
    return `<footer><b style="color:var(--ink)">Sources &amp; dates</b><ul>${src}</ul>
 <div class="disc"><b>Not financial advice.</b> This is a research notebook built from public data. Ratings, the 12-month bear/base/bull figures, the model allocation, the sell/trim/hold calls, the stock ideas and the guardrails are the author's judgment, clearly labelled as estimates, and can be wrong. The author is an AI, not a licensed financial or tax advisor, and does not know your full financial picture. Every buy and sell decision is yours.</div></footer>`;
  };

  // ---------- assemble (mirrors main()) ----------
  const rows: Row[] = d.positions.map((p) => {
    const cost = p.shares * p.avg, val = p.shares * p.price;
    return { t: p.t, n: p.name ?? p.t, s: p.shares, a: p.avg, p: p.price, cost, val, pl: val - cost, plp: cost ? (val / cost - 1) * 100 : 0, c: p.color ?? "", w: 0 };
  });
  const TV = rows.reduce((s, r) => s + r.val, 0) || 1, TC = rows.reduce((s, r) => s + r.cost, 0);
  rows.sort((a, b) => b.val - a.val);
  rows.forEach((r, i) => { r.w = (r.val / TV) * 100; r.c = r.c || PALETTE[i % PALETTE.length]; });
  const W: Record<string, Row> = Object.fromEntries(rows.map((r) => [r.t, r]));
  const m = d.meta;
  const today = m.today;

  const pages: Array<[string, string | null, string, string]> = [];
  const page = (pid: string, label: string | null, badge: string, parts: string[]) => {
    const p = parts.filter(Boolean);
    if (p.length) pages.push([pid, label, badge, p.join("\n")]);
  };

  sec = 0;
  page("overview", "Overview", "", [secHero(m), secScore(rows, TV, TC, d.themes ?? []), d.honest_read ? `<div class="callout"><b>The honest read:</b> ${rich(d.honest_read)}</div>` : "", secGlance(rows, today), secAlloc(rows, TV, d.chips ?? [], d.alloc_note ?? "")]);
  sec = 0;
  page("review", "Honest review", "", [d.review ? secReview(d.review) : ""]);
  sec = 0;
  const nUp = (d.events ?? []).filter((e) => (e.impact === "high" || e.impact === "hi") && (!today || (e.end ?? e.date) >= today)).length;
  page("calendar", "Calendar", nUp ? String(nUp) : "", [d.calendar ? secCalendar(d.calendar, d.macro ?? [], d.calendar_title ?? "Key dates at a glance") : "", d.events ? secEvents(d.events, today) : ""]);
  sec = 0;
  page("plan", "Plan", d.plan ? money(m.new_cash) : "", [d.plan ? secPlan(d.plan, m.new_cash) : "", d.guardrails ? secGuardrails(d.guardrails) : ""]);
  sec = 0;
  page("prices", "Buy / Sell", "", [d.zones ? secZones(d.zones, W) : "", d.actions ? secActions(d.actions) : ""]);
  sec = 0;
  page("ideas", "New ideas", "", [d.ideas ? secIdeas(d.ideas) : ""]);
  sec = 0;
  page("stocks", "My stocks", String(rows.length), [secStockTable(rows, d.cards, d.zones ?? []), secStockTiles(d.cards, W)]);
  sec = 0;
  page("history", "History", "", [d.alltime ? secAlltime(d.alltime) : ""]);
  sec = 0;
  page("help", "Glossary", "", [secGlossary(), secFooter()]);

  const mainN = pages.length;
  const order = d.cards.map((c) => c.t);
  for (const c of d.cards) {
    sec = 0;
    pages.push([`s-${sid(c.t)}`, null, "", stockPage(c, W, order)]);
  }

  const radios = pages.map(([pid], i) => `<input class="tabr" type="radio" name="tab" id="tab-${pid}"${i === 0 ? " checked" : ""}>`).join("");
  const nav = pages.slice(0, mainN).map(([pid, lab, badge]) => `<label for="tab-${pid}">${lab}${badge ? `<i>${badge}</i>` : ""}</label>`).join("");
  let css = pages.map(([pid]) => `#tab-${pid}:checked~.pages #pg-${pid}{display:block}`).join("");
  for (const [pid, lab] of pages) {
    const tgt = lab ? pid : "stocks";
    css += `#tab-${pid}:checked~.nav label[for=tab-${tgt}]{background:var(--cyan);color:#0b1216;border-color:var(--cyan)}#tab-${pid}:checked~.nav label[for=tab-${tgt}] i{background:#0b121633;color:#0b1216}`;
  }
  const top = `<div class="topbar"><b>${esc(m.title ?? "Portfolio review")}</b><span>Built ${m.build_date} · prices = ${m.price_date}</span></div>`;
  const pgnav = (i: number): string => {
    if (i >= mainN) return "";
    const prev = i ? `<label class="go" for="tab-${pages[i - 1][0]}">← ${pages[i - 1][1]}</label>` : "<span></span>";
    const nxt = i < mainN - 1 ? `<label class="go" for="tab-${pages[i + 1][0]}">${pages[i + 1][1]} →</label>` : "<span></span>";
    return `<div class="pgnav">${prev}${nxt}</div>`;
  };
  const sect = pages.map(([pid, , , htm], i) => `<section class="page" id="pg-${pid}">${htm}${pgnav(i)}</section>`).join("");
  const body = [`<style>${css}</style>`, top, radios, `<nav class="nav">${nav}</nav>`, `<div class="pages">${sect}</div>`].join("\n");

  return TEMPLATE.replace("%%TITLE%%", esc(m.title ?? "Portfolio review")).replace("%%BODY%%", body);
}

// CSS/theme shell copied verbatim from the skill's assets/template.html (+ a tiny resize reporter for the iframe host).
const TEMPLATE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%%TITLE%%</title>
<style>
:root{--bg:#0E1116;--card:#161B22;--card2:#1B2230;--line:#222B38;--ink:#E6EAF0;--mut:#8A93A3;--green:#7C9A82;--red:#B07A6E;--gold:#C9A35C;--purple:#8E86D8;--cyan:#5AC8C8}
*{box-sizing:border-box}html{scroll-behavior:smooth;overflow-x:clip}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:22px 16px 60px}
.mut{color:var(--mut)}.r{margin-left:auto}
h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:38px 0 12px;font-weight:600}
h2 b{color:var(--ink)}h2 .sub{text-transform:none;letter-spacing:0;font-weight:400}
.panel{background:var(--card);border:1px solid var(--line);border-radius:16px}
.pad{padding:18px}
.q{display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;border:1px solid #3a4658;background:#10151d;color:var(--cyan);font-size:10px;font-weight:700;line-height:1;margin-left:5px;cursor:help;position:relative;vertical-align:middle;text-transform:none;letter-spacing:0;font-style:normal;outline:none;flex:none}
.q:hover,.q:focus{border-color:var(--cyan)}
.q::after{content:attr(data-tip);position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);width:260px;padding:10px 12px;border-radius:10px;background:#0b0f15;border:1px solid #33405a;box-shadow:0 10px 30px #000a;color:#dfe5ee;font-size:12.5px;font-weight:400;line-height:1.45;text-align:left;white-space:normal;opacity:0;visibility:hidden;transition:opacity .15s;pointer-events:none;z-index:60}
.q:hover::after,.q:focus::after{opacity:1;visibility:visible}
.q.e::after{left:auto;right:-8px;transform:none}
.q.s::after{left:-8px;transform:none}
.q.i{position:static}
.q.i::after{top:auto;left:12px;right:12px;width:auto;max-width:460px;transform:none;margin-top:24px}
.tbl .q.i::after{margin-top:56px}
.callout,.rules li,.act,.ev,.zn,.pick,.pad,.fcf,.two>div,.verdict,.step,.tr,.chips,.no,.hero{position:relative}
.grid2>.panel:last-child .q:not(.i)::after,.plan>.panel:last-child .q:not(.i)::after,.two>div:last-child .q:not(.i)::after{left:auto;right:-8px;transform:none}
.hero{position:relative;overflow:hidden;border-radius:20px;border:1px solid var(--line);padding:34px 28px;background:radial-gradient(1200px 380px at 85% -10%,#1d2a44 0,#141a26 45%,var(--card) 75%)}
.eyebrow{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--cyan)}
.hero h1{font-size:34px;line-height:1.12;margin:10px 0 10px;max-width:720px;letter-spacing:-.01em}
.hero p{max-width:700px;color:#c3cad6;margin:0 0 16px}
.stamp{display:inline-block;font-size:12px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:5px 12px;background:#0f141c}
.qfield{position:absolute;inset:0;pointer-events:none;opacity:.55}
.orb{position:absolute;border-radius:50%}
@keyframes f1{0%,100%{transform:translate(0,0)}50%{transform:translate(16px,-20px)}}
@keyframes f2{0%,100%{transform:translate(0,0)}50%{transform:translate(-20px,14px)}}
@keyframes pl{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.9;transform:scale(1.3)}}
.score{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:14px}
.score.c4{grid-template-columns:repeat(4,1fr)}
.sc{padding:14px 16px;animation:rise .6s ease both}
.sc span.l{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.sc b{font-size:22px;display:block;margin-top:4px}
.sc i{font-style:normal;font-size:12px;color:var(--mut)}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.callout{margin-top:12px;padding:16px 18px;border-left:3px solid var(--gold);background:var(--card2);border-radius:12px}
.callout b{color:var(--gold)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.donutw{display:flex;gap:18px;align-items:center}
.seg{opacity:0;animation:fade .7s ease forwards}
@keyframes fade{to{opacity:1}}
.dc{font-size:9px;fill:var(--mut);text-anchor:middle}.dv{font-size:15px;fill:var(--ink);text-anchor:middle;font-weight:700}
.lgw{flex:1;min-width:0}
.lg{display:flex;gap:8px;align-items:center;font-size:13px;padding:3px 0;border-bottom:1px dashed #1e2632}
.lg b{width:52px}.sw{width:10px;height:10px;border-radius:3px;flex:none}
.cap{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin-bottom:8px}
.hb{display:grid;grid-template-columns:58px 1fr 128px;gap:8px;align-items:center;font-size:13px;padding:4px 0}
.ht{height:10px;background:#10151d;border-radius:6px;overflow:hidden}
.hf{display:block;height:100%;border-radius:6px;transform:scaleX(0);transform-origin:left;animation:gx .9s ease forwards}
@keyframes gx{to{transform:scaleX(1)}}
.hv{text-align:right;font-weight:600}.hv i{font-style:normal;font-weight:400;color:var(--mut);font-size:12px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.chip{font-size:12px;padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:#10151d}
.chip b{color:var(--cyan)}.chip.gold b{color:var(--gold)}.chip.green b{color:var(--green)}.chip.purple b{color:var(--purple)}.chip.red b{color:var(--red)}
.tl{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.step{padding:12px;animation:rise .6s ease both}
.step .dot{width:10px;height:10px;border-radius:50%;background:#2b4a64;animation:lit 4.2s ease-in-out infinite;margin-bottom:8px}
@keyframes lit{0%,100%{background:#2b4a64;box-shadow:none}12%{background:var(--cyan);box-shadow:0 0 12px var(--cyan)}}
.step time{font-size:11px;color:var(--gold);letter-spacing:.06em;text-transform:uppercase}
.step b{display:block;font-size:13px;margin:2px 0}.step p{margin:0;font-size:12px;color:var(--mut)}
.step.done{opacity:.75}.step.done time{color:var(--mut)}
.macro{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}
.macro .pad{padding:14px 16px}.macro h4{margin:0 0 4px;font-size:13px}.macro p{margin:0;font-size:13px;color:#c3cad6}
.plan{display:grid;grid-template-columns:1.1fr 1fr;gap:12px}
.ab{display:grid;grid-template-columns:130px 1fr 86px;gap:10px;align-items:center;padding:7px 0;font-size:14px}
.ab small{display:block;color:var(--mut);font-size:11px}.ab .ht{height:14px}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)}
.tbl td{padding:9px 8px;border-bottom:1px solid #1c2430;vertical-align:top}
.tbl td b{white-space:nowrap}.scroll{overflow-x:auto}
.rules{margin:0;padding:0;list-style:none;counter-reset:r}
.rules li{counter-increment:r;padding:9px 0 9px 34px;position:relative;border-bottom:1px dashed #1e2632;font-size:13.5px}
.rules li:before{content:counter(r);position:absolute;left:0;top:9px;width:22px;height:22px;border-radius:7px;background:#10151d;border:1px solid var(--line);color:var(--cyan);font-size:12px;display:grid;place-items:center}
.no{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.no span{font-size:12px;padding:5px 9px;border-radius:8px;border:1px dashed #3a2f2c;color:#d1a79d;background:#1a1413}
.act{display:grid;grid-template-columns:150px 1fr;gap:14px;padding:13px 16px;border-bottom:1px solid #1c2430;align-items:start}
.act:last-child{border-bottom:0}
.act .what b{display:block;font-size:14px}.act .what small{color:var(--mut);display:block}
.act p{margin:0;font-size:13.5px;color:#cfd5df}.act p.tax{color:var(--mut);font-size:12.5px;margin-top:4px}
.pill{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.07em;padding:4px 8px;border-radius:999px;margin-bottom:5px}
.pill.g,.tag.g{background:#1a2a20;color:#9fc3a6}.pill.y,.tag.y{background:#2a2416;color:#dcb86f}.pill.r,.tag.r{background:#2b1b18;color:#d59a8c}.pill.p,.tag.p{background:#211f38;color:#b3adea}.pill.c{background:#13282a;color:#8fd6d6}
.idea{margin-bottom:10px}
.idea h3{margin:0 0 2px;font-size:16px}.idea .gap{color:var(--mut);font-size:13px;margin:0 0 12px}
.picks{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}
.pick{background:#121821;border:1px solid #1c2430;border-radius:12px;padding:12px 14px}
.pick .tkr{font-weight:700;color:var(--cyan)}.pick .rk{float:right;font-size:11px;color:var(--gold);font-weight:700}
.pick p{margin:6px 0 0;font-size:13px;color:#cfd5df}.pick p.n{color:var(--ink);font-weight:600;font-size:12.5px}.pick p.risk{color:#d1a79d;font-size:12.5px}
.ccard{margin-bottom:10px}
.head{display:grid;grid-template-columns:64px 1fr auto auto 18px;gap:12px;align-items:center;padding:14px 16px;cursor:pointer;border-radius:16px}
.head:hover{background:#19202b}
.tk{font-weight:700;font-size:13px;border:1px solid;border-radius:9px;padding:6px 0;text-align:center;letter-spacing:.04em}
.nm{font-weight:600}.nm small{display:block;font-weight:400;color:var(--mut);font-size:12.5px;line-height:1.4;margin-top:2px}
.tag{font-size:11px;font-weight:700;letter-spacing:.06em;padding:5px 9px;border-radius:999px;white-space:nowrap}
.rt{font-size:12px;color:var(--mut);white-space:nowrap}.rt b{font-size:20px;color:var(--gold)}
.caret{display:inline-block;transition:transform .2s;color:var(--mut)}
.acc .body{max-height:0;overflow:hidden;transition:max-height .5s ease,opacity .3s;opacity:.3;padding:0 16px}
.acc input:checked ~ .body{max-height:9000px;opacity:1;padding:2px 16px 18px;overflow:visible}
.acc input:checked ~ .head .caret{transform:rotate(90deg)}
.mine{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;background:#10151d;border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:10px}
.mine span.l,.kpi span.l{display:block;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.mine b{font-size:14px}
.fcf{display:flex;gap:12px;align-items:flex-start;border-radius:12px;padding:12px 14px;margin-bottom:10px;border:1px solid var(--line);background:var(--card2)}
.fcf .fi{font-size:20px;line-height:1.2}.fcf b{font-size:14px}.fcf p{margin:3px 0 0;font-size:13px;color:#c3cad6}
.fcf.ok{border-left:3px solid var(--green)}.fcf.warn{border-left:3px solid var(--gold)}.fcf.bad{border-left:3px solid var(--red);background:#1e1614}.fcf.na{border-left:3px solid var(--mut)}
.kgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.kpi{background:#121821;border:1px solid #1c2430;border-radius:10px;padding:9px 11px}.kpi b{font-size:13.5px}
.pips{display:flex;gap:4px;margin:12px 0 4px}
.pip{flex:1;height:5px;border-radius:3px;background:#1c2430}
.pip.on{background:var(--gold);transform:scaleX(0);transform-origin:left;animation:gx .5s ease forwards}
.two{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:6px}
.two h4{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin:12px 0 3px}
.two h4.gt{color:var(--green)}.two h4.rtx{color:var(--red)}
.two p{margin:0;font-size:13.5px;color:#cfd5df}
.fore{margin-top:14px}.ft{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}.ft em{text-transform:none;letter-spacing:0}
.fb{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:4px;margin-top:6px;font-size:13px;font-weight:600;text-align:center}
.fb span{padding:7px;border-radius:8px}.b1{background:#2b1b18;color:#d59a8c}.b2{background:#1c2a3a;color:#9cc7e6}.b3{background:#1a2a20;color:#9fc3a6}
.verdict{margin-top:12px;padding:11px 14px;border-radius:10px;background:#10151d;font-size:14px;border-left:3px solid var(--mut)}
.verdict.g{border-color:var(--green)}.verdict.y{border-color:var(--gold)}.verdict.r{border-color:var(--red)}.verdict.p{border-color:var(--purple)}
.topbar{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;justify-content:space-between;padding:2px 2px 0}
.topbar b{font-size:15px;letter-spacing:-.01em}.topbar span{font-size:12px;color:var(--mut)}
.tabr{position:absolute;opacity:0;pointer-events:none}
.nav{position:sticky;top:0;z-index:40;display:flex;gap:6px;overflow-x:auto;padding:10px 2px;margin:8px -2px 10px;background:linear-gradient(var(--bg) 78%,transparent);scrollbar-width:none}
.nav::-webkit-scrollbar{display:none}
.nav label{flex:none;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:13px;font-weight:600;color:var(--mut);cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}
.nav label:hover{color:var(--ink);border-color:#3a4658}
.nav label i{font-style:normal;font-size:11px;font-weight:700;margin-left:7px;padding:1px 7px;border-radius:999px;background:#10151d;color:var(--mut)}
.tabr:focus-visible~.nav{outline:1px dashed var(--cyan);outline-offset:2px;border-radius:12px}
.page{display:none;animation:pgin .35s ease both}
@keyframes pgin{from{opacity:0}to{opacity:1}}
.page>h2:first-child{margin-top:14px}
.pgnav{display:flex;justify-content:space-between;margin-top:26px;padding-top:14px;border-top:1px solid var(--line)}
.go{color:var(--cyan);font-size:13px;font-weight:600;cursor:pointer}.go:hover{text-decoration:underline}
.mini{margin-top:18px;font-size:12px;color:var(--mut);text-align:center}
.glance{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
.gl{padding:14px 16px;border-top:3px solid var(--line);animation:rise .6s ease both}
.gl span.l{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.gl b{display:block;font-size:15px;margin:5px 0 8px;line-height:1.35}
.gl.green{border-top-color:var(--green)}.gl.gold{border-top-color:var(--gold)}.gl.red{border-top-color:#c8453a}.gl.cyan{border-top-color:var(--cyan)}.gl.purple{border-top-color:var(--purple)}
.tbl.sum td{vertical-align:middle;white-space:nowrap}.tbl.sum .tag{font-size:10px;padding:3px 7px}
.vd{font-size:11px;font-weight:700;letter-spacing:.05em;padding:3px 8px;border-radius:999px;white-space:nowrap}
a.jump{text-decoration:none}a.jump:hover b{text-decoration:underline}
details.sub{margin-top:10px;border:1px solid #1c2430;border-radius:12px;background:#11161e}
details.sub>summary{list-style:none;cursor:pointer;padding:11px 14px;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);display:flex;align-items:center;gap:10px}
details.sub>summary::-webkit-details-marker{display:none}
details.sub>summary::before{content:"▸";color:var(--cyan);transition:transform .2s;display:inline-block}
details.sub[open]>summary::before{transform:rotate(90deg)}
details.sub>summary em{font-style:normal;font-weight:400;letter-spacing:0;text-transform:none;color:var(--mut)}
details.sub>*:not(summary){margin-left:14px;margin-right:14px}
details.sub>*:last-child{margin-bottom:14px}
details.sub .trends,details.sub .kg:first-of-type,details.sub .two{margin-top:0}
.snav{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;margin:6px 0 12px}
.snav:last-child,.page>.snav:nth-last-of-type(1){margin-top:22px}
.sks{display:flex;flex-wrap:wrap;gap:6px}
.sk{font-size:12px;font-weight:700;letter-spacing:.04em;padding:5px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--mut);cursor:pointer}
.sk:hover{color:var(--ink);border-color:#3a4658}.sk.on{background:#13282a;color:var(--cyan);border-color:#2a4a4e}
.shead{display:grid;grid-template-columns:auto 1fr auto;gap:10px 16px;align-items:center;margin-bottom:10px}
.tk.big{font-size:18px;padding:10px 16px}
.shead .nm b{font-size:20px;display:block}.shead .sr{display:flex;gap:12px;align-items:center}
.stiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.stile{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;padding:14px 16px;cursor:pointer;transition:border-color .15s,transform .15s;animation:rise .5s ease both}
.stile:hover{border-color:#3a4658;transform:translateY(-2px)}
.stile .tk{padding:5px 10px}.stile .rt{justify-self:end}
.stile .n,.stile .s,.stile .tag,.stile .f,.stile i{grid-column:1/-1}
.stile .n{font-size:15px}.stile .s{font-size:13px;color:var(--mut)}.stile .tag{justify-self:start}
.stile .f{font-size:12px;color:#c3cad6;line-height:1.4}.stile i{font-style:normal;font-size:12px;font-weight:600;color:var(--cyan);margin-top:2px}
.review{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center}
.review p.big{margin:0;font-size:16px;line-height:1.6;color:#dfe5ee}
.grade{width:92px;height:92px;border-radius:22px;display:grid;place-items:center;align-content:center;background:radial-gradient(circle at 30% 20%,#2a2416,#161B22);border:1px solid #4a3f22}
.grade b{font-size:38px;color:var(--gold);line-height:1}.grade span{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin-top:4px;text-align:center}
.ticks{list-style:none;margin:0;padding:0}.ticks li{position:relative;padding:8px 0 8px 26px;border-bottom:1px dashed #1e2632;font-size:14px;color:#dfe5ee}
.ticks li:last-child{border-bottom:0}
.ticks li:before{position:absolute;left:0;top:8px;font-weight:700}.ticks li.ok:before{content:"✓";color:#9fc3a6}.ticks li.no:before{content:"!";color:#d59a8c;left:5px}
.ps{display:grid;grid-template-columns:62px 118px 1fr auto;gap:10px;align-items:center;padding:11px 16px;border-top:1px solid #1a212c;cursor:pointer;font-size:13.5px;color:#dfe5ee}
.ps:hover{background:#19202b}.ps b{color:var(--cyan)}.ps .pill{margin:0;justify-self:start}.ps i{font-style:normal;font-size:12px;color:var(--cyan);white-space:nowrap}
.evm{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);padding:14px 16px 6px;border-top:1px solid var(--line)}
.evm:first-child{border-top:0}
.ev{display:grid;grid-template-columns:74px 26px 1fr;gap:10px;align-items:start;padding:9px 16px;border-top:1px solid #1a212c}
.ev.past{opacity:.5}
.ev .d{font-size:13px;font-weight:600;white-space:nowrap}.ev .d small{display:block;font-weight:400;color:var(--mut);font-size:11px}
.ev .tt{font-size:14px;font-weight:600}.ev .tt em{font-style:normal;font-weight:400;color:var(--mut);font-size:12px}
.ev p{margin:2px 0 0;font-size:13px;color:#c3cad6}
.tkc{display:inline-block;font-size:11px;font-weight:700;color:var(--cyan);border:1px solid #2a4a4e;border-radius:6px;padding:1px 6px;margin:0 4px 0 0}
.ety{display:inline-block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:1px 7px;margin-left:6px;vertical-align:middle}
.fold{position:relative;display:inline-block;width:20px;height:14px;border-radius:2px 3px 3px 3px;margin-top:6px;background:#3a4658}
.fold:before{content:"";position:absolute;left:0;top:-4px;width:9px;height:5px;border-radius:2px 3px 0 0;background:inherit}
.fold.high{background:#c8453a;box-shadow:0 0 10px #c8453a88;animation:fp 2.6s ease-in-out infinite}
@keyframes fp{0%,100%{opacity:.72}50%{opacity:1}}.fold.med{background:#d08a3c}.fold.low{background:#c9b458}
.evleg{display:flex;flex-wrap:wrap;gap:14px;padding:12px 16px;font-size:12px;color:var(--mut);border-top:1px solid var(--line)}
.evleg .fold{margin:0 6px 0 0;vertical-align:-2px;animation:none;box-shadow:none}
.zn{padding:14px 16px;border-top:1px solid #1a212c}.zn:first-child{border-top:0}
.znh{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:baseline;margin-bottom:26px}
.znh b.t{font-size:15px;color:var(--cyan)}.znh .now{font-size:13px}.znh .vd{font-size:11px;font-weight:700;letter-spacing:.06em;padding:3px 8px;border-radius:999px}
.ruler{position:relative;height:14px;border-radius:7px;background:#1c2430;display:flex;overflow:visible;margin:0 4px 30px}
.ruler .z{height:100%;transform:scaleX(0);transform-origin:left;animation:gx .8s ease forwards}
.ruler .z:first-child{border-radius:7px 0 0 7px}.ruler .z:last-child{border-radius:0 7px 7px 0}
.z.stop{background:#5a2a25}.z.sbuy{background:#3f7a52}.z.buy{background:#7C9A82}.z.fair{background:#2b3a4e}.z.trim{background:#C9A35C}.z.sell{background:#B07A6E}
.mk{position:absolute;top:-5px;width:2px;height:24px;background:#fff;transform:translateX(-1px)}
.mk span{position:absolute;bottom:26px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:700;white-space:nowrap;background:#0b0f15;border:1px solid #33405a;border-radius:6px;padding:1px 6px}
.mk.avg{background:repeating-linear-gradient(#8A93A3 0 3px,transparent 3px 6px)}
.mk.avg span{bottom:auto;top:26px;font-weight:400;color:var(--mut)}
.lv{display:flex;flex-wrap:wrap;gap:6px;font-size:12px}
.lv span{padding:3px 8px;border-radius:7px;background:#10151d;border:1px solid var(--line)}.lv b{font-weight:700}
.lv .zg b{color:#9fc3a6}.lv .zy b{color:#dcb86f}.lv .zr b{color:#d59a8c}
.mk.le span{left:0;transform:none}.mk.re span{left:auto;right:0;transform:none}
.zn p{margin:8px 0 0;font-size:13px;color:#c3cad6}
.kg{margin-top:12px}.kg h5{margin:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--purple);font-weight:600}
.kpi.good{border-color:#2c4a36}.kpi.good b{color:#9fc3a6}.kpi.warn{border-color:#4a3f22}.kpi.warn b{color:#dcb86f}.kpi.bad{border-color:#4a2a25}.kpi.bad b{color:#d59a8c}
.trends{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px;margin-top:14px}
.tr{background:#121821;border:1px solid #1c2430;border-radius:12px;padding:12px 12px 10px}
.tr h5{margin:0 0 2px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);font-weight:600}
.tr .un{font-size:11px;color:var(--mut)}
.bars{display:flex;gap:6px;align-items:stretch;margin-top:8px}
.bc{flex:1;min-width:0;text-align:center;display:flex;flex-direction:column}
.bc .v{font-size:11.5px;font-weight:700;margin-bottom:3px;white-space:nowrap}
.bc .up,.bc .dn{position:relative}
.bc .up i,.bc .dn i{position:absolute;left:12%;right:12%;border-radius:4px 4px 0 0;transform:scaleY(0);animation:gy .8s ease forwards}
.bc .up i{bottom:0;background:var(--cyan);transform-origin:bottom}.bc .dn i{top:0;background:var(--red);border-radius:0 0 4px 4px;transform-origin:top}
.bc.last .up i{background:var(--gold)}
@keyframes gy{to{transform:scaleY(1)}}
.bc .ax{height:1px;background:#33405a}
.bc .p{font-size:10.5px;color:var(--mut);margin-top:4px}
.bc .c{font-size:10.5px;font-weight:700;margin-top:1px}.bc .c.u{color:#9fc3a6}.bc .c.d{color:#d59a8c}
.bc .c2{font-size:10px;color:var(--mut)}
.tr .nt{font-size:12px;color:#c3cad6;margin:8px 0 0}
.gloss{columns:2;column-gap:26px;margin:0;padding:0;list-style:none;font-size:13px}
.gloss li{break-inside:avoid;padding:6px 0;border-bottom:1px dashed #1e2632;color:#cfd5df}.gloss b{color:var(--cyan)}
footer{margin-top:40px;font-size:12px;color:var(--mut);border-top:1px solid var(--line);padding-top:18px}
footer ul{padding-left:18px;margin:6px 0 14px;columns:2;column-gap:28px}footer li{margin-bottom:4px;break-inside:avoid}
.disc{background:var(--card2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;color:#c3cad6}
@media (max-width:760px){
 .score,.score.c4{grid-template-columns:repeat(2,1fr)}.grid2,.plan,.two,.macro{grid-template-columns:1fr}.tl{grid-template-columns:1fr 1fr}
 .kgrid{grid-template-columns:1fr 1fr}.mine{grid-template-columns:1fr 1fr}.hero h1{font-size:26px}
 .head{grid-template-columns:56px 1fr 18px}.head .tag,.head .rt{grid-column:2;justify-self:start}.head .rt{margin-top:-6px}
 .donutw{flex-direction:column}.hb{grid-template-columns:50px 1fr 112px}.ab{grid-template-columns:100px 1fr 70px}
 .act{grid-template-columns:1fr}.review{grid-template-columns:1fr}.grade{width:74px;height:74px}.grade b{font-size:30px}.ps{grid-template-columns:54px 1fr;}.ps span:not(.pill),.ps i{grid-column:1/-1}.shead{grid-template-columns:auto 1fr}.shead .sr{grid-column:1/-1}.topbar b{font-size:14px}.nav{margin:6px -16px 8px;padding:10px 16px}.ev{grid-template-columns:62px 22px 1fr;padding:9px 12px}.trends{grid-template-columns:1fr}.gloss,footer ul{columns:1}
 .q::after,.q.e::after,.q.s::after,.q.i::after{margin-top:0;max-width:none;position:fixed;left:12px;right:12px;bottom:12px;top:auto;width:auto;transform:none;font-size:14px;padding:14px 16px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.page{opacity:1}.seg{opacity:1}.hf,.pip.on,.ruler .z,.bc .up i,.bc .dn i{transform:none}}
</style></head><body><div class="wrap">
%%BODY%%
<p class="mini">Research notebook, not financial advice. Sources, glossary and the full disclaimer are in the Glossary tab.</p>
</div>
<script>
(function(){function h(){try{parent.postMessage({__skillHeight:document.documentElement.scrollHeight},'*')}catch(e){}}
new ResizeObserver(h).observe(document.body);addEventListener('load',h);addEventListener('change',function(){setTimeout(h,60)});setTimeout(h,120);})();
</script>
</body></html>`;
