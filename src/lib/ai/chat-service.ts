import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { streamAssistant, type ChatTurn } from "@/lib/ai/assistant";
import { logUsage } from "@/lib/ai/client";
import { gateAiAction } from "@/lib/quota/gate";
import type { DenyReason } from "@/lib/quota/gate";

export const CHAT_KIND = "chat";

export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "done"; remainingToday: number }
  | { type: "notice"; reason: DenyReason; message: string }
  | { type: "error"; message: string };

/** Last `limit` turns of a thread, oldest first, as model messages. */
export async function loadThread(userId: string, thread: string, limit = 12): Promise<ChatTurn[]> {
  const rows = await db().chatMessage.findMany({
    where: { userId, thread },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows
    .reverse()
    .map((r) => ({ role: r.role === "assistant" ? "assistant" : "user", content: r.content }) as ChatTurn);
}

/**
 * One grounded chat turn: gate for cost, persist the user message, stream the reply, persist it,
 * and log token usage. History is loaded from the thread so each turn stays cheap and stateless
 * on the client. Emits events for the SSE route; never throws for a denial (emits a notice).
 */
export async function runChatTurn(args: {
  userId: string | null;
  ip: string;
  thread: string;
  system: string;
  message: string;
  symbol?: string;
  emit: (e: ChatEvent) => void;
}): Promise<void> {
  const gate = await gateAiAction({
    userId: args.userId,
    ip: args.ip,
    kinds: [CHAT_KIND],
    dailyCap: env().FREE_DAILY_CHAT_MESSAGES,
  });
  if (!gate.allow) {
    args.emit({ type: "notice", reason: gate.reason, message: gate.message });
    return;
  }
  const userId = gate.userId;
  const message = args.message.trim().slice(0, 2000);
  if (!message) {
    args.emit({ type: "error", message: "Say something first." });
    return;
  }

  const history = await loadThread(userId, args.thread);
  await db().chatMessage.create({ data: { userId, thread: args.thread, role: "user", content: message } });

  let full = "";
  try {
    const result = await streamAssistant({
      system: args.system,
      messages: [...history, { role: "user", content: message }],
      onDelta: (t) => {
        full += t;
        args.emit({ type: "delta", text: t });
      },
    });
    await db().chatMessage.create({ data: { userId, thread: args.thread, role: "assistant", content: full } });
    await logUsage(CHAT_KIND, result.model, result.usage, { symbol: args.symbol, userId });
    const remaining = Math.max(0, gate.remainingToday - 1);
    args.emit({ type: "done", remainingToday: remaining });
  } catch (err) {
    args.emit({ type: "error", message: err instanceof Error ? err.message : "The assistant could not respond." });
  }
}
