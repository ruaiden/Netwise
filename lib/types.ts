export interface PlanInputs {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  /** Current invested retirement savings, in today's dollars */
  currentSavings: number;
  /** Annual contribution (you + employer), in today's dollars */
  annualContribution: number;
  /** Real annual growth of contributions (raises), e.g. 0.01 = 1% */
  contributionGrowth: number;
  /** Desired annual spending in retirement, in today's dollars */
  retirementSpending: number;
  /** Estimated annual Social Security / pension, in today's dollars */
  socialSecurity: number;
  socialSecurityAge: number;
  /** Expected nominal annual portfolio return, e.g. 0.07 */
  expectedReturn: number;
  /** Annual standard deviation of returns, e.g. 0.15 */
  volatility: number;
  /** Expected annual inflation, e.g. 0.025 */
  inflation: number;
}

export interface YearBand {
  age: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface SimulationResult {
  /** Share of runs where money lasts through life expectancy (0..1) */
  successRate: number;
  /** Percentile bands of portfolio value by age, in today's dollars */
  bands: YearBand[];
  /** Median portfolio at retirement, today's dollars */
  medianAtRetirement: number;
  /** Portfolio needed at retirement under a 4% rule for the spending gap */
  fourPercentTarget: number;
  /** Median age money runs out, among failed runs (null if none failed) */
  medianDepletionAge: number | null;
  /** Extra annual contribution needed to reach 85% success (0 if already there, null if not reachable) */
  extraContributionFor85: number | null;
  /** Retirement age needed to reach 85% success with current plan (null if not reachable by 75) */
  retirementAgeFor85: number | null;
  runs: number;
}

export interface Insight {
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
}

export interface InsightsResponse {
  headline: string;
  insights: Insight[];
  nextSteps: string[];
}
