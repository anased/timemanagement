"use client";

import { useState, useTransition } from "react";
import {
  createCategory,
  deleteCategory,
  saveCalendars,
  savePreferences,
  setCalendarSync,
  syncRecentEntries,
  updateCategory,
} from "@/app/actions/settings";
import type { ActionResult } from "@/app/actions/result";
import type { CategoryDTO } from "./types";

function useAction() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  function run(fn: () => Promise<ActionResult>, success = "Saved") {
    startTransition(async () => {
      const res = await fn();
      setMessage(res.ok ? { ok: true, text: success } : { ok: false, text: res.error });
    });
  }
  const status = message && (
    <span className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</span>
  );
  return { pending, run, status };
}

type CalendarRole = "PLAN" | "SHOW" | "OFF";

const ROLES: { value: CalendarRole; label: string; hint: string }[] = [
  { value: "PLAN", label: "Plan", hint: "Events count as your plan" },
  { value: "SHOW", label: "Show", hint: "Events are shown but don't count" },
  { value: "OFF", label: "Off", hint: "Hidden" },
];

export function CalendarsForm({
  calendars,
}: {
  calendars: { id: string; name: string; primary: boolean; color?: string; role: CalendarRole }[];
}) {
  const [roles, setRoles] = useState(() => new Map(calendars.map((c) => [c.id, c.role])));
  const { pending, run, status } = useAction();
  if (calendars.length === 0) return <p className="text-sm text-muted">No calendars found.</p>;

  function setRole(id: string, role: CalendarRole) {
    setRoles((prev) => new Map(prev).set(id, role));
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line">
        {calendars.map((c) => {
          const current = roles.get(c.id) ?? "OFF";
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color ?? "#8a8a85" }} />
              <span className={`min-w-0 flex-1 truncate ${current === "OFF" ? "text-muted" : ""}`}>
                {c.name}
                {c.primary && <span className="text-xs text-muted"> (primary)</span>}
              </span>
              <div className="flex rounded-lg border border-line p-0.5 text-xs" role="radiogroup" aria-label={`${c.name} calendar`}>
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    role="radio"
                    aria-checked={current === r.value}
                    title={r.hint}
                    className={`rounded-md px-2 py-0.5 font-medium ${current === r.value ? "bg-accent/10 text-accent" : "text-muted hover:text-fg"}`}
                    onClick={() => setRole(c.id, r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        <button
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            run(() =>
              saveCalendars(
                calendars.map((c) => ({
                  calendarId: c.id,
                  name: c.name,
                  role: roles.get(c.id) ?? "OFF",
                  color: c.color && /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : null,
                })),
              ),
            )
          }
        >
          Save calendars
        </button>
        {status}
      </div>
    </div>
  );
}

export function PreferencesForm({
  initial,
}: {
  initial: { timeZone: string; dayStart: string; dayEnd: string; minGapMin: number };
}) {
  const [values, setValues] = useState(initial);
  const { pending, run, status } = useAction();
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => savePreferences(values));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="tz">
            Time zone
          </label>
          <input id="tz" className="input" list="tz-list" value={values.timeZone} onChange={set("timeZone")} />
          <datalist id="tz-list">
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="day-start">
            Day starts
          </label>
          <input id="day-start" type="time" className="input" value={values.dayStart} onChange={set("dayStart")} />
        </div>
        <div>
          <label className="label" htmlFor="day-end">
            Day ends
          </label>
          <input id="day-end" type="time" className="input" value={values.dayEnd} onChange={set("dayEnd")} />
        </div>
        <div>
          <label className="label" htmlFor="min-gap">
            Ignore free slots shorter than (min)
          </label>
          <input id="min-gap" type="number" min={0} max={240} className="input" value={values.minGapMin} onChange={set("minGapMin")} />
        </div>
      </div>
      <p className="text-xs text-muted">
        Free slots and untracked time are counted only between the start and end of your day.
      </p>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending} type="submit">
          Save
        </button>
        {status}
      </div>
    </form>
  );
}

export function CategoriesForm({ categories }: { categories: CategoryDTO[] }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const { pending, run, status } = useAction();

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} />
        ))}
      </ul>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const res = await createCategory({ name, color });
            if (res.ok) setName("");
            return res;
          }, "Added");
        }}
      >
        <input type="color" className="h-8 w-10 rounded border border-line" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colour" />
        <input className="input max-w-xs" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" disabled={pending || !name.trim()} type="submit">
          Add
        </button>
        {status}
      </form>
    </div>
  );
}

function CategoryRow({ category }: { category: CategoryDTO }) {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const { pending, run, status } = useAction();
  const dirty = name !== category.name || color !== category.color;
  return (
    <li className="flex items-center gap-2">
      <input type="color" className="h-8 w-10 rounded border border-line" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colour" />
      <input className="input max-w-xs" value={name} onChange={(e) => setName(e.target.value)} aria-label="Category name" />
      {dirty && (
        <button className="btn" disabled={pending} onClick={() => run(() => updateCategory({ id: category.id, name, color }))}>
          Save
        </button>
      )}
      <button
        className="btn text-red-600"
        disabled={pending}
        onClick={() => {
          if (confirm(`Delete "${category.name}"? Entries keep their time but lose the category.`)) {
            run(() => deleteCategory(category.id), "Deleted");
          }
        }}
      >
        Delete
      </button>
      {status}
    </li>
  );
}

export function ActualCalendarForm({ enabled, canWrite }: { enabled: boolean; canWrite: boolean }) {
  const [on, setOn] = useState(enabled);
  const toggle = useAction();
  const backfill = useAction();
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={on}
          disabled={toggle.pending}
          onChange={(e) => {
            const value = e.target.checked;
            setOn(value);
            toggle.run(() => setCalendarSync(value));
          }}
        />
        Add finished tasks to my &ldquo;Actual time&rdquo; Google calendar
        {toggle.status}
      </label>
      {on && canWrite && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn"
            disabled={backfill.pending}
            onClick={() => backfill.run(() => syncRecentEntries(), "Adding them now. Check your calendar in a minute.")}
          >
            Add entries from the last 30 days
          </button>
          {backfill.status}
        </div>
      )}
    </div>
  );
}
