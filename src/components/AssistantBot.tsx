"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";

/** Rex — a floating "market fox" research sidekick, bottom-right on every page. */
export function AssistantBot({ signedIn = false }: { signedIn?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-[60] w-[360px] max-w-[calc(100vw-2rem)] shadow-2xl lp-in">
          <div className="flex items-center gap-2 px-3 py-2 rounded-t-2xl border border-line border-b-0 bg-card2">
            <span className="lp-rex-avatar" aria-hidden>🦊</span>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Rex</div>
              <div className="text-[0.62rem] text-muted">research sidekick · explains, never advises</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="ml-auto text-muted hover:text-text px-1.5 text-sm" aria-label="Close Rex">
              ✕
            </button>
          </div>
          <div className="[&>.card]:rounded-t-none">
            <ChatPanel
              endpoint="/api/assistant"
              body={{}}
              historyUrl="/api/assistant"
              signedIn={signedIn}
              placeholder="Ask Rex anything…"
              emptyHint="Hey — I'm Rex, your research sidekick. Ask me what a metric means, how to use Stock Ranker, or what makes a business good or risky. I explain things; I don't give financial advice."
              suggestions={["What is free cash flow?", "How do I read the Scorecard?", "Is a high P/E always bad?", "How does the Investment Committee work?"]}
            />
          </div>
        </div>
      )}

      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close Rex" : "Ask Rex"} className="lp-rex-fab fixed bottom-5 right-4 z-[60]">
        <span aria-hidden className="text-2xl leading-none">{open ? "✕" : "🦊"}</span>
        {!open && <span className="lp-rex-online" aria-hidden />}
      </button>
    </>
  );
}
