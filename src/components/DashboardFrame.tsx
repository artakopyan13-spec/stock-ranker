"use client";

import { useEffect, useRef, useState } from "react";

/** Renders a self-contained HTML dashboard in an isolated, auto-resizing sandboxed iframe. */
export function DashboardFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1400);
  const [src, setSrc] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { __skillHeight?: number };
      if (data && typeof data.__skillHeight === "number" && ref.current && e.source === ref.current.contentWindow) {
        setHeight(Math.max(600, Math.ceil(data.__skillHeight) + 8));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  if (!src) return <div className="card p-6 text-sm text-muted">Rendering the dashboard…</div>;
  return (
    <iframe
      ref={ref}
      title="Portfolio review dashboard"
      src={src}
      sandbox="allow-scripts allow-popups"
      className="w-full rounded-2xl border border-line bg-[#0E1116]"
      style={{ height, colorScheme: "dark" }}
    />
  );
}
