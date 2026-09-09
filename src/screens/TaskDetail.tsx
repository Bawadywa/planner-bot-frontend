import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "../api";
import type { CommentView } from "../api";
import { Sheet } from "../components/Sheet";
import { emptyDraft, TaskFields, type TaskDraft } from "../components/TaskFields";
import { CheckIcon, ChevronLeft, SendIcon, TrashIcon } from "../components/Icons";
import { confirmAction, haptic, hapticError, inTelegram } from "../telegram";
import { dueState, formatDue, formatWhen } from "../lib/date";
import { priorityOf, toPriorityCode } from "../lib/priority";
import type { ID, Task } from "../types";

interface TaskDetailProps {
  taskId: ID;
  onBack: () => void;
}

const showDone = api.isAvailable("taskDone");

export function TaskDetail({ taskId, onBack }: TaskDetailProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<CommentView[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([api.getTask(taskId), api.listComments(taskId)]);
      setTask(t);
      setComments(c);
    } catch {
      onBack();
    }
  }, [taskId, onBack]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleDone() {
    if (!task) return;
    haptic();
    setTask({ ...task, done: !task.done });
    try {
      await api.updateTask(task.id, { done: !task.done });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
      await load();
    }
  }

  async function remove() {
    const ok = await confirmAction("Delete this task and its comments?");
    if (!ok) return;
    await api.deleteTask(taskId);
    haptic("medium");
    onBack();
  }

  if (!task) return null;

  return (
    <>
      <header className="topbar">
        {!inTelegram && (
          <button className="icon-btn" aria-label="Back" onClick={onBack}>
            <ChevronLeft />
          </button>
        )}
        <h1>
          Task
          {showDone && <span className="sub">{task.done ? "Done" : "Open"}</span>}
        </h1>
        <button className="icon-btn" aria-label="Delete task" onClick={() => void remove()}>
          <TrashIcon />
        </button>
      </header>

      <div className="screen has-nav">
        {error && <div className="error">{error}</div>}

        {task.image && <img className="detail-image" src={task.image} alt="" />}

        <div className="list">
          <div className="row" style={{ alignItems: "flex-start", cursor: "default" }}>
            {showDone && (
              <button
                className="check"
                aria-pressed={task.done}
                aria-label={task.done ? "Mark as not done" : "Mark as done"}
                onClick={() => void toggleDone()}
                style={{ marginTop: 2 }}
              >
                {task.done && <CheckIcon />}
              </button>
            )}
            <div className="row-main">
              <div
                className="row-title"
                style={{
                  whiteSpace: "normal",
                  textDecoration: task.done ? "line-through" : "none",
                  color: task.done ? "var(--faint)" : "inherit",
                }}
              >
                {task.title}
              </div>
              {task.description && (
                <div className="row-sub" style={{ whiteSpace: "normal" }}>
                  {task.description}
                </div>
              )}
            </div>
          </div>

          <div className="row" style={{ cursor: "default" }}>
            <div className="row-main">
              <div className="row-sub" style={{ marginTop: 0 }}>
                Deadline
              </div>
            </div>
            <div className={`due ${task.deadline && !task.done ? dueState(task.deadline) : ""}`}>
              {task.deadline ? formatDue(task.deadline) : "None"}
            </div>
          </div>

          <div className="row" style={{ cursor: "default" }}>
            <div className="row-main">
              <div className="row-sub" style={{ marginTop: 0 }}>
                Priority
              </div>
            </div>
            <span
              className={`tag priority ${priorityOf(task.priority_code).tone}${
                priorityOf(task.priority_code).known ? "" : " unknown"
              }`}
            >
              {priorityOf(task.priority_code).label}
            </span>
          </div>
        </div>

        <button
          className="btn btn-secondary btn-block"
          style={{ marginTop: 16 }}
          onClick={() => setEditing(true)}
        >
          Edit task
        </button>

        <div className="section-head" style={{ marginTop: 24 }}>
          <h2>Comments</h2>
          <span className="count">{comments.length}</span>
        </div>

        {comments.length > 0 && (
          <div className="list">
            {comments.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                onDeleted={async () => {
                  await api.deleteComment(c.id);
                  await load();
                }}
              />
            ))}
          </div>
        )}

        <Composer taskId={taskId} onPosted={load} />
      </div>

      {editing && (
        <EditTaskSheet
          task={task}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await load();
          }}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------- */

function CommentRow({
  comment,
  onDeleted,
}: {
  comment: CommentView;
  onDeleted: () => void | Promise<void>;
}) {
  return (
    <div className="comment">
      <div className="comment-head">
        <div className="avatar" style={{ width: 24, height: 24, fontSize: "0.6875rem" }}>
          {comment.author_name.slice(0, 2)}
        </div>
        <span className="comment-author">{comment.author_name}</span>
        <span className="comment-time">{formatWhen(comment.created_at)}</span>
        <div className="spacer" />
        <button
          className="btn btn-ghost"
          style={{ color: "var(--faint)" }}
          aria-label="Delete comment"
          onClick={() => void onDeleted()}
        >
          <TrashIcon size={15} />
        </button>
      </div>
      {comment.content && <div className="comment-body">{comment.content}</div>}
      {comment.image && <img className="comment-image" src={comment.image} alt="" />}
    </div>
  );
}

/* ---------------------------------------------------------------------------- */

function Composer({ taskId, onPosted }: { taskId: ID; onPosted: () => void | Promise<void> }) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !content.trim()) return;

    setBusy(true);
    try {
      await api.createComment(taskId, content);
      setContent("");
      haptic();
      await onPosted();
    } catch {
      hapticError();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <input
        className="input"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={100}
        placeholder="Add a comment"
      />
      <button
        type="submit"
        className="btn btn-primary"
        style={{ padding: "0 14px" }}
        disabled={busy || !content.trim()}
        aria-label="Post comment"
      >
        <SendIcon />
      </button>
    </form>
  );
}

/* ---------------------------------------------------------------------------- */

function EditTaskSheet({
  task,
  onClose,
  onSaved,
}: {
  task: Task;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<TaskDraft>({
    ...emptyDraft,
    title: task.title,
    description: task.description,
    deadline: task.deadline ?? "",
    image: task.image,
    // Narrowed, not just read: a task stored before priority existed - or on a
    // code this build has no chip for - has to open on something selectable.
    priority_code: toPriorityCode(task.priority_code),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    try {
      await api.updateTask(task.id, { ...draft, deadline: draft.deadline || null });
      haptic("medium");
      await onSaved();
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : "Could not save the task.");
      setBusy(false);
    }
  }

  return (
    <Sheet title="Edit task" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}

        <TaskFields draft={draft} onChange={setDraft} />

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy || !draft.title.trim()}
        >
          Save changes
        </button>
      </form>
    </Sheet>
  );
}
