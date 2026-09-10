import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import * as api from "../api";
import type { CommentView } from "../api";
import { Sheet } from "../components/Sheet";
import { emptyDraft, TaskFields, type TaskDraft } from "../components/TaskFields";
import { ImagePicker } from "../components/ImagePicker";
import {
  CheckIcon,
  ChevronLeft,
  ImageIcon,
  PencilIcon,
  SendIcon,
  TrashIcon,
} from "../components/Icons";
import { confirmAction, haptic, hapticError, inTelegram } from "../telegram";
import { dueState, formatDue, formatWhen, isKnownTime } from "../lib/date";
import { fileToDataUrl } from "../lib/image";
import { priorityOf, toPriorityCode } from "../lib/priority";
import { displayName, initials } from "../lib/user";
import { useT } from "../i18n";
import type { ID, Task } from "../types";

interface TaskDetailProps {
  taskId: ID;
  onBack: () => void;
}

const showDone = api.isAvailable("taskDone");
/* Comments follow the same rule as every other feature: shown in local mode,
   shown once the backend serves them, and replaced by the reason otherwise -
   a thread that writes to localStorage while the task itself lives on the
   server is the exact "looks like it works" failure isAvailable() exists for.
   See api/index.ts. */
const showComments = api.isAvailable("comments");

