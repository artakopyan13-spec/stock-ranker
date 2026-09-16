import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    env: {
      DATABASE_PROVIDER: "sqlite",
      DATABASE_URL: "file:./tests/tmp/test.db",
      DATA_PROVIDER: "fixture",
      ANALYSIS_MODEL: "claude-opus-5",
      ANTHROPIC_API_KEY: "sk-test-fake",
      CRON_SECRET: "test-cron-secret",
      NEWS_WEB_SEARCH_FALLBACK: "false",
      MAX_ANALYSES_PER_DAY: "50",
      APP_URL: "http://test.local",
    },
    fileParallelism: false,
    coverage: { provider: "v8", include: ["src/lib/**"] },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
