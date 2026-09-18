import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { env } from "@/lib/env";
import { AI_ACTION_KINDS, gateAiAction } from "@/lib/quota/gate";
import { generateReview } from "@/lib/portfolio/review";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST — generate the honest AI review of the user's portfolio (gated AI action). */
export async function POST(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const gate = await gateAiAction({ userId: user.id, ip: clientIp(req), kinds: AI_ACTION_KINDS, dailyCap: env().FREE_DAILY_CHAT_MESSAGES });
  if (!gate.allow) return Response.json({ notice: { reason: gate.reason, message: gate.message } });

  try {
    const review = await generateReview(user.id);
    return Response.json({ review });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not generate the review." }, { status: 400 });
  }
}
