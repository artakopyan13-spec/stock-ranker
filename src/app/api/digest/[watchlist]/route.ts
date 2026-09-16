import type { NextRequest } from "next/server";
import { checkApiKey, unauthorized } from "@/lib/auth";
import { buildDigest, renderDigestHtml, renderDigestMarkdown, renderDigestText } from "@/lib/digest/build";

export const dynamic = "force-dynamic";

/**
 * GET /api/digest/:watchlist?format=json|md|text|html — the morning digest as a reusable
 * template. Point an external briefing tool at this endpoint with the API key.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/digest/[watchlist]">): Promise<Response> {
  const auth = checkApiKey(req);
  if (!auth.ok) return unauthorized(auth);
  const { watchlist } = await ctx.params;
  const digest = await buildDigest(watchlist);
  if (!digest) return Response.json({ error: "watchlist not found" }, { status: 404 });
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  switch (format) {
    case "md":
      return new Response(renderDigestMarkdown(digest), { headers: { "content-type": "text/markdown; charset=utf-8" } });
    case "text":
      return new Response(renderDigestText(digest), { headers: { "content-type": "text/plain; charset=utf-8" } });
    case "html":
      return new Response(renderDigestHtml(digest), { headers: { "content-type": "text/html; charset=utf-8" } });
    default:
      return Response.json(digest);
  }
}
