import { currentUser } from "@/auth";
import { userAnalysesToday } from "@/lib/quota/spend";
import { capsFor, getPlan } from "@/lib/plans";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The signed-in user's remaining fresh-analysis quota for today, plus their current plan. */
export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ signedIn: false });
  const [used, row] = await Promise.all([
    userAnalysesToday(user.id),
    db().user.findUnique({ where: { id: user.id }, select: { dailyQuota: true, plan: true } }),
  ]);
  const caps = capsFor({ role: user.role, plan: row?.plan });
  const planName = user.role === "admin" ? "Admin" : getPlan(row?.plan).name;
  if (caps.unlimited) return Response.json({ signedIn: true, used, unlimited: true, plan: caps.planId, planName });
  const quota = row?.dailyQuota ?? caps.freshPerDay;
  return Response.json({ signedIn: true, used, quota, remaining: Math.max(0, quota - used), plan: caps.planId, planName });
}
