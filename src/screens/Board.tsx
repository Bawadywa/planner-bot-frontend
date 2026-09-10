import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "../api";
import { Sheet } from "../components/Sheet";
import { emptyDraft, TaskFields, type TaskDraft } from "../components/TaskFields";
import { CheckIcon, ChevronLeft, PlusIcon, TrashIcon } from "../components/Icons";
import { confirmAction, haptic, hapticError, inTelegram } from "../telegram";
import { dueState, formatDue } from "../lib/date";
import { priorityOf } from "../lib/priority";
import { useT } from "../i18n";
import type { Board as BoardType, ID, Task } from "../types";

interface BoardProps {
  boardId: ID;
  onBack: () => void;
  onOpenTask: (taskId: ID) => void;
}

const showTasks = api.isAvailable("tasks");
const showDone = api.isAvailable("taskDone");

export function Board({ boardId, onBack, onOpenTask }: BoardProps) {
  const t = useT();
  const [board, setBoard] = useState<BoardType | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [boardRow, taskRows] = await Promise.all([
        api.getBoard(boardId),
        showTasks ? api.listTasks(boardId) : Promise.resolve([]),
      ]);
      setBoard(boardRow);
      setTasks(taskRows);
    } catch {
      // The board was deleted from another screen - there is nothing to show.
      onBack();
    }
  }, [boardId, onBack]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleDone(task: Task) {
    haptic();
    // Optimistic: flip locally first so the tap feels instant, then persist and
    // re-sort from the source of truth.
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)),
    );
    try {
      await api.updateTask(task.id, { done: !task.done });
      setTasks(await api.listTasks(boardId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("board.saveFailed"));
      await load();
    }
  }

  async function removeBoard() {
    const ok = await confirmAction(
      t("board.confirmDelete", { title: board?.title ?? "" }),
    );
    if (!ok) return;
    try {
      await api.deleteBoard(boardId);
    } catch (err) {
      // The board is still there, and leaving the screen would say otherwise.
      hapticError();
      setError(err instanceof Error ? err.message : t("board.deleteFailed"));
      return;
    }
    haptic("medium");
    onBack();
  }

  const open = tasks.filter((t) => !t.done).length;
  const done = tasks.length - open;

  return (
    <>
      <header className="topbar">
        {/* Telegram draws its own back arrow; a second one would be noise. */}
        {!inTelegram && (
          <button className="icon-btn" aria-label={t("common.back")} onClick={onBack}>
            <ChevronLeft />
          </button>
        )}
        <h1>
          {board?.title ?? "…"}
          {showTasks && (
            <span className="sub">
              {tasks.length === 0
                ? t("board.noTasks")
                : showDone
                  ? t("board.openDone", { open, done })
                  : t("board.taskCount", { count: tasks.length })}
            </span>
          )}
        </h1>
        <button
          className="icon-btn"
          aria-label={t("board.deleteAria")}
          onClick={() => void removeBoard()}
        >
          <TrashIcon />
        </button>
        {showTasks && (
          <button
            className="icon-btn"
            aria-label={t("board.newTaskAria")}
            onClick={() => setCreating(true)}
          >
            <PlusIcon />
          </button>
        )}
      </header>

      <div className="screen has-nav">
        {error && <div className="error">{error}</div>}

        {!showTasks ? (
          <div className="empty">
            <div className="title">{t("board.hidden.title")}</div>
            <p>{t("board.hidden.body")}</p>
            <p className="hint" style={{ marginTop: 10 }}>
              {api.missingFor("tasks")}
            </p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="empty">
            <div className="title">{t("board.empty.title")}</div>
            <p>{t("board.empty.body")}</p>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <PlusIcon />
              {t("board.newTaskAria")}
            </button>
          </div>
        ) : (
          <div className="list">
            {tasks.map((task) => {
              const priority = priorityOf(task.priority_code);
              return (
              <div key={task.id} className={`row task${task.done ? " done" : ""}`}>
                {showDone && (
                  <button
                    className="check"
                    aria-pressed={task.done}
                    aria-label={task.done ? t("board.markNotDone") : t("board.markDone")}
                    onClick={() => void toggleDone(task)}
                  >
                    {task.done && <CheckIcon />}
                  </button>
                )}

                <button
                  className="row-main"
                  style={{ background: "none", border: 0, padding: 0, textAlign: "left" }}
                  onClick={() => {
                    haptic();
                    onOpenTask(task.id);
                  }}
                >
                  <div className="row-title">
                    {task.title}
                    {/* All three levels are marked, and the colour carries the
                        ranking - see the .tag.priority rules in styles.css.
                        Keyed on tone, not the code, so a renumbering on the
                        backend cannot invert it.

                        Not on a finished task: its priority is history, and a
                        red badge on a struck-through row reads as something
                        still needing attention. */}
                    {!task.done && (
                      <span
                        className={`tag priority ${priority.tone}${
                          priority.known ? "" : " unknown"
                        }`}
                        style={{ marginLeft: 6 }}
                      >
                        {priority.label}
                      </span>
                    )}
                  </div>
                  {(task.description || task.deadline) && (
                    <div className="row-sub">
                      {task.deadline && (
                        <span className={`due ${task.done ? "" : dueState(task.deadline)}`}>
                          {formatDue(task.deadline)}
                        </span>
                      )}
                      {task.deadline && task.description && " · "}
                      {task.description}
                    </div>
                  )}
                </button>

                {task.image && <img className="thumb" src={task.image} alt="" />}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {creating && (
        <CreateTaskSheet
          boardId={boardId}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------- */

interface CreateTaskSheetProps {
  boardId: ID;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

function CreateTaskSheet({ boardId, onClose, onCreated }: CreateTaskSheetProps) {
  const t = useT();
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    try {
      await api.createTask(boardId, { ...draft, deadline: draft.deadline || null });
      haptic("medium");
      await onCreated();
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : t("board.sheet.failed"));
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("board.sheet.title")} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}

        <TaskFields draft={draft} onChange={setDraft} autoFocus />

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy || !draft.title.trim()}
        >
          {t("board.sheet.submit")}
        </button>
      </form>
    </Sheet>
  );
}
