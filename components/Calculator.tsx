"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_PLAN, simulate, validateInputs } from "@/lib/simulate";
import type { PlanInputs, SimulationResult } from "@/lib/types";
import ProjectionChart from "./ProjectionChart";
import InsightsPanel from "./InsightsPanel";
import { usd } from "./format";

type FieldKind = "age" | "money" | "percent";

interface FieldDef {
  key: keyof PlanInputs;
  label: string;
  kind: FieldKind;
  hint?: string;
  step?: number;
}

const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "You",
    fields: [
      { key: "currentAge", label: "Current age", kind: "age" },
      { key: "retirementAge", label: "Retire at", kind: "age" },
      { key: "lifeExpectancy", label: "Plan to age", kind: "age", hint: "Planning past average life expectancy is safer." },
    ],
  },
  {
    title: "Saving",
    fields: [
      { key: "currentSavings", label: "Retirement savings today", kind: "money", step: 1000 },
      { key: "annualContribution", label: "Yearly contributions", kind: "money", step: 500, hint: "Include any employer match." },
      { key: "contributionGrowth", label: "Raise in contributions / yr", kind: "percent", step: 0.5, hint: "Above inflation." },
    ],
  },
  {
    title: "Retirement",
    fields: [
      { key: "retirementSpending", label: "Yearly spending", kind: "money", step: 1000, hint: "In today's dollars." },
      { key: "socialSecurity", label: "Social Security / pension", kind: "money", step: 1000, hint: "Yearly, today's dollars. Check ssa.gov." },
      { key: "socialSecurityAge", label: "Benefits start at", kind: "age" },
    ],
  },
  {
    title: "Markets",
    fields: [
      { key: "expectedReturn", label: "Expected return", kind: "percent", step: 0.5 },
      { key: "volatility", label: "Volatility", kind: "percent", step: 1, hint: "~15% for a stock-heavy mix, ~8% for balanced." },
      { key: "inflation", label: "Inflation", kind: "percent", step: 0.1 },
    ],
  },
];

const toDisplay = (kind: FieldKind, v: number) =>
  kind === "percent" ? +(v * 100).toFixed(2) : v;
const fromDisplay = (kind: FieldKind, v: number) => (kind === "percent" ? v / 100 : v);

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function verdict(rate: number) {
  if (rate >= 0.9) return { label: "On track", tone: "good" };
  if (rate >= 0.75) return { label: "Close", tone: "ok" };
  if (rate >= 0.5) return { label: "At risk", tone: "warn" };
  return { label: "Off track", tone: "bad" };
}

export default function Calculator() {
  const [plan, setPlan] = useState<PlanInputs>(DEFAULT_PLAN);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const settled = useDebounced(plan, 250);
  const errors = useMemo(() => validateInputs(settled), [settled]);

  const result: SimulationResult | null = useMemo(() => {
    if (errors.length) return null;
    return simulate(settled);
  }, [settled, errors]);

  function update(f: FieldDef, raw: string) {
    setDraft((d) => ({ ...d, [f.key]: raw }));
    const n = Number(raw.replace(/[,$%\s]/g, ""));
    if (raw.trim() !== "" && Number.isFinite(n)) {
      setPlan((p) => ({ ...p, [f.key]: fromDisplay(f.kind, n) }));
    }
  }

  const v = result ? verdict(result.successRate) : null;

  return (
    <div className="layout">
      <form className="card inputs" onSubmit={(e) => e.preventDefault()} aria-label="Plan inputs">
        {GROUPS.map((g) => (
          <fieldset key={g.title}>
            <legend>{g.title}</legend>
            {g.fields.map((f) => {
              const id = `f-${f.key}`;
              const shown = draft[f.key] ?? String(toDisplay(f.kind, plan[f.key]));
              return (
                <div className="field" key={f.key}>
                  <label htmlFor={id}>{f.label}</label>
                  <div className={`input-wrap kind-${f.kind}`}>
                    {f.kind === "money" && <span className="affix">$</span>}
                    <input
                      id={id}
                      inputMode="decimal"
                      value={shown}
                      onChange={(e) => update(f, e.target.value)}
                      onBlur={() => setDraft((d) => {
                        const next = { ...d };
                        delete next[f.key];
                        return next;
                      })}
                    />
                    {f.kind === "percent" && <span className="affix">%</span>}
                  </div>
                  {f.hint && <small className="hint">{f.hint}</small>}
                </div>
              );
            })}
          </fieldset>
        ))}
        <button type="button" className="btn-link" onClick={() => { setPlan(DEFAULT_PLAN); setDraft({}); }}>
          Reset to example
        </button>
      </form>

      <div className="results">
        {errors.length > 0 && (
          <div className="card error-card" role="alert">
            {errors.map((e) => <p key={e}>{e}</p>)}
          </div>
        )}

        {result && v && (
          <>
            <section className="card hero">
              <div className={`score tone-${v.tone}`}>
                <div className="score-num">{Math.round(result.successRate * 100)}<span>%</span></div>
                <div className="score-label">{v.label}</div>
              </div>
              <p className="hero-copy">
                In <b>{Math.round(result.successRate * 100)}%</b> of {result.runs.toLocaleString()} simulated markets,
                your money lasts to age {settled.lifeExpectancy}.
                {result.medianDepletionAge !== null && result.successRate < 1 && (
                  <> When it doesn&apos;t, it typically runs out around <b>{Math.round(result.medianDepletionAge)}</b>.</>
                )}
              </p>
            </section>

            <section className="stats">
              <div className="card stat">
                <span>Median at retirement</span>
                <b>{usd(result.medianAtRetirement)}</b>
              </div>
              <div className="card stat">
                <span>4% rule target</span>
                <b>{usd(result.fourPercentTarget)}</b>
                <small>
                  {result.medianAtRetirement >= result.fourPercentTarget ? "Median clears it" : `Median is ${usd(result.fourPercentTarget - result.medianAtRetirement)} short`}
                </small>
              </div>
              <div className="card stat">
                <span>To hit 85% odds</span>
                <b>
                  {result.extraContributionFor85 === null
                    ? "Out of reach"
                    : result.extraContributionFor85 === 0
                      ? "Already there"
                      : `+${usd(result.extraContributionFor85)}/yr`}
                </b>
                <small>
                  {result.retirementAgeFor85 === null
                    ? "Not reachable by retiring later alone"
                    : result.retirementAgeFor85 < settled.retirementAge
                      ? `Or retire as early as ${result.retirementAgeFor85}`
                      : result.retirementAgeFor85 === settled.retirementAge
                        ? "At your current retirement age"
                        : `Or retire at ${result.retirementAgeFor85}`}
                </small>
              </div>
            </section>

            <section className="card">
              <h2>Projected savings, today&apos;s dollars</h2>
              <ProjectionChart bands={result.bands} retirementAge={settled.retirementAge} />
            </section>
          </>
        )}

        <InsightsPanel plan={settled} disabled={!result} />
      </div>
    </div>
  );
}
