"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// The five things people reach for most stay visible; everything else lives under "More".
const PRIMARY: [string, string][] = [
  ["/", "Search"],
  ["/screener", "Screener"],
  ["/leaderboard", "Top Rated"],
  ["/portfolio", "Portfolio"],
  ["/w", "Watchlists"],
];
const MORE: [string, string][] = [
  ["/compare", "Compare"],
  ["/calendar", "Calendar"],
  ["/track-record", "Track record"],
  ["/changes", "What changed"],
  ["/users", "People"],
  ["/learn", "Learn"],
  ["/how-it-works", "How it works"],
];

export function MainNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <nav className="flex items-center gap-1 text-[0.95rem] pb-2.5">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {PRIMARY.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className={`px-2.5 py-1 rounded-md no-underline whitespace-nowrap transition-colors ${active(href) ? "text-text bg-card2" : "text-muted hover:text-text"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${open ? "text-text bg-card2" : "text-muted hover:text-text"}`}
        >
          More ▾
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
            <div className="absolute right-0 mt-1 z-50 card p-1 min-w-44 shadow-2xl">
              {MORE.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-2 rounded-md text-sm no-underline transition-colors ${active(href) ? "text-text bg-card2" : "text-muted hover:text-text hover:bg-card2"}`}
                >
                  {label}
                </Link>
              ))}
              {isAdmin && (
                <Link href="/admin" onClick={() => setOpen(false)} className="block px-3 py-2 rounded-md text-sm text-gold no-underline hover:bg-card2">
                  Admin
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
