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
