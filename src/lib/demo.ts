export const DEMO_TICKERS = ["NVDA", "AAPL", "TSLA", "MSFT", "AMD"] as const;
export type DemoTicker = (typeof DEMO_TICKERS)[number];
