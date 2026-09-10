/* Deadlines are plain "YYYY-MM-DD" strings (a DATE column, no time, no zone).
   Parsing one with `new Date("2026-03-01")` would read it as UTC midnight and
   shift the day backwards for anyone west of Greenwich, so every helper here
   splits the string and builds a local date instead.

   Everything a person reads out of this file is language-dependent, and almost
   none of it is worth translating by hand: month names, weekday initials and
   "5 minutes ago" are what Intl exists for. Only the handful of words Intl has
   no formatter for - Today, Tomorrow, Yesterday, just now - come from the
   dictionary. The active language is read at call time, so a switch in Settings
   re-renders the calendar in the new locale with nothing threaded through. */

import { locale, t } from "../i18n";

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
  if (state === "today") return t("date.today");

  const date = fromKey(deadline);
  const today = fromKey(todayKey());
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  if (days === 1) return t("date.tomorrow");
  if (days === -1) return t("date.yesterday");

  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString(locale(), {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** The whole date spelled out, for a cell that shows only its number. */
export function formatFullDate(key: string): string {
  return fromKey(key).toLocaleDateString(locale(), { dateStyle: "full" });
}

/** What asIso() in lib/http.ts returns for a timestamp a response did not
 *  carry. It means "unknown", not 1970, and printing it as a date would put a
 *  confident wrong answer on screen - so callers check first. */
export const UNKNOWN_TIME = new Date(0).toISOString();

export function isKnownTime(iso: string): boolean {
  return iso !== UNKNOWN_TIME;
}

/** Relative timestamp for comments.
 *
 *  Intl.RelativeTimeFormat does the wording and the plural agreement, which is
 *  the whole reason not to hand-write "5 хвилин тому": Ukrainian picks between
 *  three endings by the last digit of the number. Anything older than a week
 *  becomes a date, since "7 weeks ago" is harder to place than "6 Mar". */
export function formatWhen(iso: string): string {
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60_000);

  if (mins < 1) return t("date.justNow");

  const relative = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
  if (mins < 60) return relative.format(-mins, "minute");
  if (mins < 60 * 24) return relative.format(-Math.round(mins / 60), "hour");
  if (mins < 60 * 24 * 7) return relative.format(-Math.round(mins / (60 * 24)), "day");

  return then.toLocaleDateString(locale(), { day: "numeric", month: "short" });
}

/** Month names in the active language, January first.
 *
 *  Built from Intl rather than a table, so a new language needs no month list.
 *  The day is deliberately mid-month: some locales format the 1st differently.
 *  Ukrainian yields lower-case nominative forms ("січень"), which is correct in
 *  a sentence and wrong as a heading, hence the capitalisation. */
export function monthNames(): string[] {
  const format = new Intl.DateTimeFormat(locale(), { month: "long" });
  return Array.from({ length: 12 }, (_, month) => {
    const name = format.format(new Date(2021, month, 15));
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
}

/** Monday-first weekday initials, matching the grid below them. 2024-01-01 was
 *  a Monday, so the seven days from it are one full week in order. */
export function weekdayInitials(): string[] {
  const format = new Intl.DateTimeFormat(locale(), { weekday: "narrow" });
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(2024, 0, 1 + i)));
}

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
