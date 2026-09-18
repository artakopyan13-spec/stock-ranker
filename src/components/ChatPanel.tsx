"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  endpoint: string;
  body: Record<string, unknown>;
  historyUrl?: string;
  suggestions?: string[];
  placeholder?: string;
  emptyHint?: string;
  signedIn?: boolean;
}

/** Generic grounded-chat panel driving an SSE endpoint (copilot + portfolio share it). */
export function ChatPanel({ endpoint, body, historyUrl, suggestions = [], placeholder = "Ask a question…", emptyHint, signedIn = true }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!historyUrl) return;
    let alive = true;
    void fetch(historyUrl)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d: { messages?: ChatMsg[] }) => {
        if (alive && d.messages?.length) setMessages(d.messages);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [historyUrl]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setBusy(true);
      setNotice(null);
      setInput("");
      setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
      try {
        const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, message: q }) });
        if (!res.ok || !res.body) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            const payload = JSON.parse(dataLine.slice(6)) as { type: string; text?: string; message?: string; remainingToday?: number };
            if (payload.type === "delta") {
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + (payload.text ?? "") };
                return copy;
              });
            } else if (payload.type === "done") {
              if (typeof payload.remainingToday === "number") setRemaining(payload.remainingToday);
            } else if (payload.type === "notice" || payload.type === "error") {
              setNotice(payload.message ?? "The assistant is unavailable.");
              setMessages((m) => m.slice(0, -1)); // drop the empty assistant bubble
            }
          }
        }
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "Something went wrong.");
        setMessages((m) => (m.length && m[m.length - 1].content === "" ? m.slice(0, -1) : m));
      } finally {
        setBusy(false);
      }
    },
    [busy, endpoint, body],
  );

  if (!signedIn) {
    return (
      <div className="card p-6 text-center text-sm text-muted">
        <p>{emptyHint ?? "Sign in to chat with the assistant."}</p>
        <a href="/signin" className="btn btn-primary no-underline mt-3 inline-block">Sign in</a>
      </div>
    );
  }

  return (
    <div className="card flex flex-col" style={{ height: 460 }}>
      <div ref={scroller} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-muted">
            {emptyHint && <p className="mb-3">{emptyHint}</p>}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="chip chip-muted hover:text-text" onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-purple/15 text-text" : "bg-card2 border border-line"}`}>
              {m.content || (busy && i === messages.length - 1 ? <span className="inline-flex gap-1"><Dot /><Dot /><Dot /></span> : "")}
            </div>
          </div>
        ))}
      </div>
      {notice && <div className="px-4 py-2 text-xs text-gold border-t border-line">{notice}</div>}
      <form
        className="border-t border-line p-3 flex gap-2 items-center"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} className="flex-1 py-2 text-sm" disabled={busy} />
        <button type="submit" className="btn btn-primary py-2 px-3 text-sm" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
      {remaining !== null && <div className="px-4 pb-2 text-[0.65rem] text-dim">{remaining} assistant message{remaining === 1 ? "" : "s"} left today · not financial advice</div>}
    </div>
  );
}

function Dot() {
  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted animate-pulse" />;
}
