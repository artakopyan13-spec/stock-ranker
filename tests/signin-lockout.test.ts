import { afterEach, describe, expect, it } from "vitest";
import { recordSignInFailure, signInLocked } from "@/lib/quota/ratelimit";
import { truncateAll } from "./helpers";

// The admin access code is only as strong as its brute-force protection: the admin's email isn't
// secret, so without a lockout a script could walk the whole code space.
describe("sign-in brute-force lockout", () => {
  afterEach(() => truncateAll());

  const t0 = new Date("2026-10-07T12:00:30Z"); // inside one 10-minute window
  const subjects = ["ip:203.0.113.7", "email:admin@example.test"];

  it("allows the first four failures, locks on the fifth", async () => {
    for (let i = 0; i < 4; i++) {
      expect(await signInLocked(subjects, t0)).toBe(false);
      await recordSignInFailure(subjects, t0);
    }
    expect(await signInLocked(subjects, t0)).toBe(false);
    await recordSignInFailure(subjects, t0);
    expect(await signInLocked(subjects, t0)).toBe(true);
  });

  it("locks on EITHER subject — rotating IPs against one email doesn't help", async () => {
    for (let i = 0; i < 5; i++) await recordSignInFailure([`ip:198.51.100.${i}`, "email:admin@example.test"], t0);
    expect(await signInLocked(["ip:192.0.2.99", "email:admin@example.test"], t0)).toBe(true);
    expect(await signInLocked(["ip:192.0.2.99", "email:someone-else@example.test"], t0)).toBe(false);
  });

  it("unlocks in the next window", async () => {
    for (let i = 0; i < 5; i++) await recordSignInFailure(subjects, t0);
    expect(await signInLocked(subjects, t0)).toBe(true);
    expect(await signInLocked(subjects, new Date(t0.getTime() + 10 * 60_000))).toBe(false);
  });
});
