import Link from "next/link";
import { currentUser } from "@/auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { PlanButton } from "@/components/PlanButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing · Stock Ranker" };

export default async function PricingPage() {
  const user = await currentUser();
  const row = user ? await db().user.findUnique({ where: { id: user.id }, select: { plan: true } }) : null;
  const isAdmin = user?.role === "admin";
  const currentPlan = user ? (isAdmin ? "elite" : row?.plan ?? "free") : null;

  return (
    <main className="max-w-6xl mx-auto px-4 py-14">
      <div className="text-center max-w-2xl mx-auto">
        <span className="chip chip-gold">Founding-member pricing · locked in while you stay</span>
        <h1 className="text-4xl md:text-5xl font-bold mt-4">Stop guessing. Start knowing.</h1>
        <p className="text-muted mt-3 text-lg">
          Every plan grades any stock on sourced, dated numbers — never a hot take. Upgrade to unlock the Investment
          Committee, deeper analysis, and unlimited Wall Street Einstein.
        </p>
        {isAdmin && <p className="mt-3 text-xs text-gold">You&rsquo;re an admin — everything is unlimited for you regardless of plan.</p>}
      </div>

      <div className="grid gap-5 mt-12 md:grid-cols-2 lg:grid-cols-4 items-stretch">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const featured = plan.highlight;
          return (
            <div
              key={plan.id}
              className={`card p-6 flex flex-col relative ${featured ? "border-purple ring-1 ring-purple/40 shadow-lg" : ""}`}
            >
              {featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 chip chip-purple text-[0.7rem] font-semibold">MOST POPULAR</span>
              )}
              {plan.anchor && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 chip chip-gold text-[0.7rem] font-semibold">BEST VALUE</span>
              )}

              <h2 className="text-lg font-bold">{plan.name}</h2>
              <p className="text-xs text-muted mt-1 min-h-[2.5rem]">{plan.tagline}</p>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">${plan.priceMonthly}</span>
                <span className="text-muted text-sm">{plan.priceMonthly === 0 ? "forever" : "/mo"}</span>
              </div>
              {plan.priceMonthly > 0 && <p className="text-[0.7rem] text-muted mt-1">Billed monthly · cancel anytime</p>}

              <ul className="mt-5 space-y-2 text-sm flex-1">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex gap-2">
                    <span className="text-green shrink-0">✓</span>
                    <span className={perk.endsWith(":") ? "text-muted" : ""}>{perk}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <button type="button" disabled className="w-full btn opacity-60 cursor-default">
                    Your plan
                  </button>
                ) : plan.id === "free" ? (
                  <Link href="/signin" className="w-full btn no-underline block text-center">
                    Get started
                  </Link>
                ) : (
                  <PlanButton plan={plan.id} label={`Upgrade to ${plan.name}`} variant={featured ? "primary" : "ghost"} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Value reframe + reassurance */}
      <div className="mt-12 grid gap-4 md:grid-cols-3 text-center text-sm">
        <div className="card p-5">
          <div className="text-2xl mb-2">☕</div>
          <p className="text-muted">Pro is about <b className="text-text">$0.63/day</b> — less than a coffee a week for research that used to cost a Bloomberg terminal.</p>
        </div>
        <div className="card p-5">
          <div className="text-2xl mb-2">🔒</div>
          <p className="text-muted">Secure checkout by <b className="text-text">Stripe</b>. Cancel in one click. No lock-in, no surprises.</p>
        </div>
        <div className="card p-5">
          <div className="text-2xl mb-2">🧠</div>
          <p className="text-muted">Every paid plan unlocks the <b className="text-text">Investment Committee</b> — 5 AI analysts debating the bull and bear case.</p>
        </div>
      </div>

      <p className="text-center text-xs text-muted mt-10">
        Educational research, not financial advice. We never tell you what to buy. Prices in USD.
      </p>
    </main>
  );
}
