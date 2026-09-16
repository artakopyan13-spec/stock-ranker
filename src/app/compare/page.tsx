import type { Metadata } from "next";
import { Compare } from "@/components/Compare";

export const metadata: Metadata = { title: "Compare" };
export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const sp = await searchParams;
  const raw = typeof sp.tickers === "string" ? sp.tickers : "";
  const initial = raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 5);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Compare</h1>
      <Compare initial={initial} />
    </div>
  );
}
