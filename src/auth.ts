import { timingSafeEqual } from "node:crypto";
import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { normalizeEmail, isValidEmail } from "@/lib/auth/otp";

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

{
  // The one sign-in method: email + a nickname, no verification. Captures the email
  // for the admin and creates/updates the user, then onboarding collects the answers.
  providers.push(
    Credentials({
      id: "profile",
      name: "Email & nickname",
      credentials: { email: { label: "Email", type: "email" }, name: { label: "Nickname", type: "text" } },
      async authorize(creds) {
        const email = normalizeEmail(creds?.email);
        if (!isValidEmail(email)) return null;
        const nickname = typeof creds?.name === "string" ? creds.name.trim().slice(0, 40) : "";
        const user = await db().user.upsert({
          where: { email },
          create: { email, name: nickname || email.split("@")[0], role: roleFor(email), emailVerified: new Date() },
          update: { role: roleFor(email), ...(nickname ? { name: nickname } : {}) },
        });
        // Capture the email for the admin (deduplicated), marked as signed-in.
        await db()
          .emailLead.upsert({ where: { email }, create: { email, verifiedAt: new Date() }, update: { verifiedAt: new Date(), requests: { increment: 1 } } })
          .catch(() => {});
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db()),
  session: { strategy: "jwt" },
  trustHost: true,
  providers,
  pages: { signIn: "/signin" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return true;
      const existing = await db().user.findUnique({ where: { email: user.email }, select: { banned: true } });
      return !existing?.banned; // banned users cannot sign in
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.role = roleFor(user.email);
        const row = await db().user.findUnique({ where: { email: user.email }, select: { id: true, role: true } });
        if (row) {
          token.uid = row.id;
          // Promote to admin on the row if configured, so the admin panel sees the role.
          if (roleFor(user.email) === "admin" && row.role !== "admin") {
            await db().user.update({ where: { id: row.id }, data: { role: "admin" } });
          }
          token.role = roleFor(user.email);
        }
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
