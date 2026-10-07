import { describe, expect, it } from "vitest";
import { parseActivityCsv } from "@/lib/portfolio/activity";

// Robinhood-style export (newest-first), with a $-amount and parentheses for negatives.
const CSV = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"9/15/2026","9/15/2026","9/16/2026","AAPL","Apple","Sell","5","$260.00","$1,300.00"
"6/01/2026","6/01/2026","6/02/2026","AAPL","Apple","Buy","5","$200.00","($1,000.00)"
"5/01/2026","5/01/2026","5/02/2026","NVDA","Nvidia","Buy","10","$130.00","($1,300.00)"
"4/01/2026","4/01/2026","4/02/2026","NVDA","Nvidia dividend","CDIV","","","$12.00"
"3/01/2026","3/01/2026","3/02/2026","","Gold subscription","GOLD","","","($5.00)"
"1/01/2026","1/01/2026","1/02/2026","","ACH deposit","ACH","","","$3,000.00"
"The data provided is for informational purposes only."`;

describe("brokerage activity CSV", () => {
  const r = parseActivityCsv(CSV);

  it("sums net deposits (fees excluded)", () => {
    expect(r.netDeposits).toBe(3000);
    expect(r.fees).toBe(5);
    expect(r.income).toBe(12);
  });

  it("realizes P/L on a fully closed position", () => {
    // AAPL: bought 5 @ 200 (-1000), sold 5 @ 260 (+1300) => +300 realized, position closed.
    expect(r.realized).toBe(300);
    expect(r.closed).toEqual([{ t: "AAPL", pl: 300 }]);
  });

  it("derives current holdings via FIFO with average cost", () => {
    // NVDA still held: 10 @ 130.
    expect(r.holdings).toEqual([{ symbol: "NVDA", shares: 10, avgCost: 130, valueUsd: null }]);
  });

  it("captures the export end date", () => {
    expect(r.endDate).toBe("9/15/2026");
  });
});

describe("brokerage activity CSV — ordering, fees, splits, unmatched sells", () => {
  // Oldest-first export: M/D/YYYY strings would mis-sort "10/1" before "9/30" lexically.
  const CSV2 = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"9/30/2026","9/30/2026","10/1/2026","JVA","Coffee Holding Co","Buy","10","$5.00","($50.00)"
"10/1/2026","10/1/2026","10/2/2026","JVA","Forward Split","SPL","10","",""
"10/2/2026","10/2/2026","10/3/2026","JVA","Coffee Holding Co","Sell","5","$3.00","$15.00"
"10/3/2026","10/3/2026","10/4/2026","TSLA","Tesla","Sell","2","$300.00","$600.00"`;
  const r = parseActivityCsv(CSV2);

  it("uses the latest parsed date as the end date", () => {
    expect(r.endDate).toBe("10/3/2026");
  });

  it("doesn't drop a buy whose description contains 'fee'", () => {
    expect(r.fees).toBe(0);
  });

  it("applies a split to the open lots (cost basis unchanged)", () => {
    // 10 sh @ $50 total → 20 sh; sold 5 at $15 (cost 12.5) → 15 sh left, cost 37.5.
    expect(r.holdings).toEqual([{ symbol: "JVA", shares: 15, avgCost: 2.5, valueUsd: null }]);
  });

  it("doesn't book an unmatched sell as pure gain", () => {
    expect(r.realized).toBe(2.5);
    expect(r.warnings?.some((w) => w.startsWith("TSLA"))).toBe(true);
  });
});
