"use client";

import { useState } from "react";
import Link from "next/link";
import { GLOSSARY_BY_ID } from "@/lib/glossary";

/** A small "?" that reveals a plain-language explanation of a term on click/hover. */
export function InfoDot({ id, className = "" }: { id: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const t = GLOSSARY_BY_ID[id];
  if (!t) return null;
  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label={`What is ${t.term}?`}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-line text-[10px] text-muted hover:text-gold hover:border-gold align-middle"
      >
        ?
      </button>
      {open && (
        <span className="absolute z-50 left-1/2 -translate-x-1/2 bottom-[calc(100%+6px)] w-64 card p-3 text-left shadow-lg" role="tooltip">
          <span className="block text-xs font-semibold text-text">{t.term}</span>
          <span className="block text-xs text-muted mt-1">{t.short}</span>
          <Link href={`/learn/glossary#${t.id}`} className="block text-[0.68rem] text-purple mt-1.5 no-underline">read more →</Link>
        </span>
      )}
    </span>
  );
}

/** A label with an attached info dot, e.g. <Term id="fcf">FCF margin</Term>. */
export function Term({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <InfoDot id={id} />
    </span>
  );
}
