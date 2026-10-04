"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Downloads the .xlsx financial model. Gated to paid plans; shows an upgrade link otherwise. */
export function ExcelExportButton({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setUpgrade(false);
    try {
      const res = await fetch(`/api/export/${symbol}`);
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (res.status === 401) {
          router.push("/signin");
          return;
        }
        setUpgrade(b.code === "upgrade");
        setMsg(b.error ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${symbol}-stock-ranker.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMsg("Export failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={download} disabled={busy} className="btn text-sm" title="Download an Excel financial model">
        {busy ? "Preparing…" : "⬇ Excel"}
      </button>
      {msg && (upgrade ? <a href="/pricing" className="text-xs text-gold no-underline">{msg} Upgrade →</a> : <span className="text-xs text-red">{msg}</span>)}
    </span>
  );
}
