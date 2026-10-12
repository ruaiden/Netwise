"use client";

import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { YearBand } from "@/lib/types";
import { compactUsd, usd } from "./format";

interface Props {
  bands: YearBand[];
  retirementAge: number;
}

interface Row {
  age: number;
  outer: [number, number];
  inner: [number, number];
  median: number;
  raw: YearBand;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload.raw;
  return (
    <div className="chart-tip">
      <div className="chart-tip-age">Age {b.age}</div>
      <div><span>Strong markets</span><b>{usd(b.p90)}</b></div>
      <div className="chart-tip-median"><span>Median</span><b>{usd(b.p50)}</b></div>
      <div><span>Weak markets</span><b>{usd(b.p10)}</b></div>
    </div>
  );
}

export default function ProjectionChart({ bands, retirementAge }: Props) {
  const data: Row[] = bands.map((b) => ({
    age: b.age,
    outer: [b.p10, b.p90],
    inner: [b.p25, b.p75],
    median: b.p50,
    raw: b,
  }));

  return (
    <div className="chart-wrap" role="img" aria-label="Projected portfolio value by age, showing a range of market outcomes">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="age"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--line)" }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickFormatter={compactUsd}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--line-strong)" }} />
          <Area dataKey="outer" stroke="none" fill="var(--band-outer)" isAnimationActive={false} />
          <Area dataKey="inner" stroke="none" fill="var(--band-inner)" isAnimationActive={false} />
          <Line dataKey="median" stroke="var(--accent)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <ReferenceLine
            x={retirementAge}
            stroke="var(--line-strong)"
            strokeDasharray="4 4"
            label={{ value: "Retire", position: "insideTopRight", fill: "var(--muted)", fontSize: 12 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="legend">
        <span><i className="sw sw-line" /> Median</span>
        <span><i className="sw sw-inner" /> Middle 50% of outcomes</span>
        <span><i className="sw sw-outer" /> 80% of outcomes</span>
      </div>
    </div>
  );
}
