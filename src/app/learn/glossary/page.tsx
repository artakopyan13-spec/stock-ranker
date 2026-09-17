import type { Metadata } from "next";
import Link from "next/link";
import { GLOSSARY } from "@/lib/glossary";

export const metadata: Metadata = { title: "Glossary — every term explained" };

export default function GlossaryPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Glossary</h1>
        <p className="text-muted text-sm mt-1">Every metric in an analysis: what it is, why it matters, and the ranges to look for.</p>
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        {GLOSSARY.map((t) => <a key={t.id} href={`#${t.id}`} className="chip chip-muted no-underline">{t.term}</a>)}
      </div>
      <div className="space-y-3">
        {GLOSSARY.map((t) => (
          <section key={t.id} id={t.id} className="card p-5 scroll-mt-20">
            <h2 className="text-lg font-semibold">{t.term}</h2>
            <p className="text-sm text-muted mt-1">{t.short}</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-muted text-xs uppercase tracking-wider">What it is</dt><dd>{t.what}</dd></div>
              <div><dt className="text-muted text-xs uppercase tracking-wider">Why it matters</dt><dd>{t.why}</dd></div>
              <div className="grid md:grid-cols-2 gap-2">
                <div className="card-2 p-3 border-l-2 border-l-green"><dt className="text-green text-xs uppercase tracking-wider">Green flag</dt><dd className="text-sm mt-0.5">{t.good}</dd></div>
                <div className="card-2 p-3 border-l-2 border-l-red"><dt className="text-red text-xs uppercase tracking-wider">Red flag</dt><dd className="text-sm mt-0.5">{t.bad}</dd></div>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <Link href="/learn" className="text-sm">← back to the guide</Link>
    </div>
  );
}
