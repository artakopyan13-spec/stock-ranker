"use client";

import { useEffect, useState } from "react";

/** Small header badge showing today's remaining fresh-analysis quota. */
export function QuotaBadge() {
  const [q, setQ] = useState<{ remaining: number; quota: number; unlimited?: boolean; planName?: string } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/me/quota")
      .then((r) => r.json())
      .then((d) => live && d.signedIn && setQ({ remaining: d.remaining, quota: d.quota, unlimited: d.unlimited, planName: d.planName }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!q) return null;
  if (q.unlimited) {
    return (
      <span className="chip chip-purple" title={`Unlimited — ${q.planName ?? "Elite"} plan`}>
        ∞ {q.planName ?? "unlimited"}
      </span>
    );
  }
  const tone = q.remaining === 0 ? "chip-red" : q.remaining <= 1 ? "chip-gold" : "chip-muted";
  return (
    <a href="/pricing" className={`chip ${tone} no-underline`} title="Fresh AI analyses left today · tap to upgrade">
      {q.remaining}/{q.quota} fresh
    </a>
  );
}
