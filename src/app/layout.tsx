import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DISCLAIMER } from "@/lib/analysis/schema";
import { env } from "@/lib/env";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Stock Ranker", template: "%s · Stock Ranker" },
  description: "Automated, source-verified stock research and rankings. FCF first. Not financial advice.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const demo = env().DEMO_MODE;
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4 flex-wrap">
            <Link href="/" className="font-semibold text-text no-underline tracking-tight">
              <span className="text-gold">▲</span> Stock Ranker
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/" className="text-muted hover:text-text no-underline">Search</Link>
              <Link href="/w" className="text-muted hover:text-text no-underline">Watchlists</Link>
              <Link href="/changes" className="text-muted hover:text-text no-underline">What changed</Link>
              {!demo && <Link href="/admin/costs" className="text-muted hover:text-text no-underline">Costs</Link>}
            </nav>
            <div className="ml-auto text-xs text-dim">{demo ? "demo mode · cached analyses" : "research notebook · not financial advice"}</div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">{children}</main>
        <footer className="border-t border-line mt-10">
          <div className="mx-auto max-w-6xl px-4 py-5 text-xs text-dim leading-relaxed">
            {DISCLAIMER} Built on the <code>stock-analysis</code> skill: every number carries its source and date; anything unverifiable is shown as
            &ldquo;unverified&rdquo;, never invented.
          </div>
        </footer>
      </body>
    </html>
  );
}
