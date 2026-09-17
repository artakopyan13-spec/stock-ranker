"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GLOSSARY_BY_ID } from "@/lib/glossary";

/** A "?" that opens a persistent, clickable explanation popover. Click again or outside to close. */
export function InfoDot({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const t = GLOSSARY_BY_ID[id];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  if (!t) return null;
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`What is ${t.term}?`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full border border-line text-[10px] leading-none text-muted hover:text-gold hover:border-gold"
      >
        ?
      </button>
      {open && (
        <span
          className="absolute z-[60] left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)] w-64 card p-3 text-left shadow-xl"
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block text-xs font-semibold text-text">{t.term}</span>
          <span className="block text-xs text-muted mt-1 leading-relaxed">{t.short}</span>
          <Link href={`/learn/glossary#${t.id}`} className="block text-[0.7rem] text-purple mt-2 no-underline hover:underline">read more →</Link>
          <span className="absolute left-1/2 -translate-x-1/2 top-full -mt-px h-2 w-2 rotate-45 bg-card border-r border-b border-line" />
        </span>
      )}
    </span>
  );
}

/** A label with an attached info dot. */
export function Term({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <InfoDot id={id} />
    </span>
  );
}
