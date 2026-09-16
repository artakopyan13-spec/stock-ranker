// Generates prisma/schema.prisma from prisma/schema.template.prisma using DATABASE_PROVIDER.
// Prisma does not allow env() in the provider field, so the swap happens here.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envFile = resolve(root, ".env");
if (!process.env.DATABASE_PROVIDER && existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*DATABASE_PROVIDER\s*=\s*"?([a-z]+)"?\s*$/);
    if (m) process.env.DATABASE_PROVIDER = m[1];
  }
}
const provider = process.env.DATABASE_PROVIDER ?? "sqlite";
if (!["sqlite", "postgresql"].includes(provider)) {
  console.error(`DATABASE_PROVIDER must be sqlite or postgresql, got "${provider}"`);
  process.exit(1);
}
const template = readFileSync(resolve(root, "prisma/schema.template.prisma"), "utf8");
const out = template.replace("__PROVIDER__", provider);
const target = resolve(root, "prisma/schema.prisma");
const current = existsSync(target) ? readFileSync(target, "utf8") : "";
if (current !== out) {
  writeFileSync(target, out);
  console.log(`prisma/schema.prisma written for provider=${provider}`);
} else {
  console.log(`prisma/schema.prisma already up to date (provider=${provider})`);
}
