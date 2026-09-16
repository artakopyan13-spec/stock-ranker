import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeCompany, type CompanyRaw } from "@/lib/data/company";

const raw = JSON.parse(readFileSync(resolve(process.cwd(), "tests/fixtures/company_NVDA.json"), "utf8")) as CompanyRaw;
const data = normalizeCompany("NVDA", raw);

describe("company data normalization (real captured NVDA)", () => {
  it("builds annual and quarterly financial rows, ascending", () => {
    expect(data.annual.length).toBeGreaterThanOrEqual(4);
    expect(data.quarterly.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < data.annual.length; i++) expect(data.annual[i].period > data.annual[i - 1].period).toBe(true);
    const last = data.annual[data.annual.length - 1];
    expect(last.revenue).toBeGreaterThan(0);
    expect(last.fcf).not.toBeNull();
    expect(last.netIncome).toBeGreaterThan(0);
  });

  it("derives FCF as OCF + capex when not directly given", () => {
    for (const r of data.annual) {
      if (r.operatingCashFlow !== null && r.capex !== null && r.fcf !== null) {
        expect(Math.abs(r.fcf - (r.operatingCashFlow + r.capex))).toBeLessThan(Math.abs(r.operatingCashFlow) * 0.5 + 1e9);
      }
    }
  });

  it("computes a valuation history with plausible multiples", () => {
    expect(data.valuationHistory.length).toBeGreaterThanOrEqual(2);
    const withPe = data.valuationHistory.filter((v) => v.pe !== null);
    expect(withPe.length).toBeGreaterThan(0);
    for (const v of withPe) expect(v.pe!).toBeGreaterThan(0);
  });

  it("extracts overview, insiders and institutions", () => {
    expect(data.overview.sector).toBeTruthy();
    expect(data.overview.description).toContain("NVIDIA");
    expect(data.overview.institutions.length).toBeGreaterThan(0);
    expect(data.overview.institutions[0].organization).toBeTruthy();
    expect(data.overview.majorHolders.institutionsPctHeld).toBeGreaterThan(0);
  });
});
