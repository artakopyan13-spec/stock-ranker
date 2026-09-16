import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DISCLAIMER } from "@/lib/analysis/schema";
import { env } from "@/lib/env";
import { currentUser } from "@/auth";
import { doSignOut } from "@/lib/auth-actions";
import { CookieNotice } from "@/components/CookieNotice";
import { QuotaBadge } from "@/components/QuotaBadge";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Stock Ranker", template: "%s · Stock Ranker" },
  description: "Automated, source-verified AI stock research and rankings. FCF first. Not financial advice.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const demo = env().DEMO_MODE;
  const user = await currentUser();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line sticky top-0 z-40 bg-bg/90 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4 flex-wrap">
            <Link href="/" className="font-semibold text-text no-underline tracking-tight">
              <span className="text-gold">▲</span> Stock Ranker
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="text-muted hover:text-text no-underline">Search</Link>
              <Link href="/leaderboard" className="text-muted hover:text-text no-underline">Top Rated</Link>
              <Link href="/screener" className="text-muted hover:text-text no-underline">Screener</Link>
              <Link href="/compare" className="text-muted hover:text-text no-underline">Compare</Link>
              <Link href="/calendar" className="text-muted hover:text-text no-underline">Calendar</Link>
              <Link href="/w" className="text-muted hover:text-text no-underline">Watchlists</Link>
              <Link href="/changes" className="text-muted hover:text-text no-underline">What changed</Link>
              {user?.role === "admin" && <Link href="/admin" className="text-gold hover:text-text no-underline">Admin</Link>}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm">
              {user ? (
                <>
                  {!demo && <QuotaBadge />}
                  <Link href="/profile" className="text-muted hover:text-text no-underline">{user.name ?? user.email}</Link>
                  <form action={doSignOut}>
                    <button type="submit" className="btn btn-ghost py-1 px-2 text-xs">Sign out</button>
                  </form>
                </>
              ) : (
                <Link href="/signin" className="btn btn-primary py-1 px-3 text-xs no-underline">Sign in</Link>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">{children}</main>
        <footer className="border-t border-line mt-10">
          <div className="mx-auto max-w-6xl px-4 py-5 text-xs text-dim leading-relaxed flex flex-wrap gap-x-4 gap-y-1">
            <span className="w-full">{DISCLAIMER}</span>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <span>Every number carries its source and date; unverifiable is shown as &ldquo;unverified&rdquo;, never invented.</span>
          </div>
        </footer>
        <CookieNotice />
      </body>
    </html>
  );
}
