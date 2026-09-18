import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { gateFreshAnalysis } from "@/lib/quota/gate";
import { generateReview } from "@/lib/portfolio/review";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** POST — generate the full portfolio review (heavy: gated as a fresh-analysis credit). */
export async function POST(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const gate = await gateFreshAnalysis({ userId: user.id, ip: clientIp(req) });
  if (!gate.allow) return Response.json({ notice: { reason: gate.reason, message: gate.message } });

  try {
    const review = await generateReview(user.id);
    return Response.json({ review });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not generate the review." }, { status: 400 });
  }
}
