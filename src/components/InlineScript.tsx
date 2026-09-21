/**
 * Renders an inline <script> that executes on hard navigations (the server emits
 * `type="text/javascript"`) but is inert on the client (`type="text/plain"`), which
 * avoids React's dev-only "script tag while rendering" warning. `suppressHydrationWarning`
 * absorbs the type-attribute mismatch between server and client.
 *
 * Pattern from node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
 * Used for the pre-hydration theme init so there's no flash of the wrong theme.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
