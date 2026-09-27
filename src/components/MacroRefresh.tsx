"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Regenerate the macro briefing (calendar + news). Gated: free users get an upgrade nudge. */
export function MacroRefresh({ label = "Refresh briefing" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setUpgrade(false);
    try {
      const res = await fetch("/api/macro", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force: true }) });
      const body = (await res.json().catch(() => ({}))) as { data?: unknown; notice?: { reason: string; message: string }; error?: string };
      if (body.notice) {
        setNotice(body.notice.message);
        setUpgrade(body.notice.reason === "user_quota");
      } else if (body.data) {
        router.refresh();
      } else {
        setNotice(body.error ?? "Couldn't refresh. Try again shortly.");
      }
    } catch {
      setNotice("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={refresh} disabled={busy} className="btn text-xs py-1 px-2">{busy ? "Refreshing…" : label}</button>
      {notice && <span className="text-xs text-gold">{notice}</span>}
      {upgrade && <a href="/pricing" className="btn btn-primary no-underline text-xs px-2 py-1">Upgrade →</a>}
    </div>
  );
}
