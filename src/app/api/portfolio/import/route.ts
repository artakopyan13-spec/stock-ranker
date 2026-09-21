import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { env } from "@/lib/env";
import { isValidSymbol } from "@/lib/data";
import { AI_ACTION_KINDS, gateAiAction } from "@/lib/quota/gate";
import { runAssistantJsonContent } from "@/lib/ai/assistant";
import { logUsage } from "@/lib/ai/client";
import { Holding } from "@/lib/portfolio/schema";
import { getPortfolioRow, parseHoldingsRow, savePortfolio, toPayload } from "@/lib/portfolio/store";
import { parseActivityCsv } from "@/lib/portfolio/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

const Body = z.object({
  kind: z.enum(["image", "pdf", "csv"]),
  mediaType: z.string().max(80).optional(),
  dataBase64: z.string().max(9_000_000).optional(), // ~6.5 MB file cap for image/pdf
  text: z.string().max(2_000_000).optional(), // for csv
});

const Extracted = z.object({
  holdings: z.array(Holding),
  note: z.string().nullable(),
});

const VISION_SYSTEM = `Extract stock holdings from this brokerage statement or screenshot. For each position return the ticker symbol (uppercase), share count, and average cost per share if shown (else null). If only a dollar value is shown, put it in valueUsd and leave shares null. Ignore cash, options, crypto, and totals. Never invent positions or numbers you cannot see; if a value is unreadable use null. Return JSON.`;

/** POST /api/portfolio/import — import holdings from a statement image/PDF (vision) or an activity CSV. */
export async function POST(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid upload." }, { status: 400 });
  const { kind } = parsed.data;

  const existing = await getPortfolioRow(user.id);
  const current = existing ? parseHoldingsRow(existing) : [];
  const mergeHoldings = (incoming: Holding[]) => {
    const bySymbol = new Map(current.map((h) => [h.symbol, h] as const));
    for (const h of incoming) if (isValidSymbol(h.symbol)) bySymbol.set(h.symbol.toUpperCase(), { ...h, symbol: h.symbol.toUpperCase() });
    return [...bySymbol.values()].slice(0, 60);
  };

  // --- Activity CSV: no AI, parse locally into all-time figures + derived holdings ---
  if (kind === "csv") {
    if (!parsed.data.text) return Response.json({ error: "No CSV content." }, { status: 400 });
    const result = parseActivityCsv(parsed.data.text);
    if (result.holdings.length === 0 && result.rowCount === 0) return Response.json({ error: "Couldn't read that CSV. Is it a brokerage activity export?" }, { status: 400 });
    const holdings = mergeHoldings(result.holdings);
    const row = await savePortfolio(user.id, {
      holdings,
      cashUsd: existing?.cashUsd ?? 0,
      notes: existing?.notes ?? null,
      alltime: JSON.stringify(result),
    });
    return Response.json({ portfolio: await toPayload(row), imported: result.holdings.length, kind, note: `Read ${result.rowCount} activity rows.` });
  }

  // --- Image / PDF: gated vision extraction ---
  if (!parsed.data.dataBase64) return Response.json({ error: "No file content." }, { status: 400 });
  const gate = await gateAiAction({ userId: user.id, ip: clientIp(req), kinds: AI_ACTION_KINDS, dailyCap: env().FREE_DAILY_CHAT_MESSAGES });
  if (!gate.allow) return Response.json({ notice: { reason: gate.reason, message: gate.message } });

  const mediaType = parsed.data.mediaType ?? (kind === "pdf" ? "application/pdf" : "image/png");
  let block: Anthropic.ContentBlockParam;
  if (kind === "pdf") {
    if (mediaType !== "application/pdf") return Response.json({ error: "Expected a PDF." }, { status: 400 });
    block = { type: "document", source: { type: "base64", media_type: "application/pdf", data: parsed.data.dataBase64 } };
  } else {
    if (!IMAGE_TYPES.includes(mediaType as (typeof IMAGE_TYPES)[number])) return Response.json({ error: "Unsupported image type." }, { status: 400 });
    block = { type: "image", source: { type: "base64", media_type: mediaType as (typeof IMAGE_TYPES)[number], data: parsed.data.dataBase64 } };
  }

  try {
    const { value, usage, model } = await runAssistantJsonContent({
      system: VISION_SYSTEM,
      content: [block, { type: "text", text: "Extract every stock position you can see." }],
      schema: Extracted,
      maxTokens: 2000,
    });
    await logUsage("portfolio", model, usage, { userId: user.id });
    const holdings = mergeHoldings(value.holdings);
    const row = await savePortfolio(user.id, { holdings, cashUsd: existing?.cashUsd ?? 0, notes: existing?.notes ?? null });
    return Response.json({ portfolio: await toPayload(row), imported: value.holdings.length, kind, note: value.note });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not read that file." }, { status: 400 });
  }
}
