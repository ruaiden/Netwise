"use client";

import { useEffect, useState } from "react";
import type { InsightsResponse, PlanInputs } from "@/lib/types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: InsightsResponse; forPlan: string }
  | { status: "error"; message: string };

export default function InsightsPanel({ plan, disabled }: { plan: PlanInputs; disabled: boolean }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const planKey = JSON.stringify(plan);
  const stale = state.status === "done" && state.forPlan !== planKey;

  useEffect(() => {
    if (state.status === "error") setState({ status: "idle" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  async function run() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      setState({ status: "done", data: body as InsightsResponse, forPlan: planKey });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Something went wrong." });
    }
  }

  return (
    <section className="card insights" aria-live="polite">
      <div className="insights-head">
        <div>
          <h2>Your AI read</h2>
          <p className="muted">Claude looks at your numbers and tells you what actually moves the needle.</p>
        </div>
        <button className="btn" onClick={run} disabled={disabled || state.status === "loading"}>
          {state.status === "loading" ? "Thinking…" : state.status === "done" ? "Refresh" : "Get insights"}
        </button>
      </div>

      {state.status === "loading" && (
        <div className="skeleton" aria-hidden>
          <div /><div /><div />
        </div>
      )}

      {state.status === "error" && <p className="error">{state.message}</p>}

      {state.status === "done" && (
        <div className={stale ? "insights-body stale" : "insights-body"}>
          {stale && <p className="stale-note">Your inputs changed. Hit Refresh for an updated read.</p>}
          <p className="headline">{state.data.headline}</p>
          <ul className="insight-list">
            {state.data.insights.map((i, idx) => (
              <li key={idx}>
                <span className={`pill pill-${i.impact}`}>{i.impact}</span>
                <div>
                  <h3>{i.title}</h3>
                  <p>{i.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          {state.data.nextSteps.length > 0 && (
            <>
              <h3 className="next-title">Next steps</h3>
              <ol className="next-steps">
                {state.data.nextSteps.map((s, idx) => <li key={idx}>{s}</li>)}
              </ol>
            </>
          )}
        </div>
      )}
    </section>
  );
}
