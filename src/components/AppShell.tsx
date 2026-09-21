"use client";

import { usePathname } from "next/navigation";

/**
 * Chrome switcher. On the marketing landing (signed-out `/`) the page renders full-bleed with
 * its own header/footer; everywhere else it gets the app header, constrained main and footer.
 */
export function AppShell({ authed, demo, header, footer, children }: { authed: boolean; demo: boolean; header: React.ReactNode; footer: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const bareLanding = path === "/" && !authed && !demo;
  if (bareLanding) return <>{children}</>;
  return (
    <>
      {header}
      <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">{children}</main>
      {footer}
    </>
  );
}
