import type { Metadata } from "next";
export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <article className="prose-invert max-w-2xl mx-auto text-sm leading-relaxed space-y-4">
      <h1 className="text-2xl font-semibold">Terms of Use</h1>
      <p className="text-muted">Last updated: 2026. By using Stock Ranker you agree to these terms.</p>
      <h2 className="text-lg font-semibold">Not financial advice</h2>
      <p>Stock Ranker is a research notebook. Ratings, forecasts, and any BUY/HOLD/SELL label are the output of an AI model and are the model&rsquo;s judgment, not fact and not personalized investment advice. Numbers are sourced from third-party data providers and may be delayed, incomplete, or wrong. Verify every figure against the cited source before making any decision. You are solely responsible for your investment decisions.</p>
      <h2 className="text-lg font-semibold">Acceptable use</h2>
      <p>Do not abuse the service: no automated scraping beyond your account&rsquo;s quota, no attempts to circumvent rate limits or quotas, no reselling of analyses. We may suspend accounts that do. Fresh AI analyses are limited per account per day; cached analyses are free to view.</p>
      <h2 className="text-lg font-semibold">No warranty</h2>
      <p>The service is provided &ldquo;as is,&rdquo; without warranty of any kind. We are not liable for any loss arising from use of the service or reliance on its content.</p>
      <h2 className="text-lg font-semibold">Changes</h2>
      <p>We may update these terms; continued use means acceptance. Contact the site owner with questions.</p>
    </article>
  );
}
