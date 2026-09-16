"use client";

import { useEffect, useState } from "react";

/** Small header badge showing today's remaining fresh-analysis quota. */
export function QuotaBadge() {
  const [q, setQ] = useState<{ remaining: number; quota: number } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/me/quota")
      .then((r) => r.json())
      .then((d) => live && d.signedIn && setQ({ remaining: d.remaining, quota: d.quota }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!q) return null;
  const tone = q.remaining === 0 ? "chip-red" : q.remaining <= 1 ? "chip-gold" : "chip-muted";
  return (
    <span className={`chip ${tone}`} title="Fresh AI analyses left today (cached views are unlimited)">
      {q.remaining}/{q.quota} fresh
    </span>
  );
}
