"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDuration } from "@/lib/time";

export interface DailyPoint {
  label: string;
  planned: number;
  onPlan: number;
  offPlan: number;
}

const SERIES = [
  { key: "planned", name: "Planned", color: "var(--series-planned)", stack: "plan" },
  { key: "onPlan", name: "Actual: on plan", color: "var(--series-onplan)", stack: "actual" },
  { key: "offPlan", name: "Actual: off plan", color: "var(--series-offplan)", stack: "actual" },
] as const;

/** Per day: planned hours next to actual hours (split into on-plan and off-plan). */
export function DailyChart({ data }: { data: DailyPoint[] }) {
  const hours = data.map((d) => ({ ...d, planned: d.planned / 60, onPlan: d.onPlan / 60, offPlan: d.offPlan / 60 }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={hours} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted)" }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            tickFormatter={(v: number) => `${v}h`}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "var(--grid)", opacity: 0.5 }}
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--text)" }}
            itemStyle={{ color: "var(--text)" }}
            formatter={(v) => formatDuration(Number(v) * 60)}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} iconType="circle" />
          {SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId={s.stack}
              fill={s.color}
              stroke="var(--panel)"
              strokeWidth={1}
              maxBarSize={22}
              radius={s.key === "onPlan" ? 0 : [4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
