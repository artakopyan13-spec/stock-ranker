"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/fetch-json";

/** POST to a billing route that answers { url } and send the browser to that hosted Stripe page. */
function useStripeRedirect(endpoint: string, body: unknown) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await postJson<{ url?: string }>(endpoint, body);
    if (res.status === 401) {
      router.push("/signin");
      return;
    }
    if (res.ok && res.data?.url) {
      window.location.href = res.data.url;
      return;
    }
    setErr(res.error ?? "Something went wrong.");
    setBusy(false);
  }

  return { busy, err, go };
}

/** Buy/upgrade button: starts Stripe Checkout and redirects to the hosted page. */
export function PlanButton({ plan, label, variant = "primary", disabled = false }: { plan: string; label: string; variant?: "primary" | "ghost"; disabled?: boolean }) {
  const { busy, err, go } = useStripeRedirect("/api/billing/checkout", { plan });

  return (
    <div>
      <button
        type="button"
        onClick={() => !disabled && go()}
        disabled={disabled || busy}
        className={`w-full ${variant === "primary" ? "btn btn-primary" : "btn"} ${disabled ? "opacity-60 cursor-default" : ""}`}
      >
        {busy ? "Starting checkout…" : label}
      </button>
      {err && <p className="mt-2 text-xs text-red text-center">{err}</p>}
    </div>
  );
}

/** Opens the Stripe Billing Portal for paid users: switch plan, update card, or cancel. */
export function ManageSubscriptionButton({ label = "Manage subscription", variant = "ghost" }: { label?: string; variant?: "primary" | "ghost" }) {
  const { busy, err, go } = useStripeRedirect("/api/billing/portal", {});

  return (
    <div>
      <button type="button" onClick={go} disabled={busy} className={`w-full ${variant === "primary" ? "btn btn-primary" : "btn"}`}>
        {busy ? "Opening…" : label}
      </button>
      {err && <p className="mt-2 text-xs text-red text-center">{err}</p>}
    </div>
  );
}
