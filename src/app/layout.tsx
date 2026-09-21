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
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppShell } from "@/components/AppShell";
import { InlineScript } from "@/components/InlineScript";

const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <InlineScript html={THEME_INIT} />
        <AppShell
          authed={!!user}
          demo={demo}
          footer={
            <footer className="border-t border-line mt-10">
              <div className="mx-auto max-w-6xl px-4 py-5 text-xs text-dim leading-relaxed flex flex-wrap gap-x-4 gap-y-1">
                <span className="w-full">{DISCLAIMER}</span>
                <Link href="/terms">Terms</Link>
                <Link href="/privacy">Privacy</Link>
                <span>Every number carries its source and date; unverifiable is shown as &ldquo;unverified&rdquo;, never invented.</span>
              </div>
            </footer>
          }
          header={
        <header className="border-b border-line sticky top-0 z-40 bg-bg/90 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex items-center justify-between gap-4 pt-3.5 pb-2">
              <Link href="/" className="text-lg font-semibold text-text no-underline tracking-tight shrink-0">
                <span className="text-gold">▲</span> Stock Ranker
              </Link>
              <div className="flex items-center gap-3 text-sm shrink-0">
                <ThemeToggle />
                {user ? (
                  <>
                    {!demo && <QuotaBadge />}
                    <Link href="/profile" className="text-muted hover:text-text no-underline hidden sm:inline">{user.name ?? user.email}</Link>
                    <Link href="/settings" className="text-muted hover:text-text no-underline text-base" title="Settings">⚙</Link>
                    <form action={doSignOut}>
                      <button type="submit" className="btn btn-ghost py-1 px-2 text-xs">Sign out</button>
                    </form>
                  </>
                ) : (
                  <Link href="/signin" className="btn btn-primary py-1.5 px-4 text-sm no-underline">Sign in</Link>
                )}
              </div>
            </div>
            <nav className="flex items-center gap-6 text-[0.95rem] pb-2.5 overflow-x-auto no-scrollbar">
              {(
                [
                  ["/", "Search"],
                  ["/leaderboard", "Top Rated"],
                  ["/track-record", "Track record"],
                  ["/screener", "Screener"],
                  ["/compare", "Compare"],
                  ["/portfolio", "Portfolio"],
                  ["/calendar", "Calendar"],
                  ["/w", "Watchlists"],
                  ["/changes", "What changed"],
                  ["/learn", "Learn"],
                  ["/how-it-works", "How it works"],
                  ["/users", "People"],
                ] as const
              ).map(([href, label]) => (
                <Link key={href} href={href} className="text-muted hover:text-text no-underline whitespace-nowrap py-0.5 transition-colors">
                  {label}
                </Link>
              ))}
              {user?.role === "admin" && <Link href="/admin" className="text-gold hover:text-text no-underline whitespace-nowrap py-0.5">Admin</Link>}
            </nav>
          </div>
        </header>
          }
        >
          {children}
        </AppShell>
        <CookieNotice />
      </body>
    </html>
  );
}
