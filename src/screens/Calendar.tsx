import { useEffect, useMemo, useState } from "react";
import * as api from "../api";
import { ChevronLeft, ChevronRight } from "../components/Icons";
import { haptic } from "../telegram";
import { DOW, MONTHS, formatDue, fromKey, monthGrid, todayKey } from "../lib/date";
import type { Board, ID, Task } from "../types";

interface CalendarProps {
  onOpenTask: (taskId: ID) => void;
}

/** Deadlines across every board the user can see, on a month grid. A day with
 *  open work gets a dot; a day with something overdue gets a red one. */
export function Calendar({ onOpenTask }: CalendarProps) {
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
        const [t, b] = await Promise.all([api.listAllTasks(), api.listBoards()]);
        setTasks(t);
        setBoards(b);
      } catch (err) {
        // Both reads go through the board list, which is a network call in api
        // mode. The month grid renders either way; this only keeps the failure
        // from surfacing as an unhandled rejection.
        console.warn("[planner] calendar could not load", err);
      }
    })();
  }, []);

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

  const today = todayKey();
  const selectedTasks = byDay.get(selected) ?? [];

  function shiftMonth(by: number) {
    haptic();
    const d = new Date(cursor.year, cursor.month + by, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  }

  return (
    <>
      <header className="topbar">
        <h1>Calendar</h1>
        <button
          className="btn btn-ghost"
          onClick={() => {
            const now = new Date();
            setCursor({ year: now.getFullYear(), month: now.getMonth() });
            setSelected(today);
          }}
        >
          Today
        </button>
      </header>

      <div className="screen has-nav">
        <div className="cal-head">
          <button className="icon-btn" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
            <ChevronLeft />
          </button>
          <span className="month">
            {MONTHS[cursor.month]} {cursor.year}
          </span>
          <button className="icon-btn" aria-label="Next month" onClick={() => shiftMonth(1)}>
            <ChevronRight />
          </button>
        </div>

        <div className="cal-grid">
          {DOW.map((d, i) => (
            <div key={i} className="cal-dow">
              {d}
            </div>
          ))}

          {cells.map((cell) => {
            const dayTasks = byDay.get(cell.key) ?? [];
            const open = dayTasks.filter((t) => !t.done);
            const overdue = open.length > 0 && cell.key < today;

            return (
              <button
                key={cell.key}
                className={[
                  "cal-day",
                  cell.inMonth ? "" : "pad",
                  cell.key === today ? "today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={cell.key === selected}
                aria-label={fromKey(cell.key).toDateString()}
                onClick={() => {
                  haptic();
                  setSelected(cell.key);
                }}
              >
                <span className="num">{fromKey(cell.key).getDate()}</span>
                {open.length > 0 && <span className={`dot${overdue ? " overdue" : ""}`} />}
              </button>
            );
          })}
        </div>

        <div className="section-head" style={{ marginTop: 22 }}>
          <h2>{selected === today ? "Today" : formatDue(selected)}</h2>
          <span className="count">{selectedTasks.length}</span>
        </div>

        {selectedTasks.length === 0 ? (
          <div className="empty" style={{ padding: "28px 24px" }}>
            <p style={{ margin: 0 }}>Nothing due on this day.</p>
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
                  <div className="row-title">{task.title}</div>
                  <div className="row-sub">{boardTitle.get(task.board_id) ?? "—"}</div>
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
