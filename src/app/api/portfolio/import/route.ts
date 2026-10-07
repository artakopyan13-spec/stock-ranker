import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { env } from "@/lib/env";
import { isValidSymbol } from "@/lib/data";
import { AI_ACTION_KINDS, gateAiAction } from "@/lib/quota/gate";
import { runAssistantJsonContent } from "@/lib/ai/assistant";
import { logUsage } from "@/lib/ai/client";
import { classifyAiError } from "@/lib/ai/errors";
import { Holding } from "@/lib/portfolio/schema";
import { getPortfolioRow, parseHoldingsRow, savePortfolio, toPayload } from "@/lib/portfolio/store";
import { parseActivityCsv } from "@/lib/portfolio/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby hard cap (anything higher is silently clamped)

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

const Body = z.object({
  kind: z.enum(["image", "pdf", "csv"]),
  mediaType: z.string().max(80).optional(),
  // Vercel rejects request bodies over 4.5 MB with a plain-text 413 before we ever run, so cap the
  // base64 a bit under that (~3.1 MB file). The client downscales big images to fit.
  dataBase64: z.string().max(4_200_000).optional(),
  text: z.string().max(2_000_000).optional(), // for csv
});

// Loose on purpose: one odd number from the model (negative, huge) shouldn't fail the whole file —
// rows are validated against Holding individually below.
const Extracted = z.object({
  holdings: z.array(z.object({ symbol: z.string(), shares: z.number().nullable(), avgCost: z.number().nullable(), valueUsd: z.number().nullable() })),
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
    const warn = result.warnings?.length ? ` ${result.warnings.length} item(s) couldn't be matched (e.g. sells with no buy in this export) — see the review's history tab.` : "";
    return Response.json({ portfolio: await toPayload(row), imported: result.holdings.length, kind, note: `Read ${result.rowCount} activity rows.${warn}` });
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
      // ~60 tokens per position: 2000 truncated statements past ~30 positions mid-JSON.
      maxTokens: 6000,
      timeoutMs: 45_000,
    });
    await logUsage("portfolio", model, usage, { userId: user.id });
    const valid = value.holdings.flatMap((h) => {
      const r = Holding.safeParse({ ...h, symbol: h.symbol.trim().toUpperCase() });
      return r.success ? [r.data] : [];
    });
    const holdings = mergeHoldings(valid);
    const row = await savePortfolio(user.id, { holdings, cashUsd: existing?.cashUsd ?? 0, notes: existing?.notes ?? null });
    const skipped = value.holdings.length - valid.length;
    return Response.json({ portfolio: await toPayload(row), imported: valid.length, skipped, kind, note: value.note });
  } catch (err) {
    const ai = classifyAiError(err);
    if (ai) return Response.json({ error: ai.message, code: ai.code }, { status: ai.status });
    console.error("[portfolio/import] extraction failed:", err instanceof Error ? err.message : err);
    // Parse/validation failures (e.g. "Unexpected end of JSON input") mean nothing a user can act on.
    return Response.json({ error: "Couldn't read the positions from that file. Try a clearer screenshot, or crop it to the holdings list." }, { status: 422 });
  }
}
