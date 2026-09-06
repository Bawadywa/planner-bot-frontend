import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "../api";
import { Sheet } from "../components/Sheet";
import { emptyDraft, TaskFields, type TaskDraft } from "../components/TaskFields";
import { CheckIcon, ChevronLeft, PlusIcon, TrashIcon } from "../components/Icons";
import { confirmAction, haptic, hapticError, inTelegram } from "../telegram";
import { dueState, formatDue } from "../lib/date";
import type { Board as BoardType, ID, Task } from "../types";

interface BoardProps {
  boardId: ID;
  onBack: () => void;
  onOpenTask: (taskId: ID) => void;
}

export function Board({ boardId, onBack, onOpenTask }: BoardProps) {
  const [board, setBoard] = useState<BoardType | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [b, t] = await Promise.all([api.getBoard(boardId), api.listTasks(boardId)]);
      setBoard(b);
      setTasks(t);
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
      setError(err instanceof Error ? err.message : "Could not save that.");
      await load();
    }
  }

  async function removeBoard() {
    const ok = await confirmAction(
      `Delete "${board?.title}" and all of its tasks? This cannot be undone.`,
    );
    if (!ok) return;
    await api.deleteBoard(boardId);
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
          <button className="icon-btn" aria-label="Back" onClick={onBack}>
            <ChevronLeft />
          </button>
        )}
        <h1>
          {board?.title ?? "…"}
          <span className="sub">
            {tasks.length === 0
              ? "No tasks yet"
              : `${open} open · ${done} done`}
          </span>
        </h1>
        <button
          className="icon-btn"
          aria-label="Delete board"
          onClick={() => void removeBoard()}
        >
          <TrashIcon />
        </button>
        <button
          className="icon-btn"
          aria-label="New task"
          onClick={() => setCreating(true)}
        >
          <PlusIcon />
        </button>
      </header>

      <div className="screen has-nav">
        {error && <div className="error">{error}</div>}

        {tasks.length === 0 ? (
          <div className="empty">
            <div className="title">Nothing here yet</div>
            <p>Add the first task to this board.</p>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <PlusIcon />
              New task
            </button>
          </div>
        ) : (
          <div className="list">
            {tasks.map((task) => (
              <div key={task.id} className={`row task${task.done ? " done" : ""}`}>
                <button
                  className="check"
                  aria-pressed={task.done}
                  aria-label={task.done ? "Mark as not done" : "Mark as done"}
                  onClick={() => void toggleDone(task)}
                >
                  {task.done && <CheckIcon />}
                </button>

                <button
                  className="row-main"
                  style={{ background: "none", border: 0, padding: 0, textAlign: "left" }}
                  onClick={() => {
                    haptic();
                    onOpenTask(task.id);
                  }}
                >
                  <div className="row-title">{task.title}</div>
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
            ))}
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
      setError(err instanceof Error ? err.message : "Could not create the task.");
      setBusy(false);
    }
  }

  return (
    <Sheet title="New task" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}

        <TaskFields draft={draft} onChange={setDraft} autoFocus />

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy || !draft.title.trim()}
        >
          Create task
        </button>
      </form>
    </Sheet>
  );
}
