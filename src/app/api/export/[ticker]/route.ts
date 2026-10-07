import { currentUser } from "@/auth";
import { db } from "@/lib/db";
import { isValidSymbol } from "@/lib/data";
import { getCompanyData } from "@/lib/data/company-source";
import { computeScorecard } from "@/lib/scorecard/compute";
import { capsFor } from "@/lib/plans";
import { buildWorkbook } from "@/lib/export/workbook";
import { toApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET — download an .xlsx financial model for the ticker. Paid feature (Pro+); admins exempt. */
export async function GET(_req: Request, ctx: { params: Promise<{ ticker: string }> }): Promise<Response> {
  const { ticker } = await ctx.params;
  const sym = ticker.toUpperCase();
  if (!isValidSymbol(sym)) return Response.json({ error: "Invalid ticker" }, { status: 400 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to export.", code: "login_required" }, { status: 401 });
  const row = await db().user.findUnique({ where: { id: user.id }, select: { plan: true, planRenewsAt: true } });
  if (!capsFor({ role: user.role, plan: row?.plan, planRenewsAt: row?.planRenewsAt }).deepAnalysis) {
    return Response.json({ error: "Excel export is a Pro feature.", code: "upgrade" }, { status: 402 });
  }

  try {
    const data = await getCompanyData(sym);
    const scorecard = computeScorecard(data);
    const buf = await buildWorkbook(data, scorecard);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${sym}-stock-ranker.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const e = toApiError(err);
    return Response.json({ error: e.message, code: e.code }, { status: e.status });
  }
}
