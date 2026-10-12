import Anthropic from "@anthropic-ai/sdk";
import type { InsightsResponse, PlanInputs, SimulationResult } from "./types";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

const SYSTEM_PROMPT = `You are a retirement planning analyst inside a calculator app called NetWise.
You receive a user's plan inputs and the results of a Monte Carlo simulation that the app already ran.
Your job is to turn those numbers into a short, specific read on where the user stands and what would move the needle.

Rules:
- Every number the app gives you is in today's (inflation-adjusted) dollars. Say so when it matters.
- Use the actual figures provided. Do not invent numbers or rerun the math yourself; only combine provided figures with simple arithmetic.
- Be direct and concrete. Plain English, no jargon, no corporate buzzwords, no hype, no em-dashes.
- Rank insights by how much they'd change the outcome. Point out the biggest lever first.
- Flag assumptions that look aggressive or risky (e.g. high expected returns, retiring before Social Security starts, a long plan-to age with thin savings).
- If the plan is already strong, say that plainly and focus on risks and optional upside, not invented problems.
- This is educational, not personalized financial advice. Don't recommend specific securities or products.
Return your answer by calling the report_insights tool.`;

const INSIGHTS_TOOL: Anthropic.Tool = {
  name: "report_insights",
  description: "Return the personalized retirement insights for this plan.",
  input_schema: {
    type: "object",
    properties: {
      headline: {
        type: "string",
        description: "One sentence verdict on the plan, max 25 words.",
      },
      insights: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short label, max 8 words." },
            detail: { type: "string", description: "2-3 sentences with the specific numbers behind it." },
            impact: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["title", "detail", "impact"],
        },
      },
      nextSteps: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: { type: "string", description: "A concrete action, one sentence." },
      },
    },
    required: ["headline", "insights", "nextSteps"],
  },
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function buildPrompt(p: PlanInputs, r: SimulationResult): string {
  const at = (age: number) => r.bands.find((b) => b.age === age);
  const milestones = [p.retirementAge, Math.min(p.retirementAge + 10, p.lifeExpectancy), p.lifeExpectancy]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((age) => {
      const b = at(age);
      return b
        ? `- Age ${age}: pessimistic (10th pct) ${usd(b.p10)}, median ${usd(b.p50)}, optimistic (90th pct) ${usd(b.p90)}`
        : "";
    })
    .join("\n");

  return `PLAN INPUTS
- Current age: ${p.currentAge}
- Retirement age: ${p.retirementAge}
- Plan-to age (life expectancy): ${p.lifeExpectancy}
- Current retirement savings: ${usd(p.currentSavings)}
- Annual contribution (incl. employer): ${usd(p.annualContribution)}, growing ${pct(p.contributionGrowth)}/yr above inflation
- Desired retirement spending: ${usd(p.retirementSpending)}/yr
- Social Security / pension: ${usd(p.socialSecurity)}/yr starting at age ${p.socialSecurityAge}
- Expected nominal return: ${pct(p.expectedReturn)}, volatility ${pct(p.volatility)}, inflation ${pct(p.inflation)}

SIMULATION RESULTS (${r.runs.toLocaleString()} Monte Carlo runs, today's dollars)
- Probability money lasts to age ${p.lifeExpectancy}: ${pct(r.successRate)}
- Median portfolio at retirement: ${usd(r.medianAtRetirement)}
- 4% rule target for the spending gap after Social Security: ${usd(r.fourPercentTarget)}
- Median age money runs out in failed runs: ${r.medianDepletionAge ?? "n/a (no failures)"}
- Extra annual contribution needed for 85% success: ${
    r.extraContributionFor85 === null ? "not reachable with contributions alone" : usd(r.extraContributionFor85)
  }
- Earliest retirement age with 85% success (current savings plan): ${r.retirementAgeFor85 ?? "not reachable by 75"}

PORTFOLIO MILESTONES
${milestones}

Give this user their personalized read.`;
}

export async function generateInsights(
  p: PlanInputs,
  r: SimulationResult,
  opts: { apiKey: string; model?: string }
): Promise<InsightsResponse> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  const message = await client.messages.create({
    model: opts.model || DEFAULT_MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    tools: [INSIGHTS_TOOL],
    tool_choice: { type: "tool", name: INSIGHTS_TOOL.name },
    messages: [{ role: "user", content: buildPrompt(p, r) }],
  });

  const block = message.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Claude did not return structured insights.");
  }
  return parseInsights(block.input);
}

export function parseInsights(raw: unknown): InsightsResponse {
  const o = raw as Partial<InsightsResponse>;
  if (!o || typeof o.headline !== "string" || !Array.isArray(o.insights) || !Array.isArray(o.nextSteps)) {
    throw new Error("Insights response was malformed.");
  }
  return {
    headline: o.headline,
    insights: o.insights
      .filter((i) => i && typeof i.title === "string" && typeof i.detail === "string")
      .map((i) => ({
        title: i.title,
        detail: i.detail,
        impact: i.impact === "high" || i.impact === "low" ? i.impact : "medium",
      })),
    nextSteps: o.nextSteps.filter((s): s is string => typeof s === "string"),
  };
}
