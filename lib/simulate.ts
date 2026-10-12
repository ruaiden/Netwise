import type { PlanInputs, SimulationResult, YearBand } from "./types";

/**
 * Monte Carlo retirement simulation.
 *
 * Everything runs in real (inflation-adjusted) terms so every number the
 * user sees is in today's dollars. Annual returns are drawn from a normal
 * distribution around the real expected return.
 *
 * Year loop:
 *   - Working years: grow the balance, then add that year's contribution.
 *   - Retired years: withdraw spending (net of Social Security) at the start
 *     of the year, then grow what's left.
 * A run "succeeds" if the balance never hits zero before life expectancy.
 */

export const DEFAULT_RUNS = 2000;
const SUCCESS_TARGET = 0.85;

/** Small, fast seeded PRNG so results are reproducible for the same inputs. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalSampler(rand: () => number) {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
}

export function realReturn(nominal: number, inflation: number) {
  return (1 + nominal) / (1 + inflation) - 1;
}

export function validateInputs(p: PlanInputs): string[] {
  const errors: string[] = [];
  if (p.currentAge < 16 || p.currentAge > 100) errors.push("Current age should be between 16 and 100.");
  if (p.retirementAge <= p.currentAge) errors.push("Retirement age must be after your current age.");
  if (p.lifeExpectancy <= p.retirementAge) errors.push("Plan-to age must be after retirement age.");
  if (p.lifeExpectancy > 115) errors.push("Plan-to age should be 115 or less.");
  if (p.currentSavings < 0 || p.annualContribution < 0 || p.retirementSpending < 0 || p.socialSecurity < 0)
    errors.push("Dollar amounts can't be negative.");
  if (p.volatility < 0 || p.volatility > 0.6) errors.push("Volatility should be between 0% and 60%.");
  if (p.expectedReturn < -0.1 || p.expectedReturn > 0.2) errors.push("Expected return should be between -10% and 20%.");
  return errors;
}

interface CoreResult {
  successRate: number;
  balances: Float64Array[]; // [run][yearIndex], yearIndex 0 = currentAge
  depletionAges: number[];
}

function runCore(p: PlanInputs, runs: number, seed: number, keepBalances: boolean): CoreResult {
  const years = p.lifeExpectancy - p.currentAge;
  const mu = realReturn(p.expectedReturn, p.inflation);
  const sigma = p.volatility;
  const rand = mulberry32(seed);
  const normal = normalSampler(rand);

  let successes = 0;
  const balances: Float64Array[] = [];
  const depletionAges: number[] = [];

  for (let r = 0; r < runs; r++) {
    const path = keepBalances ? new Float64Array(years + 1) : null;
    let bal = p.currentSavings;
    let contrib = p.annualContribution;
    let depleted = false;
    if (path) path[0] = bal;

    for (let y = 0; y < years; y++) {
      const age = p.currentAge + y;
      const ret = Math.max(-0.95, mu + sigma * normal());

      if (age < p.retirementAge) {
        bal = bal * (1 + ret) + contrib;
        contrib *= 1 + p.contributionGrowth;
      } else {
        const income = age >= p.socialSecurityAge ? p.socialSecurity : 0;
        const need = Math.max(0, p.retirementSpending - income);
        bal -= need;
        if (bal <= 0) {
          bal = 0;
          if (!depleted && need > 0) {
            depleted = true;
            depletionAges.push(age);
          }
        } else {
          bal *= 1 + ret;
        }
      }
      if (path) path[y + 1] = bal;
    }

    if (!depleted) successes++;
    if (path) balances.push(path);
  }

  return { successRate: successes / runs, balances, depletionAges };
}

function percentile(sorted: Float64Array, q: number) {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function median(nums: number[]) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Stable seed derived from inputs, so the same plan always gives the same answer. */
function seedFor(p: PlanInputs) {
  const s = JSON.stringify(p);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SOLVER_RUNS = 600;

function solveExtraContribution(p: PlanInputs, seed: number): number | null {
  if (p.retirementAge <= p.currentAge) return null;
  const rate = (extra: number) =>
    runCore({ ...p, annualContribution: p.annualContribution + extra }, SOLVER_RUNS, seed, false).successRate;

  if (rate(0) >= SUCCESS_TARGET) return 0;
  let hi = Math.max(10_000, p.retirementSpending);
  const cap = 500_000;
  while (rate(hi) < SUCCESS_TARGET) {
    hi *= 2;
    if (hi > cap) return null;
  }
  let lo = 0;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (rate(mid) >= SUCCESS_TARGET) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi / 100) * 100;
}

function solveRetirementAge(p: PlanInputs, seed: number): number | null {
  const maxAge = Math.min(75, p.lifeExpectancy - 1);
  for (let age = p.currentAge + 1; age <= maxAge; age++) {
    const rate = runCore({ ...p, retirementAge: age }, SOLVER_RUNS, seed, false).successRate;
    if (rate >= SUCCESS_TARGET) return age;
  }
  return null;
}

export function simulate(p: PlanInputs, runs = DEFAULT_RUNS): SimulationResult {
  const errors = validateInputs(p);
  if (errors.length) throw new Error(errors.join(" "));

  const seed = seedFor(p);
  const core = runCore(p, runs, seed, true);
  const years = p.lifeExpectancy - p.currentAge;

  const bands: YearBand[] = [];
  const column = new Float64Array(runs);
  let medianAtRetirement = 0;

  for (let y = 0; y <= years; y++) {
    for (let r = 0; r < runs; r++) column[r] = core.balances[r][y];
    const sorted = column.slice().sort();
    const band: YearBand = {
      age: p.currentAge + y,
      p10: percentile(sorted, 0.1),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
    };
    if (band.age === p.retirementAge) medianAtRetirement = band.p50;
    bands.push(band);
  }

  const gap = Math.max(0, p.retirementSpending - p.socialSecurity);

  return {
    successRate: core.successRate,
    bands,
    medianAtRetirement,
    fourPercentTarget: gap / 0.04,
    medianDepletionAge: median(core.depletionAges),
    extraContributionFor85: solveExtraContribution(p, seed),
    retirementAgeFor85: solveRetirementAge(p, seed),
    runs,
  };
}

export const DEFAULT_PLAN: PlanInputs = {
  currentAge: 35,
  retirementAge: 65,
  lifeExpectancy: 92,
  currentSavings: 120_000,
  annualContribution: 18_000,
  contributionGrowth: 0.01,
  retirementSpending: 80_000,
  socialSecurity: 30_000,
  socialSecurityAge: 67,
  expectedReturn: 0.07,
  volatility: 0.15,
  inflation: 0.025,
};
