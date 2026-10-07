"use client";

import { useEffect, useState } from "react";

/**
 * A reassuring progress bar for a long, non-streaming AI build. Real streaming progress isn't
 * available, so it eases toward ~95% over the expected duration and the caller snaps it to done
 * by unmounting it when the result arrives. Shows a live percentage.
 */
export function ProgressLine({ active, estSeconds = 40, label = "Building" }: { active: boolean; estSeconds?: number; label?: string }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      // asymptotic ease toward 95% — fast early, slow as it nears the cap
      setPct(Math.min(95, 95 * (1 - Math.exp(-elapsed / (estSeconds * 0.6)))));
    }, 300);
    return () => clearInterval(id);
  }, [active, estSeconds]);

  if (!active) return null;
  return (
    <div className="max-w-xs mx-auto mt-3" aria-live="polite">
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--card-2)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,var(--purple),var(--gold))", transition: "width .3s ease" }} />
      </div>
      <div className="text-[0.68rem] text-muted mt-1 tabular-nums">{label}… {Math.round(pct)}%</div>
    </div>
  );
}
