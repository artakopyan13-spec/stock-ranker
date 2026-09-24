"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { EinsteinAvatar } from "@/components/EinsteinAvatar";

/** Wall Street Einstein — a floating pixel-art "crazy genius trader", bottom-right on every page. */
export function AssistantBot({ signedIn = false }: { signedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const mood = busy ? "thinking" : "idle";

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-[60] w-[360px] max-w-[calc(100vw-2rem)] shadow-2xl lp-in">
          <div className="flex items-center gap-2 px-3 py-2 rounded-t-2xl border border-line border-b-0 bg-card2">
            <EinsteinAvatar state={mood} size={34} />
            <div className="leading-tight min-w-0">
              <div className="text-sm font-semibold truncate">Wall Street Einstein</div>
              <div className="text-[0.62rem] text-muted">{busy ? "cooking up an answer…" : "genius trader · explains, never advises"}</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="ml-auto text-muted hover:text-text px-1.5 text-sm" aria-label="Close">
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
              placeholder="Ask the professor…"
              emptyHint="Alright, listen up — I'm Wall Street Einstein: the brain of a physicist, the mouth of a trading-floor animal. Ask me what a metric means, how to work Stock Ranker, or what makes a business a monster or a trap. I break it down straight — but I don't hand out buy/sell calls, capisce?"
              suggestions={["What is free cash flow?", "How do I read the Scorecard?", "Is a high P/E always bad?", "What's a moat, in plain English?"]}
            />
          </div>
        </div>
      )}

      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close Wall Street Einstein" : "Ask Wall Street Einstein"} title="Ask Wall Street Einstein" className="lp-rex-fab fixed bottom-5 right-4 z-[60]">
        {open ? <span aria-hidden className="text-xl leading-none text-muted">✕</span> : <EinsteinAvatar state={mood} />}
        {!open && <span className="lp-rex-online" aria-hidden />}
      </button>
    </>
  );
}
