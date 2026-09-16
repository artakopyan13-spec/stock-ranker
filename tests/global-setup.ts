import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

/** Fresh SQLite database for every test run, created from the Prisma schema. */
export default function setup(): void {
  const dir = resolve(process.cwd(), "tests/tmp");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // Brand-new empty file every run; db push creates the schema (no data can be lost).
  execSync("npx prisma db push", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_PROVIDER: "sqlite", DATABASE_URL: "file:./tests/tmp/test.db" },
  });
}
