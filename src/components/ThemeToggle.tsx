"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/** Light/dark toggle. Persists to localStorage; a tiny inline script in the layout applies it before paint. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let stored: Theme | null = null;
    try {
      const v = localStorage.getItem("theme");
      if (v === "light" || v === "dark") stored = v;
    } catch {
      /* ignore */
    }
    const active = stored ?? (document.documentElement.dataset.theme as Theme | undefined) ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    setTheme(active);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  };

  const label = theme === "light" ? "Switch to dark" : "Switch to light";
  return (
    <button type="button" onClick={toggle} title={label} aria-label={label} className="btn btn-ghost py-1 px-2 text-sm w-8 justify-center">
      {theme === null ? "◐" : theme === "light" ? "☾" : "☀"}
    </button>
  );
}
