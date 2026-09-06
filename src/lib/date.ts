/* Deadlines are plain "YYYY-MM-DD" strings (a DATE column, no time, no zone).
   Parsing one with `new Date("2026-03-01")` would read it as UTC midnight and
   shift the day backwards for anyone west of Greenwich, so every helper here
   splits the string and builds a local date instead. */

export function todayKey(): string {
  return toKey(new Date());
}

export function toKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export type DueState = "none" | "overdue" | "today" | "soon" | "later";

export function dueState(deadline: string | null): DueState {
  if (!deadline) return "none";
  const today = todayKey();
  if (deadline < today) return "overdue";
  if (deadline === today) return "today";

  const days = Math.round(
    (fromKey(deadline).getTime() - fromKey(today).getTime()) / 86_400_000,
  );
  return days <= 7 ? "soon" : "later";
}

/** Short, human deadline label: "Today", "Tomorrow", "Fri 6", "6 Mar 2027". */
export function formatDue(deadline: string | null): string {
  if (!deadline) return "";

  const state = dueState(deadline);
  if (state === "today") return "Today";

  const date = fromKey(deadline);
  const today = fromKey(todayKey());
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";

  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Relative timestamp for comments. */
export function formatWhen(iso: string): string {
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60_000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  if (mins < 60 * 24 * 7) return `${Math.round(mins / (60 * 24))}d ago`;

  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Monday-first weekday initials, matching the grid below them. */
export const DOW = ["M", "T", "W", "T", "F", "S", "S"];

/** Every cell of a month grid, padded to whole weeks with the neighbouring
 *  months' days so the calendar is always a clean rectangle. */
export function monthGrid(year: number, month: number): Array<{ key: string; inMonth: boolean }> {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-first; shift so Monday is 0.
  const lead = (first.getDay() + 6) % 7;

  const cells: Array<{ key: string; inMonth: boolean }> = [];
  const start = new Date(year, month, 1 - lead);

  // Six rows covers every possible month layout.
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ key: toKey(d), inMonth: d.getMonth() === month });
  }

  // Drop a trailing all-padding week rather than always drawing six rows.
  while (cells.length > 35 && !cells.slice(35).some((c) => c.inMonth)) {
    cells.length = 35;
  }

  return cells;
}
