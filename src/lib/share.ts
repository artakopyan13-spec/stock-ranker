export function shareUrlFor(base: string, token: string): string {
  return `${base.replace(/\/$/, "")}/s/${token}`;
}
