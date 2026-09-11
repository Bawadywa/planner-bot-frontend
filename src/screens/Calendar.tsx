import { useEffect, useMemo, useState } from "react";
import * as api from "../api";
import { ChevronLeft, ChevronRight } from "../components/Icons";
import { WorkspacePicker } from "../components/WorkspacePicker";
import { haptic } from "../telegram";
import { useActiveWorkspace } from "../lib/workspace";
import { heaviestTone, priorityOf } from "../lib/priority";
import {
  formatDue,
  formatFullDate,
  fromKey,
  monthGrid,
  monthNames,
  todayKey,
  weekdayInitials,
} from "../lib/date";
import { useT } from "../i18n";
import type { Board, ID, Task } from "../types";

interface CalendarProps {
  onOpenTask: (taskId: ID) => void;
}

/** Deadlines across every board the user can see, on a month grid. A day with
 *  open work gets a dot; a day with something overdue gets a red one. */
export function Calendar({ onOpenTask }: CalendarProps) {
  const t = useT();
  /* The month grid is every board's deadlines, so it narrows with the picker
     the same way the board list does. Only a dependency - the scoping itself
     happens in api.listAllTasks(), which walks the scoped board list. */
  const workspace = useActiveWorkspace();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selected, setSelected] = useState(todayKey());

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useEffect(() => {
    void (async () => {
      try {
        const [taskRows, boardRows] = await Promise.all([
          api.listAllTasks(),
          api.listBoards(),
        ]);
        setTasks(taskRows);
        setBoards(boardRows);
      } catch (err) {
        // Both reads go through the board list, which is a network call in api
        // mode. The month grid renders either way; this only keeps the failure
        // from surfacing as an unhandled rejection.
        console.warn("[planner] calendar could not load", err);
      }
    })();
  }, [workspace]);

  const boardTitle = useMemo(
    () => new Map(boards.map((b) => [b.id, b.title])),
    [boards],
  );

  // day key -> tasks due that day
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.deadline) continue;
      const list = map.get(task.deadline);
      if (list) list.push(task);
      else map.set(task.deadline, [task]);
    }
    return map;
  }, [tasks]);

  const cells = useMemo(
    () => monthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  /* Rebuilt when the language changes, not only when the month does - `t` is a
     stable function whose identity does not move, so the active language is
     what has to be in the dependency list. Both come out of Intl rather than a
     table; see lib/date.ts. */
  const months = useMemo(() => monthNames(), [t]);
  const weekdays = useMemo(() => weekdayInitials(), [t]);

  const today = todayKey();
  const selectedTasks = byDay.get(selected) ?? [];

  function shiftMonth(by: number) {
    haptic();
    const d = new Date(cursor.year, cursor.month + by, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  }

  return (
    <>
      <header className="topbar with-picker">
        <h1 className="sr-only">{t("calendar.title")}</h1>
        <WorkspacePicker />
        <button
          className="btn btn-ghost topbar-action"
          onClick={() => {
            const now = new Date();
            setCursor({ year: now.getFullYear(), month: now.getMonth() });
            setSelected(today);
          }}
        >
          {t("calendar.today")}
        </button>
      </header>

      <div className="screen has-nav">
        <div className="cal-head">
          <button
            className="icon-btn"
            aria-label={t("calendar.prevMonth")}
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft />
          </button>
          <span className="month">
            {months[cursor.month]} {cursor.year}
          </span>
          <button
            className="icon-btn"
            aria-label={t("calendar.nextMonth")}
            onClick={() => shiftMonth(1)}
          >
            <ChevronRight />
          </button>
        </div>

        <div className="cal-grid">
          {weekdays.map((day, i) => (
            <div key={i} className="cal-dow">
              {day}
            </div>
          ))}

          {cells.map((cell) => {
            const dayTasks = byDay.get(cell.key) ?? [];
            const open = dayTasks.filter((task) => !task.done);

            /* What the cell paints itself. Overdue beats priority - a deadline
               already missed is more urgent than any label on a task that is
               still ahead - and a day with nothing open stays blank. */
            const load =
              open.length === 0
                ? ""
                : cell.key < today
                  ? "load-overdue"
                  : `load-${heaviestTone(open.map((task) => task.priority_code))}`;

            return (
              <button
                key={cell.key}
                className={[
                  "cal-day",
                  cell.inMonth ? "" : "pad",
                  cell.key === today ? "today" : "",
                  load,
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={cell.key === selected}
                /* The tint is the whole signal for a sighted user, so the count
                   has to be spoken - a date alone would say nothing about why
                   this cell looks different from its neighbours. */
                aria-label={
                  open.length === 0
                    ? formatFullDate(cell.key)
                    : `${formatFullDate(cell.key)}, ${t("boards.open", { count: open.length })}`
                }
                onClick={() => {
                  haptic();
                  setSelected(cell.key);
                }}
              >
                <span className="num">{fromKey(cell.key).getDate()}</span>
              </button>
            );
          })}
        </div>

        <div className="section-head" style={{ marginTop: 22 }}>
          <h2>{selected === today ? t("calendar.today") : formatDue(selected)}</h2>
          <span className="count">{selectedTasks.length}</span>
        </div>

        {selectedTasks.length === 0 ? (
          <div className="empty" style={{ padding: "28px 24px" }}>
            <p style={{ margin: 0 }}>{t("calendar.nothingDue")}</p>
          </div>
        ) : (
          <div className="list">
            {selectedTasks.map((task) => (
              <button
                key={task.id}
                className={`row task${task.done ? " done" : ""}`}
                onClick={() => {
                  haptic();
                  onOpenTask(task.id);
                }}
              >
                <div className="row-main">
                  <div className="row-title">
                    {task.title}
                    {!task.done && (
                      <span
                        className={`tag priority ${priorityOf(task.priority_code).tone}${
                          priorityOf(task.priority_code).known ? "" : " unknown"
                        }`}
                        style={{ marginLeft: 6 }}
                      >
                        {priorityOf(task.priority_code).label}
                      </span>
                    )}
                  </div>
                  <div className="row-sub">
                    {boardTitle.get(task.board_id) ?? t("calendar.noBoard")}
                  </div>
                </div>
                <ChevronRight />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
