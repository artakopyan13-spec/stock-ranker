"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { GLOSSARY_BY_ID } from "@/lib/glossary";

const POP_W = 268;

/**
 * A "?" that opens a persistent, clickable explanation popover. The popover is rendered in a
 * portal with fixed positioning anchored to the button, so it is never clipped by an ancestor's
 * `overflow` (e.g. the horizontally-scrolling compare table). Click again, click outside, or Esc
 * to close; it also closes on scroll/resize so it never floats away from its anchor.
 */
export function InfoDot({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; arrow: number; above: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const t = GLOSSARY_BY_ID[id];

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(8, b.left + b.width / 2 - POP_W / 2), vw - POP_W - 8);
    const above = vh - b.bottom < 180; // not enough room below → flip up
    const top = above ? b.top - 8 : b.bottom + 8;
    const arrow = Math.min(Math.max(12, b.left + b.width / 2 - left), POP_W - 12);
    setPos({ top, left, arrow, above });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onMove = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  if (!t) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`What is ${t.term}?`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full border border-line text-[10px] leading-none text-muted hover:text-gold hover:border-gold align-middle"
      >
        ?
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            ref={popRef}
            role="tooltip"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: POP_W,
              transform: pos.above ? "translateY(-100%)" : undefined,
              zIndex: 90,
            }}
            className="card p-3 text-left shadow-xl block"
          >
            <span className="block text-xs font-semibold text-text">{t.term}</span>
            <span className="block text-xs text-muted mt-1 leading-relaxed">{t.short}</span>
            <Link href={`/learn/glossary#${t.id}`} className="block text-[0.7rem] text-purple mt-2 no-underline hover:underline">
              read more →
            </Link>
            <span
              aria-hidden
              style={{ left: pos.arrow, [pos.above ? "bottom" : "top"]: -5 } as React.CSSProperties}
              className="absolute h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-card border-line"
            />
          </span>,
          document.body,
        )}
    </>
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
