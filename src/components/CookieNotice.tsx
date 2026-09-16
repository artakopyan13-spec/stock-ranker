"use client";

import { useEffect, useState } from "react";

/** Minimal cookie/localStorage notice — we only store a session cookie + a dismiss flag. */
export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let ok = false;
    try {
      ok = localStorage.getItem("cookie-ok") === "1";
    } catch {
      ok = true;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(!ok);
  }, []);
  if (!show) return null;
  return (
    <div className="fixed bottom-3 left-3 right-3 md:left-auto md:max-w-sm z-50 card p-4 text-xs text-muted">
      This site uses a session cookie to keep you signed in and a local flag to remember this notice. No ad tracking.
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn btn-primary py-1 px-3 text-xs"
          onClick={() => {
            try {
              localStorage.setItem("cookie-ok", "1");
            } catch {}
            setShow(false);
          }}
        >
          Got it
        </button>
        <a href="/privacy" className="btn btn-ghost py-1 px-3 text-xs no-underline">Privacy</a>
      </div>
    </div>
  );
}
