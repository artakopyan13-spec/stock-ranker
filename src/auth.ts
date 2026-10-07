import { timingSafeEqual } from "node:crypto";
import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { normalizeEmail, isValidEmail, emailCodeLoginEnabled, verifyEmailCode } from "@/lib/auth/otp";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: string } & DefaultSession["user"];
  }
}

function adminEmails(): string[] {
  return env()
    .ADMIN_EMAILS.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function roleFor(email: string | null | undefined): string {
  return email && adminEmails().includes(email.toLowerCase()) ? "admin" : "user";
}

const providers = [];
const e = env();
if (e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET) {
  providers.push(Google({ clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET, allowDangerousEmailAccountLinking: true }));
}
if (e.AUTH_DEV_LOGIN) {
  // Local only: password-less sign-in so the app is testable without Google OAuth set up.
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev sign-in",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(creds) {
        const email = typeof creds?.email === "string" ? creds.email.trim().toLowerCase() : "";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
        const user = await db().user.upsert({
          where: { email },
          create: { email, name: email.split("@")[0], role: roleFor(email), emailVerified: new Date() },
          update: { role: roleFor(email) },
        });
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  );
}
if (e.ACCESS_CODE) {
  // Shared-code sign-in for production without Google: email + a secret access code you set.
  providers.push(
    Credentials({
      id: "code",
      name: "Access code",
      credentials: { email: { label: "Email", type: "email" }, code: { label: "Access code", type: "password" } },
      async authorize(creds) {
        const email = typeof creds?.email === "string" ? creds.email.trim().toLowerCase() : "";
        const code = typeof creds?.code === "string" ? creds.code : "";
        const expected = env().ACCESS_CODE ?? "";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
        const a = Buffer.from(code);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
        const user = await db().user.upsert({
          where: { email },
          create: { email, name: email.split("@")[0], role: roleFor(email), emailVerified: new Date() },
          update: { role: roleFor(email) },
        });
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  );
}

/** How often an existing session re-reads its user row (ban / admin removal). */
const SESSION_RECHECK_MS = 5 * 60 * 1000;

/** Providers that prove the person controls the email. Only these may ever grant admin. */
const VERIFIED_PROVIDERS = new Set(["google", "email-code", "code", "dev"]);

if (emailCodeLoginEnabled()) {
  // Verified passwordless sign-in: a 6-digit code emailed to the address (see lib/auth/otp.ts).
  providers.push(
    Credentials({
      id: "email-code",
      name: "Email code",
      credentials: { email: { label: "Email", type: "email" }, code: { label: "Code", type: "text" } },
      async authorize(creds) {
        const email = normalizeEmail(creds?.email);
        const code = typeof creds?.code === "string" ? creds.code.trim() : "";
        if (!(await verifyEmailCode(email, code))) return null;
        const user = await db().user.upsert({
          where: { email },
          create: { email, name: email.split("@")[0], role: roleFor(email), emailVerified: new Date() },
          update: { role: roleFor(email), emailVerified: new Date() },
        });
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  );
} else {
  // Frictionless fallback used only while no email provider is configured: email + nickname,
  // NOT verified. Because it proves nothing, it must never reach an admin account — otherwise
  // typing the admin's address grants the admin panel and every user's data. Admins sign in with
  // the access code (ACCESS_CODE) or Google; set RESEND_API_KEY to verify everyone instead.
  providers.push(
    Credentials({
      id: "profile",
      name: "Email & nickname",
      credentials: { email: { label: "Email", type: "email" }, name: { label: "Nickname", type: "text" } },
      async authorize(creds) {
        const email = normalizeEmail(creds?.email);
        if (!isValidEmail(email)) return null;
        if (roleFor(email) === "admin") return null; // admin accounts require a verified method
        const nickname = typeof creds?.name === "string" ? creds.name.trim().slice(0, 40) : "";
        const user = await db().user.upsert({
          where: { email },
          create: { email, name: nickname || email.split("@")[0], role: "user" },
          update: { ...(nickname ? { name: nickname } : {}) },
        });
        // Capture the email for the admin (deduplicated). Not marked verified — nothing was verified.
        await db()
          .emailLead.upsert({ where: { email }, create: { email }, update: { requests: { increment: 1 } } })
          .catch(() => {});
        return { id: user.id, email: user.email, name: user.name, role: "user" };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db()),
  // 14 days rather than the 30-day default, so a compromised or revoked session can't linger.
  session: { strategy: "jwt", maxAge: 14 * 24 * 3600 },
  trustHost: true,
  providers,
  pages: { signIn: "/signin" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return true;
      const existing = await db().user.findUnique({ where: { email: user.email }, select: { banned: true } });
      return !existing?.banned; // banned users cannot sign in
    },
    async jwt({ token, user, account }) {
      if (user?.email) {
        // Admin comes ONLY from a provider that verified the email. Defense in depth: the
        // unverified provider already refuses admin addresses, but the role is never derived
        // from an email string alone.
        const verified = VERIFIED_PROVIDERS.has(account?.provider ?? "");
        const role = verified ? roleFor(user.email) : "user";
        token.role = role;
        const row = await db().user.findUnique({ where: { email: user.email }, select: { id: true, role: true } });
        if (row) {
          token.uid = row.id;
          // Promote to admin on the row if configured, so the admin panel sees the role.
          if (role === "admin" && row.role !== "admin") {
            await db().user.update({ where: { id: row.id }, data: { role: "admin" } });
          }
        }
        token.checkedAt = Date.now();
        return token;
      }
      // Role and ban are otherwise frozen into the token for its whole lifetime: a banned user kept
      // working, and someone removed from ADMIN_EMAILS stayed admin. Re-check every few minutes.
      // This only ever DOWNGRADES — a refresh never escalates privileges.
      if (token.uid && Date.now() - ((token.checkedAt as number | undefined) ?? 0) > SESSION_RECHECK_MS) {
        const row = await db().user.findUnique({ where: { id: token.uid as string }, select: { banned: true, email: true } });
        if (!row || row.banned) return null; // ends the session
        if (token.role === "admin" && roleFor(row.email) !== "admin") token.role = "user";
        token.checkedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? token.sub ?? "";
        session.user.role = (token.role as string) ?? "user";
      }
      return session;
    },
  },
});

export async function currentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function isAdmin(): Promise<boolean> {
  const u = await currentUser();
  return u?.role === "admin";
}
