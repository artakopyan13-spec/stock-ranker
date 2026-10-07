"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson, postJson } from "@/lib/fetch-json";

interface Row { slug: string; name: string; contains: boolean }

export function AddToWatchlist({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void fetchJson<{ signedIn: boolean; watchlists: Row[] }>(`/api/me/watchlists?symbol=${encodeURIComponent(symbol)}`).then((r) => {
      if (r.data) {
        setSignedIn(r.data.signedIn);
        setRows(r.data.watchlists);
      } else setError(r.error);
    });
  };
  useEffect(load, [symbol]);

  const toggle = async (slug: string, add: boolean) => {
    setError(null);
    setRows((rs) => rs.map((r) => (r.slug === slug ? { ...r, contains: add } : r)));
    const res = await postJson("/api/me/watchlists", { symbol, slug, add });
    if (!res.ok) {
      // Roll back the optimistic tick so the checkbox matches what's actually saved.
      setRows((rs) => rs.map((r) => (r.slug === slug ? { ...r, contains: !add } : r)));
      setError(res.error);
      return;
    }
    router.refresh();
  };
  const create = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await postJson("/api/me/watchlists", { symbol, newList: newName, add: true });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNewName("");
      load();
      router.refresh();
    } finally {
      setCreating(false);
    }
  };

  if (signedIn === false) return <a href="/signin" className="btn py-1.5 px-3 text-sm no-underline">+ Watchlist</a>;
  const inCount = rows.filter((r) => r.contains).length;
  return (
    <div className="relative inline-block">
      <button className="btn py-1.5 px-3 text-sm" onClick={() => setOpen((o) => !o)}>
        {inCount > 0 ? `★ In ${inCount} watchlist${inCount > 1 ? "s" : ""}` : "+ Add to watchlist"}
      </button>
      {open && (
        <div className="absolute z-40 mt-1 right-0 w-64 card p-3 space-y-2">
          {rows.length === 0 && <div className="text-xs text-muted">No watchlists yet — create one below.</div>}
          {rows.map((r) => (
            <label key={r.slug} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="w-4 h-4 p-0" checked={r.contains} onChange={(e) => toggle(r.slug, e.target.checked)} />
              {r.name}
            </label>
          ))}
          <div className="flex gap-1 pt-2 border-t border-line">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New watchlist" className="flex-1 py-1 text-xs" />
            <button className="btn py-1 px-2 text-xs" onClick={create} disabled={creating}>{creating ? "…" : "Create"}</button>
          </div>
          {error && <div className="text-xs text-red">{error}</div>}
        </div>
      )}
    </div>
  );
}
