import { Resend } from "resend";
import { env } from "@/lib/env";
import { DISCLAIMER } from "@/lib/analysis/schema";

export interface OutboundMessage {
  subject: string;
  text: string; // plain text / Telegram-friendly markdown-free text
  html?: string;
}

export interface Channel {
  readonly name: string;
  send(msg: OutboundMessage): Promise<void>;
}

export class ChannelNotConfiguredError extends Error {
  constructor(name: string, missing: string) {
    super(`Alert channel "${name}" is not configured: set ${missing}`);
    this.name = "ChannelNotConfiguredError";
  }
}

class ConsoleChannel implements Channel {
  readonly name = "console";
  async send(msg: OutboundMessage): Promise<void> {
    console.log(`[alert:console] ${msg.subject}\n${msg.text}`);
  }
}

class TelegramChannel implements Channel {
  readonly name = "telegram";
  constructor(private readonly token: string, private readonly chatId: string) {}
  async send(msg: OutboundMessage): Promise<void> {
    const text = `${msg.subject}\n\n${msg.text}`.slice(0, 4000);
    const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: this.chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) throw new Error(`Telegram sendMessage failed: HTTP ${res.status} ${await res.text()}`);
  }
}

class EmailChannel implements Channel {
  readonly name = "email";
  private readonly resend: Resend;
  constructor(apiKey: string, private readonly from: string, private readonly to: string) {
    this.resend = new Resend(apiKey);
  }
  async send(msg: OutboundMessage): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: this.to.split(",").map((s) => s.trim()),
      subject: msg.subject,
      text: msg.text,
      html: msg.html ?? `<pre style="font-family:system-ui;white-space:pre-wrap">${escapeHtml(msg.text)}</pre>`,
    });
    if (error) throw new Error(`Resend failed: ${error.message}`);
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function getChannel(): Channel {
  const e = env();
  switch (e.ALERT_CHANNEL) {
    case "telegram":
      if (!e.TELEGRAM_BOT_TOKEN || !e.TELEGRAM_CHAT_ID) throw new ChannelNotConfiguredError("telegram", "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID");
      return new TelegramChannel(e.TELEGRAM_BOT_TOKEN, e.TELEGRAM_CHAT_ID);
    case "email":
      if (!e.RESEND_API_KEY || !e.ALERT_EMAIL_TO) throw new ChannelNotConfiguredError("email", "RESEND_API_KEY and ALERT_EMAIL_TO");
      return new EmailChannel(e.RESEND_API_KEY, e.ALERT_EMAIL_FROM, e.ALERT_EMAIL_TO);
    default:
      return new ConsoleChannel();
  }
}

/** Every alert and digest ends with the skill's footer (rule 5). */
export function withFooter(text: string): string {
  return `${text}\n\n— ${DISCLAIMER}`;
}
