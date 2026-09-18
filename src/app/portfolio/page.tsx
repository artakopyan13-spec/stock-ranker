import type { Metadata } from "next";
import { currentUser } from "@/auth";
import { getPortfolioRow, toPayload } from "@/lib/portfolio/store";
import { PortfolioWorkspace } from "@/components/PortfolioWorkspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portfolio X-ray" };

export default async function PortfolioPage() {
  const user = await currentUser();
  const row = user ? await getPortfolioRow(user.id) : null;
  const initial = row ? await toPayload(row) : null;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Portfolio X-ray</h1>
        <p className="text-muted text-sm mt-1 max-w-2xl">Paste your holdings for an honest, source-verified read: real concentration, the bets that secretly move together, weak free-cash-flow exposure — then chat about it. Your positions stay private to your account.</p>
      </div>
      <PortfolioWorkspace initial={initial} signedIn={!!user} />
    </div>
  );
}