export function TaskDetail({ taskId, onBack }: TaskDetailProps) {
  const t = useT();
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<CommentView[]>([]);
  const [editing, setEditing] = useState(false);
  const [editingComment, setEditingComment] = useState<CommentView | null>(null);
  const [error, setError] = useState("");

  /* The two reads fail independently on purpose. A task that cannot be fetched
     has been deleted from another screen and there is nothing to show, so the
     screen leaves; a comment thread that cannot be fetched is one section of a
     page that is otherwise fine, and closing the whole task over it would hide
     the task as well as the failure. */
  const load = useCallback(async () => {
    let fetched: Task;
    try {
      fetched = await api.getTask(taskId);
    } catch {
      onBack();
      return;
    }
    setTask(fetched);

    if (!showComments) return;
    try {
      setComments(await api.listComments(taskId));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("comments.loadFailed"));
    }
  }, [taskId, onBack, t]);

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
      setError(err instanceof Error ? err.message : t("board.saveFailed"));
      await load();
    }
  }

  async function remove() {
    const ok = await confirmAction(t("task.confirmDelete"));
    if (!ok) return;
    await api.deleteTask(taskId);
    haptic("medium");
    onBack();
  }

  async function removeComment(comment: CommentView) {
    const ok = await confirmAction(t("comments.confirmDelete"));
    if (!ok) return;
    try {
      await api.deleteComment(comment.id);
      haptic("medium");
      await load();
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : t("comments.deleteFailed"));
    }
  }

  if (!task) return null;

  return (
    <>
      <header className="topbar">
        {!inTelegram && (
          <button className="icon-btn" aria-label={t("common.back")} onClick={onBack}>
            <ChevronLeft />
          </button>
        )}
        <h1>
          {t("task.title")}
          {showDone && <span className="sub">{task.done ? t("task.done") : t("task.open")}</span>}
        </h1>
        <button
          className="icon-btn"
          aria-label={t("task.deleteAria")}
          onClick={() => void remove()}
        >
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
                aria-label={task.done ? t("board.markNotDone") : t("board.markDone")}
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
                {t("task.deadline")}
              </div>
            </div>
            <div className={`due ${task.deadline && !task.done ? dueState(task.deadline) : ""}`}>
              {task.deadline ? formatDue(task.deadline) : t("common.none")}
            </div>
          </div>

          <div className="row" style={{ cursor: "default" }}>
            <div className="row-main">
              <div className="row-sub" style={{ marginTop: 0 }}>
                {t("task.priority")}
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
          {t("task.edit")}
        </button>

        <div className="section-head" style={{ marginTop: 24 }}>
          <h2>{t("comments.title")}</h2>
          {showComments && <span className="count">{comments.length}</span>}
        </div>

        {!showComments ? (
          /* The same shape Board.tsx uses for hidden tasks: say what is absent
             rather than drawing an empty thread with a dead composer under it. */
          <div className="hint">{api.missingFor("comments")}</div>
        ) : (
          <>
            {comments.length > 0 && (
              <div className="list">
                {comments.map((comment) => (
                  <CommentRow
                    key={comment.id}
                    comment={comment}
                    onEdit={() => setEditingComment(comment)}
                    onDelete={() => void removeComment(comment)}
                  />
                ))}
              </div>
            )}

            <Composer taskId={taskId} onPosted={load} />
          </>
        )}
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

      {editingComment && (
        <EditCommentSheet
          comment={editingComment}
          onClose={() => setEditingComment(null)}
          onSaved={async () => {
            setEditingComment(null);
            await load();
          }}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------- */

/** Smaller than the 34px circle .avatar gives, because a comment head is a
 *  line of text rather than a list row. */
const AVATAR = { width: 24, height: 24 } as const;

function CommentRow({
  comment,
  onEdit,
  onDelete,
}: {
  comment: CommentView;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useT();

  /* Resolved here, not at fetch time: the stand-in for an unknown author is a
     translated word, and it has to follow a language switch while the thread
     is still on screen. */
  const name = comment.author
    ? displayName(comment.author)
    : comment.mine
      ? t("comments.you")
      : t("comments.someone");

  const photo = comment.author?.photo_url;

  return (
    <div className="comment">
      <div className="comment-head">
        {/* Telegram photo_url is absent for anyone whose profile photo is not
            public, and the URLs rotate when someone changes their picture - so
            the lettered circle is a real state, not just a loading one. */}
        {photo ? (
          <img className="avatar" style={AVATAR} src={photo} alt="" />
        ) : (
          <div className="avatar" style={{ ...AVATAR, fontSize: "0.6875rem" }}>
            {comment.author ? initials(comment.author) : name.slice(0, 2)}
          </div>
        )}
        <span className="comment-author">{name}</span>
        {/* Absent whenever the response carried no created_at. Printing the
            epoch there would date every comment to 1 Jan 1970. */}
        {isKnownTime(comment.created_at) && (
          <span className="comment-time">{formatWhen(comment.created_at)}</span>
        )}
        <div className="spacer" />

        {/* Only on your own. Every /comment route filters on
            `Comment.user_id == user.id`, so these buttons on someone else's
            comment could only ever produce a 404. */}
        {comment.mine && (
          <>
            <button
              className="btn btn-ghost"
              style={{ color: "var(--faint)" }}
              aria-label={t("comments.editAria")}
              onClick={onEdit}
            >
              <PencilIcon size={15} />
            </button>
            <button
              className="btn btn-ghost"
              style={{ color: "var(--faint)" }}
              aria-label={t("comments.deleteAria")}
              onClick={onDelete}
            >
              <TrashIcon size={15} />
            </button>
          </>
        )}
      </div>
      {comment.content && <div className="comment-body">{comment.content}</div>}
      {comment.image && <img className="comment-image" src={comment.image} alt="" />}
    </div>
  );
}

/* ---------------------------------------------------------------------------- */

/** Comment.image is a LargeBinary column and CommentCreate accepts it, so the
 *  composer can attach one - down the same downscale-to-a-data-URL path task
 *  images take. A comment may be an image with no text at all, which is why
 *  the send button watches both. */
function Composer({ taskId, onPosted }: { taskId: ID; onPosted: () => void | Promise<void> }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function attach(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setImage(await fileToDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("image.readFailed"));
    } finally {
      setBusy(false);
      // Reset, or picking the same file twice fires no change event.
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || (!content.trim() && !image)) return;

    setBusy(true);
    setError("");
    try {
      await api.createComment(taskId, content, image);
      setContent("");
      setImage(null);
      haptic();
      await onPosted();
    } catch (err) {
      // Kept, not swallowed: a haptic buzz is all this used to give, which on a
      // desktop launch is nothing at all - the comment simply stayed in the box
      // with no reason given.
      hapticError();
      setError(err instanceof Error ? err.message : t("comments.postFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && (
        <div className="error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {image && (
        <div className="picker" style={{ marginTop: 12 }}>
          <img className="picker-preview" src={image} alt="" />
          <button
            type="button"
            className="icon-btn"
            aria-label={t("image.remove")}
            onClick={() => setImage(null)}
          >
            <TrashIcon />
          </button>
        </div>
      )}

      <form className="composer" onSubmit={submit}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => void attach(e.target.files?.[0])}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label={t("comments.attach")}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <ImageIcon />
        </button>
        <input
          className="input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={100}
          placeholder={t("comments.placeholder")}
        />
        <button
          type="submit"
          className="btn btn-primary"
          style={{ padding: "0 14px" }}
          disabled={busy || (!content.trim() && !image)}
          aria-label={t("comments.post")}
        >
          <SendIcon />
        </button>
      </form>
    </>
  );
}

/* ---------------------------------------------------------------------------- */

/** PUT /comment replaces content and image together, so the sheet holds both
 *  and sends both - there is no partial patch on that route to mirror. */
function EditCommentSheet({
  comment,
  onClose,
  onSaved,
}: {
  comment: CommentView;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = useT();
  const [content, setContent] = useState(comment.content);
  const [image, setImage] = useState<string | null>(comment.image);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    try {
      await api.updateComment(comment.id, content, image);
      haptic("medium");
      await onSaved();
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : t("comments.saveFailed"));
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("comments.sheet.title")} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}

        <label className="field">
          <div className="label">
            <span>{t("comments.title")}</span>
            {/* String(100) on Comment.content */}
            <span className="limit">{content.length}/100</span>
          </div>
          <textarea
            className="textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={100}
            autoFocus
          />
        </label>

        {/* PUT /comment replaces the image along with the content, so the
            picker is the whole story: leaving it alone keeps what is there,
            clearing it clears the column. */}
        <ImagePicker value={image} onChange={setImage} />

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy || (!content.trim() && !image)}
        >
          {t("comments.sheet.submit")}
        </button>
      </form>
    </Sheet>
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
  const t = useT();
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
      setError(err instanceof Error ? err.message : t("task.sheet.failed"));
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("task.sheet.title")} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}

        <TaskFields draft={draft} onChange={setDraft} />

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy || !draft.title.trim()}
        >
          {t("task.sheet.submit")}
        </button>
      </form>
    </Sheet>
  );
}
