"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Row { slug: string; name: string; contains: boolean }

export function AddToWatchlist({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [newName, setNewName] = useState("");

  const load = () => {
    fetch(`/api/me/watchlists?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => {
        setSignedIn(d.signedIn);
        setRows(d.watchlists);
      })
      .catch(() => setSignedIn(false));
  };
  useEffect(load, [symbol]);

  const toggle = async (slug: string, add: boolean) => {
    setRows((rs) => rs.map((r) => (r.slug === slug ? { ...r, contains: add } : r)));
    await fetch("/api/me/watchlists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol, slug, add }) });
    router.refresh();
  };
  const create = async () => {
    if (!newName.trim()) return;
    await fetch("/api/me/watchlists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol, newList: newName, add: true }) });
    setNewName("");
    load();
    router.refresh();
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
            <button className="btn py-1 px-2 text-xs" onClick={create}>Create</button>
          </div>
        </div>
      )}
    </div>
  );
}
