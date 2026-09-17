"use client";

import type { ReactNode } from "react";
import type { Analysis } from "@/lib/analysis/schema";
import { BalanceSection, BusinessSection, CatalystsSection, DataConcerns, FcfSection, ForecastSection, GrowthSection, HeaderSection, NewsSection, PriceSection, RatingSection, SourcesFooter, ThesisSection, TripwireSection, ValuationSection } from "@/components/sections";

/** Renders a complete, verified analysis (live page, share page, comparison cards). */
export function AnalysisView({ analysis, headerRight, compact = false }: { analysis: Analysis; headerRight?: ReactNode; compact?: boolean }) {
  const a = analysis;
  const currency = a.meta.currency;
  return (
    <div className="space-y-4">
      <HeaderSection meta={a.meta} price={a.price} rating={a.rating} fcfVerdict={a.fcf.verdict} right={headerRight} />
      {a.summary && (
        <div className="card p-4 md:p-5 border-l-2 border-l-gold">
          <div className="text-xs uppercase tracking-wider text-gold mb-1">In plain terms</div>
          <p className="text-sm leading-relaxed">{a.summary}</p>
        </div>
      )}
      {a.fcf.headlineRisk && (
        <div className="card p-4 border-l-2 border-l-red text-sm">
          <span className="text-red font-semibold">Headline risk:</span> {a.fcf.verdictReason}
        </div>
      )}
      <FcfSection fcf={a.fcf} currency={currency} />
      <RatingSection rating={a.rating} />
      <ThesisSection thesis={a.thesis} />
      {!compact && (
        <>
          <PriceSection price={a.price} currency={currency} />
          <ValuationSection valuation={a.valuation} />
          <GrowthSection growth={a.growth} currency={currency} />
          <BalanceSection balanceSheet={a.balanceSheet} currency={currency} />
          <NewsSection news={a.news} newsSource={a.newsSource} note={a.newsScanNote} />
          <BusinessSection business={a.business} />
        </>
      )}
      <CatalystsSection catalysts={a.catalysts} />
      <ForecastSection forecast={a.forecast12m} currentPrice={a.price.current.value} currency={currency} />
      <TripwireSection tripwire={a.tripwire} previous={a.previousTripwire} />
      <DataConcerns concerns={a.dataConcerns} />
      {!compact && <SourcesFooter analysis={a} />}
    </div>
  );
}
