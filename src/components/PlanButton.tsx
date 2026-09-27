"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Buy/upgrade button: starts Stripe Checkout and redirects to the hosted page. */
export function PlanButton({ plan, label, variant = "primary", disabled = false }: { plan: string; label: string; variant?: "primary" | "ghost"; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    if (busy || disabled) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.status === 401) {
        router.push("/signin");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setErr(data.error ?? "Something went wrong.");
    } catch {
      setErr("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={disabled || busy}
        className={`w-full ${variant === "primary" ? "btn btn-primary" : "btn"} ${disabled ? "opacity-60 cursor-default" : ""}`}
      >
        {busy ? "Starting checkout…" : label}
      </button>
      {err && <p className="mt-2 text-xs text-red text-center">{err}</p>}
    </div>
  );
}
