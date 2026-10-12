import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { generateInsights } from "@/lib/insights";
import { simulate, validateInputs } from "@/lib/simulate";
import type { PlanInputs } from "@/lib/types";

export const runtime = "nodejs";

const NUMERIC_FIELDS: (keyof PlanInputs)[] = [
  "currentAge",
  "retirementAge",
  "lifeExpectancy",
  "currentSavings",
  "annualContribution",
  "contributionGrowth",
  "retirementSpending",
  "socialSecurity",
  "socialSecurityAge",
  "expectedReturn",
  "volatility",
  "inflation",
];

function parsePlan(body: unknown): PlanInputs | null {
  if (!body || typeof body !== "object") return null;
  const src = (body as { plan?: Record<string, unknown> }).plan;
  if (!src) return null;
  const plan = {} as PlanInputs;
  for (const key of NUMERIC_FIELDS) {
    const v = Number(src[key]);
    if (!Number.isFinite(v)) return null;
    plan[key] = v;
  }
  return plan;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI insights are off. Set ANTHROPIC_API_KEY in .env.local to turn them on." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const plan = parsePlan(body);
  if (!plan) return NextResponse.json({ error: "Missing or invalid plan inputs." }, { status: 400 });

  const errors = validateInputs(plan);
  if (errors.length) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });

  // Re-run the simulation server-side so the prompt always matches the inputs.
  const result = simulate(plan);

  try {
    const insights = await generateInsights(plan, result, {
      apiKey,
      model: process.env.ANTHROPIC_MODEL,
    });
    return NextResponse.json(insights);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      const status = err.status === 429 ? 429 : 502;
      const msg = err.status === 429 ? "Rate limited by the AI provider. Try again in a minute." : "The AI provider returned an error.";
      return NextResponse.json({ error: msg }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Couldn't generate insights." }, { status: 500 });
  }
}
