import ExcelJS from "exceljs";
import type { CompanyData, FinancialRow } from "@/lib/data/company";
import type { Scorecard } from "@/lib/scorecard/compute";

const HEADER_FILL = "FF1B1E3C";
const ACCENT = "FF6161FF";

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
/** full-currency value → millions, rounded to 1 dp (null stays blank). */
function toM(v: number | null | undefined): number | null {
  const n = num(v);
  return n === null ? null : Math.round((n / 1e6) * 10) / 10;
}
function marginRow(rows: FinancialRow[], n: (r: FinancialRow) => number | null, d: (r: FinancialRow) => number | null): (number | null)[] {
  return rows.map((r) => {
    const a = n(r);
    const b = d(r);
    return a !== null && b ? a / b : null;
  });
}

/** Builds a clean .xlsx financial model for a company: income statement, scorecard, projection. */
export async function buildWorkbook(data: CompanyData, scorecard: Scorecard | null): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Stock Ranker";
  wb.created = new Date();

  const annual = data.annual;
  const years = annual.map((r) => r.period.slice(0, 4));
  const cur = data.currency || "USD";

  // ---------- Income Statement ----------
  const is = wb.addWorksheet("Income Statement", { views: [{ state: "frozen", xSplit: 1, ySplit: 4 }] });
  is.mergeCells(1, 1, 1, years.length + 1);
  is.getCell(1, 1).value = `${data.symbol} — Financial Summary`;
  is.getCell(1, 1).font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  is.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  is.getRow(1).height = 26;
  is.mergeCells(2, 1, 2, years.length + 1);
  is.getCell(2, 1).value = `All figures in millions of ${cur} (margins in %). Source: ${data.source}. Generated ${new Date().toISOString().slice(0, 10)}.`;
  is.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF888888" } };

  const headerRow = is.addRow(["", ...years]); // row 3 (after merged 1,2) — but addRow appends at row 3
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
    c.alignment = { horizontal: "right" };
  });
  headerRow.getCell(1).alignment = { horizontal: "left" };

  const moneyRows: [string, (r: FinancialRow) => number | null, boolean?][] = [
    ["Revenue", (r) => r.revenue],
    ["Cost of revenue", (r) => (num(r.revenue) !== null && num(r.grossProfit) !== null ? -(r.revenue! - r.grossProfit!) : null), true],
    ["Gross profit", (r) => r.grossProfit],
    ["Operating expenses", (r) => (num(r.grossProfit) !== null && num(r.operatingIncome) !== null ? -(r.grossProfit! - r.operatingIncome!) : null), true],
    ["Operating income", (r) => r.operatingIncome],
    ["EBITDA", (r) => r.ebitda],
    ["Net income", (r) => r.netIncome],
    ["Free cash flow", (r) => r.fcf],
  ];
  for (const [label, pick, bold] of moneyRows) {
    const row = is.addRow([label, ...annual.map((r) => toM(pick(r)))]);
    row.eachCell((c, col) => {
      if (col > 1) c.numFmt = "#,##0;(#,##0)";
    });
    if (bold === undefined) row.getCell(1).font = { bold: label === "Revenue" || label === "Gross profit" || label === "Operating income" || label === "Net income" };
  }
  is.addRow([]);
  const marginDefs: [string, (r: FinancialRow) => number | null, (r: FinancialRow) => number | null][] = [
    ["Gross margin", (r) => r.grossProfit, (r) => r.revenue],
    ["Operating margin", (r) => r.operatingIncome, (r) => r.revenue],
    ["Net margin", (r) => r.netIncome, (r) => r.revenue],
    ["FCF margin", (r) => r.fcf, (r) => r.revenue],
  ];
  for (const [label, n, d] of marginDefs) {
    const vals = marginRow(annual, n, d);
    const row = is.addRow([label, ...vals]);
    row.getCell(1).font = { italic: true, color: { argb: "FF666666" } };
    row.eachCell((c, col) => {
      if (col > 1) {
        c.numFmt = "0.0%";
        c.font = { color: { argb: "FF666666" } };
      }
    });
  }
  is.getColumn(1).width = 22;
  for (let i = 2; i <= years.length + 1; i++) is.getColumn(i).width = 14;

  // ---------- Scorecard ----------
  if (scorecard) {
    const sc = wb.addWorksheet("Scorecard");
    sc.mergeCells(1, 1, 1, 4);
    sc.getCell(1, 1).value = `${data.symbol} — Quality Scorecard (${scorecard.sectorLabel})`;
    sc.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    sc.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    sc.addRow([]);
    sc.addRow(["Overall", `${scorecard.overall.grade} (${scorecard.overall.verdict})`, `${scorecard.overall.score}/${scorecard.overall.max}`, `${scorecard.overall.pct}%`]).font = { bold: true };
    sc.addRow([]);
    const hdr = sc.addRow(["Metric", "Reading", "Ideal", "Score"]);
    hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hdr.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } }));
    for (const p of scorecard.pillars) {
      const prow = sc.addRow([`${p.name}`, "", "", `${p.score}/${p.max}`]);
      prow.font = { bold: true };
      prow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF23264A" } };
      for (const m of p.metrics) sc.addRow([`  ${m.label}`, m.value, m.ideal, `${m.points}/${m.max}`]);
    }
    sc.getColumn(1).width = 26;
    sc.getColumn(2).width = 20;
    sc.getColumn(3).width = 22;
    sc.getColumn(4).width = 10;
  }

  // ---------- Projection (simple, illustrative) ----------
  const proj = wb.addWorksheet("Projection");
  proj.mergeCells(1, 1, 1, 5);
  proj.getCell(1, 1).value = `${data.symbol} — Illustrative 3-Year Projection`;
  proj.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  proj.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  const first = annual[0];
  const last = annual[annual.length - 1];
  const spanYears = Math.max(1, annual.length - 1);
  const rev0 = num(last?.revenue);
  const revFirst = num(first?.revenue);
  const cagr = rev0 !== null && revFirst !== null && revFirst > 0 ? Math.pow(rev0 / revFirst, 1 / spanYears) - 1 : 0.1;
  const gm = last && num(last.grossProfit) !== null && last.revenue ? last.grossProfit! / last.revenue : 0.5;
  const nm = last && num(last.netIncome) !== null && last.revenue ? last.netIncome! / last.revenue : 0.15;

  proj.addRow([]);
  proj.addRow(["Assumptions (from history — edit to model your own)"]).font = { bold: true };
  const a1 = proj.addRow(["Latest revenue (M)", toM(rev0)]);
  a1.getCell(2).numFmt = "#,##0";
  const a2 = proj.addRow(["Revenue growth (historical CAGR)", cagr]);
  a2.getCell(2).numFmt = "0.0%";
  const a3 = proj.addRow(["Gross margin", gm]);
  a3.getCell(2).numFmt = "0.0%";
  const a4 = proj.addRow(["Net margin", nm]);
  a4.getCell(2).numFmt = "0.0%";
  proj.addRow([]);

  const baseYear = last ? Number(last.period.slice(0, 4)) : new Date().getFullYear();
  const ph = proj.addRow(["(millions)", `${baseYear + 1}E`, `${baseYear + 2}E`, `${baseYear + 3}E`]);
  ph.font = { bold: true, color: { argb: "FFFFFFFF" } };
  ph.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } }));
  let rev = rev0 ?? 0;
  const projRevs: number[] = [];
  for (let i = 0; i < 3; i++) {
    rev = rev * (1 + cagr);
    projRevs.push(rev);
  }
  const addProj = (label: string, mult: number) => {
    const row = proj.addRow([label, ...projRevs.map((r) => Math.round((r * mult) / 1e6))]);
    row.eachCell((c, col) => {
      if (col > 1) c.numFmt = "#,##0";
    });
    if (label === "Revenue") row.getCell(1).font = { bold: true };
  };
  addProj("Revenue", 1);
  addProj("Gross profit", gm);
  addProj("Net income", nm);
  proj.addRow([]);
  proj.addRow(["Illustrative only — a simple trend extrapolation, not a forecast or financial advice."]).font = { italic: true, color: { argb: "FF888888" }, size: 9 };
  proj.getColumn(1).width = 34;
  for (let i = 2; i <= 4; i++) proj.getColumn(i).width = 14;

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
