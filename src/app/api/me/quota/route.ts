import { currentUser } from "@/auth";
import { effectiveLimits } from "@/lib/quota/settings";
import { userAnalysesToday } from "@/lib/quota/spend";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The signed-in user's remaining fresh-analysis quota for today. */
export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ signedIn: false });
  const [limits, used, row] = await Promise.all([
    effectiveLimits(),
    userAnalysesToday(user.id),
    db().user.findUnique({ where: { id: user.id }, select: { dailyQuota: true } }),
  ]);
  const quota = row?.dailyQuota ?? limits.freeDailyFresh;
  return Response.json({ signedIn: true, used, quota, remaining: Math.max(0, quota - used) });
}
