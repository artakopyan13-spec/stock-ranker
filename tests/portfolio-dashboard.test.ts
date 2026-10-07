import { describe, expect, it } from "vitest";
import example from "@/lib/portfolio/example-portfolio.json";
import { buildSkillDashboard, type SkillData } from "@/lib/portfolio/skill-dashboard";

const base = example as unknown as SkillData;

describe("skill dashboard HTML safety", () => {
  it("renders the bundled example", () => {
    const html = buildSkillDashboard(base);
    expect(html).toContain("<b>AMD goes long-term on Oct 7, 2026.</b>");
    expect(html).toContain("BRK.B $500<br>V $500");
  });

  it("escapes model text and only allows <b>, <i>, <br>", () => {
    const evil = { ...base, honest_read: `<img src=x/onerror=alert(1)> <b>ok</b> <script>x</script>`, themes: [{ label: "t", pct: 1, tone: `red);background:url(//evil)` }] };
    const html = buildSkillDashboard(evil);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;img src=x/onerror=alert(1)&gt; <b>ok</b>");
    expect(html).not.toContain("url(//evil)");
  });

  it("shows a missing judgment as not generated, not a made-up rating", () => {
    const cards = [{ ...base.cards[0], tag: "NOT GENERATED", rate: 0, missing: true, no_forecast: true, f: [0, 0, 0] as [number, number, number] }];
    const html = buildSkillDashboard({ ...base, cards });
    expect(html).toContain("Not generated — regenerate the review");
    expect(html).not.toContain("Bear $0");
  });
});
