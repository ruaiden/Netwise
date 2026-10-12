import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN, realReturn, simulate, validateInputs } from "./simulate";

describe("simulate", () => {
  it("is deterministic for the same inputs", () => {
    const a = simulate(DEFAULT_PLAN, 500);
    const b = simulate(DEFAULT_PLAN, 500);
    expect(a.successRate).toBe(b.successRate);
    expect(a.medianAtRetirement).toBe(b.medianAtRetirement);
  });

  it("returns one band per year from current age to plan-to age", () => {
    const r = simulate(DEFAULT_PLAN, 300);
    expect(r.bands[0].age).toBe(DEFAULT_PLAN.currentAge);
    expect(r.bands.at(-1)!.age).toBe(DEFAULT_PLAN.lifeExpectancy);
    for (const b of r.bands) {
      expect(b.p10).toBeLessThanOrEqual(b.p50);
      expect(b.p50).toBeLessThanOrEqual(b.p90);
    }
  });

  it("matches simple compounding when volatility is zero", () => {
    const plan = {
      ...DEFAULT_PLAN,
      currentAge: 30,
      retirementAge: 31,
      lifeExpectancy: 32,
      currentSavings: 100_000,
      annualContribution: 0,
      retirementSpending: 0,
      socialSecurity: 0,
      expectedReturn: 0.05,
      inflation: 0,
      volatility: 0,
    };
    const r = simulate(plan, 10);
    expect(r.bands[1].p50).toBeCloseTo(105_000, 6);
    expect(r.bands[2].p50).toBeCloseTo(110_250, 6);
  });

  it("succeeds every time when Social Security covers all spending", () => {
    const r = simulate({ ...DEFAULT_PLAN, currentSavings: 0, annualContribution: 0, socialSecurity: 90_000, socialSecurityAge: 65 }, 300);
    expect(r.successRate).toBe(1);
    expect(r.medianDepletionAge).toBeNull();
  });

  it("fails every time with no savings and big spending", () => {
    const r = simulate({ ...DEFAULT_PLAN, currentSavings: 0, annualContribution: 0, socialSecurity: 0 }, 300);
    expect(r.successRate).toBe(0);
    expect(r.medianDepletionAge).toBe(DEFAULT_PLAN.retirementAge);
  });

  it("more savings never lowers the success rate", () => {
    const low = simulate({ ...DEFAULT_PLAN, currentSavings: 50_000 }, 800).successRate;
    const high = simulate({ ...DEFAULT_PLAN, currentSavings: 500_000 }, 800).successRate;
    expect(high).toBeGreaterThanOrEqual(low);
  });

  it("solver contribution actually reaches roughly 85% success", () => {
    const plan = { ...DEFAULT_PLAN, annualContribution: 5_000 };
    const r = simulate(plan, 600);
    expect(r.extraContributionFor85).not.toBeNull();
    if (r.extraContributionFor85! > 0) {
      const boosted = simulate({ ...plan, annualContribution: plan.annualContribution + r.extraContributionFor85! }, 2000);
      expect(boosted.successRate).toBeGreaterThan(0.8);
    }
  });

  it("computes the 4% target off the spending gap", () => {
    const r = simulate(DEFAULT_PLAN, 100);
    expect(r.fourPercentTarget).toBe((80_000 - 30_000) / 0.04);
  });
});

describe("helpers", () => {
  it("converts nominal to real returns", () => {
    expect(realReturn(0.07, 0.025)).toBeCloseTo(0.0439, 4);
  });

  it("flags bad inputs", () => {
    expect(validateInputs({ ...DEFAULT_PLAN, retirementAge: 30 })).not.toHaveLength(0);
    expect(validateInputs(DEFAULT_PLAN)).toHaveLength(0);
  });
});
