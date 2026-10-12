import { describe, expect, it } from "vitest";
import { buildPrompt, parseInsights } from "./insights";
import { DEFAULT_PLAN, simulate } from "./simulate";

describe("buildPrompt", () => {
  it("includes the key figures from the simulation", () => {
    const r = simulate(DEFAULT_PLAN, 300);
    const prompt = buildPrompt(DEFAULT_PLAN, r);
    expect(prompt).toContain("Retirement age: 65");
    expect(prompt).toContain("$1,250,000");
    expect(prompt).toContain(`${(r.successRate * 100).toFixed(1)}%`);
  });
});

describe("parseInsights", () => {
  it("accepts a well-formed payload and normalizes impact", () => {
    const out = parseInsights({
      headline: "You're close.",
      insights: [{ title: "A", detail: "B", impact: "huge" }],
      nextSteps: ["Do X", 42],
    });
    expect(out.insights[0].impact).toBe("medium");
    expect(out.nextSteps).toEqual(["Do X"]);
  });

  it("rejects garbage", () => {
    expect(() => parseInsights({ nope: true })).toThrow();
  });
});
