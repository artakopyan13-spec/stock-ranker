import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { env } from "@/lib/env";

type GlobalWithPrisma = typeof globalThis & { __prisma?: PrismaClient };

function createClient(): PrismaClient {
  const e = env();
  if (e.DATABASE_PROVIDER === "postgresql") {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: e.DATABASE_URL }) });
  }
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: e.DATABASE_URL }) });
}

/** Singleton Prisma client (survives Next.js dev hot reloads). */
export function db(): PrismaClient {
  const g = globalThis as GlobalWithPrisma;
  if (!g.__prisma) g.__prisma = createClient();
  return g.__prisma;
}

/** Test hook: drop the singleton so a new DATABASE_URL takes effect. */
export async function resetDb(): Promise<void> {
  const g = globalThis as GlobalWithPrisma;
  if (g.__prisma) await g.__prisma.$disconnect();
  g.__prisma = undefined;
}
