import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Analysis, ModelOutput, MODEL_OUTPUT_KEYS, bandForScore } from "@/lib/analysis/schema";
import { loadYahooFixture, sampleModelOutput } from "./helpers";

describe("ModelOutput schema", () => {
  const { data } = loadYahooFixture();

  it("accepts a well-formed output", () => {
    expect(ModelOutput.safeParse(sampleModelOutput(data)).success).toBe(true);
  });

  it("rejects bad enums and missing sections", () => {
    const bad = { ...sampleModelOutput(data), rating: { score: 8, action: "STRONG BUY", justification: "x", confidence: "high" } };
    expect(ModelOutput.safeParse(bad).success).toBe(false);
    const { thesis: _omit, ...missing } = sampleModelOutput(data);
    void _omit;
    expect(ModelOutput.safeParse(missing).success).toBe(false);
  });

  it("contains no numeric KPI fields — numbers come only from the data layer", () => {
    const numericKeys: string[] = [];
    const walk = (schema: unknown, path: string) => {
      const def = (schema as { def?: { type?: string; shape?: Record<string, unknown>; element?: unknown; innerType?: unknown } }).def;
      if (!def) return;
      if (def.type === "number") numericKeys.push(path);
      if (def.shape) for (const [k, v] of Object.entries(def.shape)) walk(v, `${path}.${k}`);
      if (def.element) walk(def.element, `${path}[]`);
      if (def.innerType) walk(def.innerType, path);
    };
    walk(ModelOutput, "");
    // Only judgment numbers are allowed: the 1–10 score and the three forecast returns.
    expect(numericKeys.sort()).toEqual([".forecast12m.base.returnPct", ".forecast12m.bear.returnPct", ".forecast12m.bull.returnPct", ".rating.score"].sort());
  });

  it("emits keys in the order the prompt specifies (used for streaming)", () => {
    expect(MODEL_OUTPUT_KEYS[0]).toBe("valuation");
    expect(MODEL_OUTPUT_KEYS.at(-1)).toBe("previousTripwire");
  });

  it("converts to a structured-output JSON schema without unsupported constraints", () => {
    const fmt = zodOutputFormat(ModelOutput) as unknown as { schema: unknown };
    const json = JSON.stringify(fmt.schema);
    expect(json).toContain('"additionalProperties":false');
    for (const kw of ['"minimum"', '"maximum"', '"minLength"', '"pattern"', '"format"']) expect(json).not.toContain(kw);
  });

  it("maps scores to rubric bands", () => {
    expect(bandForScore(10)).toBe("elite");
    expect(bandForScore(7)).toBe("strong");
    expect(bandForScore(5)).toBe("hold");
    expect(bandForScore(3)).toBe("speculative");
    expect(bandForScore(1)).toBe("avoid");
  });

  it("Analysis requires the literal isEstimate flags and disclaimer", () => {
    expect(Analysis.shape.rating.shape.isEstimate.value).toBe(true);
    expect(Analysis.shape.forecast12m.shape.isEstimate.value).toBe(true);
    expect(Analysis.shape.disclaimer).toBeDefined();
  });
});
