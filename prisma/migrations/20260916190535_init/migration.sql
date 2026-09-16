-- CreateTable
CREATE TABLE "Ticker" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "exchange" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sector" TEXT,
    "industry" TEXT,
    "shareToken" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RawSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RawSnapshot_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "fcfVerdict" TEXT NOT NULL,
    "fcfMarginPct" REAL,
    "revenueGrowthPct" REAL,
    "forwardPE" REAL,
    "priceAtAnalysis" REAL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "usdCost" REAL NOT NULL DEFAULT 0,
    "dataAsOf" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Analysis_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "watchlistId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WatchlistItem_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WatchlistItem_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefreshRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "batchId" TEXT,
    "tickers" TEXT NOT NULL,
    "skipped" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedAt" DATETIME,
    "error" TEXT,
    "usdCost" REAL NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "CronPayload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runKey" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "previousTripwire" TEXT
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alert_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Digest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "sentAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Digest_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL,
    "usd" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Ticker_shareToken_key" ON "Ticker"("shareToken");

-- CreateIndex
CREATE INDEX "RawSnapshot_symbol_fetchedAt_idx" ON "RawSnapshot"("symbol", "fetchedAt");

-- CreateIndex
CREATE INDEX "Analysis_symbol_createdAt_idx" ON "Analysis"("symbol", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Analysis_symbol_version_key" ON "Analysis"("symbol", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_slug_key" ON "Watchlist"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_watchlistId_symbol_key" ON "WatchlistItem"("watchlistId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshRun_runKey_key" ON "RefreshRun"("runKey");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshRun_batchId_key" ON "RefreshRun"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "CronPayload_runKey_symbol_key" ON "CronPayload"("runKey", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_key_key" ON "Alert"("key");

-- CreateIndex
CREATE INDEX "Alert_symbol_createdAt_idx" ON "Alert"("symbol", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Digest_key_key" ON "Digest"("key");

-- CreateIndex
CREATE INDEX "UsageLog_createdAt_idx" ON "UsageLog"("createdAt");
