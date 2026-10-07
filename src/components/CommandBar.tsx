"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SymbolMatch } from "@/lib/data/types";
import { fetchJson, postJson } from "@/lib/fetch-json";

type CommandResult = { action: "navigate"; href: string; label: string } | { action: "answer"; reply: string };

const EXAMPLES = ["Compare NVDA and AMD", "Cash machines under 20x FCF", "Profitable software rated 8+", "The next Nvidia"];

/**
 * The home search box: instant ticker autocomplete for quick jumps, plus a natural-language
 * fallback ("compare NVDA and AMD", "cash machines under 20x FCF") parsed by /api/command.
 */
export function CommandBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<SymbolMatch[]>([]);
  /** The query `matches` belong to — Enter only trusts suggestions for what's typed now. */
  const [matchesFor, setMatchesFor] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    // Abort the previous lookup so a slow, stale response can't overwrite the current one.
    const ctrl = new AbortController();
    timer.current = setTimeout(async () => {
      if (query.length < 1 || query.includes(" ")) {
        setMatches([]);
        setMatchesFor(query);
        setOpen(false);
        return;
      }
      const res = await fetchJson<{ matches?: SymbolMatch[] }>(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      const list = (res.data?.matches ?? []).slice(0, 6);
      setMatches(list);
      setMatchesFor(query);
      setActive(0);
      setOpen(list.length > 0);
    }, 220);
    return () => {
      ctrl.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  const goTicker = (symbol: string) => {
    setOpen(false);
    router.push(`/t/${encodeURIComponent(symbol.toUpperCase())}`);
  };

  const runCommand = async (text: string) => {
    const query = text.trim();
    if (!query || busy) return;
    setOpen(false);
    setAnswer(null);
    setBusy(true);
    setStatus("Thinking…");
    const res = await postJson<{ result?: CommandResult }>("/api/command", { q: query });
    const result = res.data?.result;
    if (result?.action === "navigate") {
      setStatus(result.label + "…");
      router.push(result.href);
    } else {
      setAnswer(result?.action === "answer" ? result.reply : (res.error ?? "Something went wrong. Try a ticker like AAPL."));
    }
    setBusy(false);
    if (result?.action !== "navigate") setStatus(null);
  };

  const submit = () => {
    // A highlighted single-ticker suggestion wins; otherwise treat the text as a command.
    if (open && matches[active] && matchesFor === q.trim() && !q.includes(" ")) {
      goTicker(matches[active].symbol);
    } else {
      void runCommand(q);
    }
  };

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex gap-2"
      >
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => matches.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, matches.length - 1));
            if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="A ticker, “compare NVDA and AMD”, or “cash machines under 20x FCF”"
          className="flex-1 text-base"
          aria-label="Search or ask"
          autoComplete="off"
          disabled={busy}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "…" : "Go"}
        </button>
      </form>

      {open && matches.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full card overflow-hidden">
          {matches.map((m, i) => (
            <li key={m.symbol} onMouseDown={() => goTicker(m.symbol)} className={`px-3 py-2 text-sm cursor-pointer flex justify-between gap-3 ${i === active ? "bg-card2" : ""}`}>
              <span>
                <span className="font-semibold">{m.symbol}</span> <span className="text-muted">{m.name}</span>
              </span>
              <span className="text-xs text-dim">{m.exchange ?? ""} {m.type}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="chip chip-muted hover:text-text" disabled={busy} onClick={() => { setQ(ex); void runCommand(ex); }}>
            {ex}
          </button>
        ))}
      </div>

      {status && <div className="mt-2 text-sm text-muted">{status}</div>}
      {answer && (
        <div className="mt-2 card p-3 text-sm text-muted border-l-2 border-l-purple">{answer}</div>
      )}
    </div>
  );
}
