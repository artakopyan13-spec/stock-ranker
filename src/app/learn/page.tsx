import type { Metadata } from "next";
import Link from "next/link";
import { FAQS } from "@/lib/glossary";

export const metadata: Metadata = { title: "Learn — how to read stocks" };

export default function LearnPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">How to read stocks &amp; pick a winner</h1>
        <p className="text-muted text-sm mt-1">Plain-language guide. No jargon left unexplained. Not financial advice.</p>
      </div>

      <section className="card p-5 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">The 5-minute framework</h2>
        <ol className="list-decimal ml-5 space-y-2">
          <li><b>Understand the business.</b> Can you explain what it sells in one sentence? If not, skip it.</li>
          <li><b>Follow the cash.</b> Look at <Link href="/learn/glossary#fcf">free cash flow</Link> first. Real, growing cash beats accounting profit. Negative cash flow is the biggest red flag.</li>
          <li><b>Find the moat.</b> What stops competitors from copying it — brand, scale, switching costs, unique tech? A <Link href="/learn/glossary#moat">moat</Link> is what lets a company stay profitable for years.</li>
          <li><b>Check the price.</b> Even a great company can be a bad buy if it&rsquo;s too expensive. Compare <Link href="/learn/glossary#pfcf">P/FCF</Link> and <Link href="/learn/glossary#forward-pe">forward P/E</Link> to its growth and its own history.</li>
          <li><b>Weigh the risks and catalysts.</b> Read the bear case as seriously as the bull case. Look for a near-term <Link href="/learn/glossary#catalyst">catalyst</Link> — including policy or political tailwinds — that could unlock potential.</li>
        </ol>
      </section>

      <section className="card p-5 space-y-2 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">Potential vs. today&rsquo;s numbers</h2>
        <p>A stock can look mediocre on current financials yet have high <i>potential</i>. That happens when a big change is coming: a new product cycle, a huge new market, or a political/regulatory tailwind (think AI infrastructure, chips, or defense). The job is to judge whether that potential is real and how much you&apos;re paying for it. High potential usually comes with high uncertainty — size those positions smaller.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Common questions</h2>
        <div className="space-y-2">
          {FAQS.map((f) => (
            <details key={f.q} className="card p-4">
              <summary className="cursor-pointer font-medium text-sm">{f.q}</summary>
              <p className="text-sm text-muted mt-2 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="card p-5 text-sm">
        <h2 className="text-lg font-semibold">Every term, explained</h2>
        <p className="text-muted mt-1">Want the definition of a specific metric with the ranges to look for? </p>
        <Link href="/learn/glossary" className="btn btn-primary mt-3 no-underline">Open the glossary</Link>
      </div>
    </div>
  );
}
