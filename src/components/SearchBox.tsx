"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SymbolMatch } from "@/lib/data/types";

export function SearchBox({ autoFocus = false, placeholder = "Ticker or company name — e.g. NVDA, Apple, ASML" }: { autoFocus?: boolean; placeholder?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<SymbolMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    timer.current = setTimeout(async () => {
      if (query.length < 1) {
        setMatches([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const body = (await res.json()) as { matches: SymbolMatch[] };
        setMatches(body.matches.slice(0, 8));
        setActive(0);
        setOpen(true);
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  const go = (symbol: string) => {
    setOpen(false);
    router.push(`/t/${encodeURIComponent(symbol.toUpperCase())}`);
  };

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const pick = matches[active]?.symbol ?? q.trim().toUpperCase();
          if (pick) go(pick);
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
          placeholder={placeholder}
          className="flex-1 text-base"
          aria-label="Search ticker or company"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary">
          Analyze
        </button>
      </form>
      {open && (matches.length > 0 || loading) && (
        <ul className="absolute z-30 mt-1 w-full card overflow-hidden">
          {loading && matches.length === 0 && <li className="px-3 py-2 text-sm text-muted">Searching…</li>}
          {matches.map((m, i) => (
            <li key={m.symbol} onMouseDown={() => go(m.symbol)} className={`px-3 py-2 text-sm cursor-pointer flex justify-between gap-3 ${i === active ? "bg-card2" : ""}`}>
              <span>
                <span className="font-semibold">{m.symbol}</span> <span className="text-muted">{m.name}</span>
              </span>
              <span className="text-xs text-dim">
                {m.exchange ?? ""} {m.type}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
