"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { RexAvatar } from "@/components/RexAvatar";

/** Rex — a floating animated character (research sidekick), bottom-right on every page. */
export function AssistantBot({ signedIn = false }: { signedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const mood = busy ? "thinking" : "idle";

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-[60] w-[360px] max-w-[calc(100vw-2rem)] shadow-2xl lp-in">
          <div className="flex items-center gap-2 px-3 py-2 rounded-t-2xl border border-line border-b-0 bg-card2">
            <RexAvatar state={mood} size={32} />
            <div className="leading-tight">
              <div className="text-sm font-semibold">Rex</div>
              <div className="text-[0.62rem] text-muted">{busy ? "thinking…" : "research sidekick · explains, never advises"}</div>
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
              onBusyChange={setBusy}
              placeholder="Ask Rex anything…"
              emptyHint="Hey — I'm Rex, your research sidekick. Ask me what a metric means, how to use Stock Ranker, or what makes a business good or risky. I explain things; I don't give financial advice."
              suggestions={["What is free cash flow?", "How do I read the Scorecard?", "Is a high P/E always bad?", "How does the Investment Committee work?"]}
            />
          </div>
        </div>
      )}

      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close Rex" : "Ask Rex"} title="Ask Rex" className="lp-rex-fab fixed bottom-5 right-4 z-[60]">
        {open ? <span aria-hidden className="text-xl leading-none text-muted">✕</span> : <RexAvatar state={mood} />}
        {!open && <span className="lp-rex-online" aria-hidden />}
      </button>
    </>
  );
}
