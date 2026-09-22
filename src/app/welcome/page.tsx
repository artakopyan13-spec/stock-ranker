import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { db } from "@/lib/db";
import { completeOnboarding } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

const EXPERIENCE = ["New to investing", "Active investor", "Finance professional"];
const GOALS = ["Analyze specific stocks", "Find new ideas", "Review my portfolio", "Track the AI's calls"];

export default async function WelcomePage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const row = await db().user.findUnique({ where: { id: user.id }, select: { onboardedAt: true } });
  if (row?.onboardedAt) redirect("/");
  const firstName = (user.name ?? user.email ?? "there").split("@")[0];

  return (
    <div className="max-w-lg mx-auto mt-8 space-y-6">
      <div className="text-center">
        <div className="text-3xl">👋</div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-2">Welcome, {firstName}.</h1>
        <p className="text-muted mt-2">Two quick questions so we can point you the right way. Takes 5 seconds.</p>
      </div>

      <form action={completeOnboarding} className="card p-6 space-y-6">
        <fieldset className="space-y-2">
          <legend className="font-semibold text-sm mb-1">Which best describes you?</legend>
          {EXPERIENCE.map((opt, i) => (
            <label key={opt} className="flex items-center gap-3 card-2 px-3 py-2.5 cursor-pointer hover:border-purple transition-colors">
              <input type="radio" name="experience" value={opt} required={i === 0} className="accent-[color:var(--gold)] w-4 h-4" />
              <span className="text-sm">{opt}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="font-semibold text-sm mb-1">What do you most want to do here?</legend>
          {GOALS.map((opt, i) => (
            <label key={opt} className="flex items-center gap-3 card-2 px-3 py-2.5 cursor-pointer hover:border-purple transition-colors">
              <input type="radio" name="goal" value={opt} required={i === 0} className="accent-[color:var(--gold)] w-4 h-4" />
              <span className="text-sm">{opt}</span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-1">
          <label htmlFor="source" className="font-semibold text-sm">How did you hear about us? <span className="text-dim font-normal">(optional)</span></label>
          <input id="source" name="source" placeholder="A friend, X, Reddit…" className="w-full" />
        </div>

        <button type="submit" className="btn btn-primary w-full justify-center">Start using Stock Ranker →</button>
      </form>
    </div>
  );
}
