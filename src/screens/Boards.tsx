import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "../api";
import { Sheet } from "../components/Sheet";
import { ChevronRight, PlusIcon } from "../components/Icons";
import { haptic, hapticError } from "../telegram";
import { useT } from "../i18n";
import type { Board, ID, Task } from "../types";

interface BoardsProps {
  onOpenBoard: (id: ID) => void;
}

const showTasks = api.isAvailable("tasks");

export function Boards({ onOpenBoard }: BoardsProps) {
  const t = useT();
  const [boards, setBoards] = useState<Board[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      // The task counts are skipped entirely when tasks are hidden - there is
      // nothing to count, and asking would only walk a store this mode does
      // not use.
      const [boardRows, taskRows] = await Promise.all([
        api.listBoards(),
        showTasks ? api.listAllTasks() : Promise.resolve([]),
      ]);
      setBoards(boardRows);
      setTasks(taskRows);
      // A failed sign-in does not fail this read - GET /taskboards just answers
      // with an empty list - so it has to be reported here or the first symptom
      // is a "User not found" 404 on whatever someone tries to create.
      const signIn = api.lastSignInError();
      setError(signIn ? t("boards.notRegistered", { reason: signIn }) : "");
    } catch (err) {
      // Reading boards is a network call in api mode. Without this the screen
      // never leaves its loading state and shows nothing at all - a blank page
      // where "could not reach the server" belongs.
      setError(err instanceof Error ? err.message : t("boards.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = (boardId: ID) =>
    tasks.filter((t) => t.board_id === boardId && !t.done).length;

  return (
    <>
      <header className="topbar">
        <h1>{t("boards.title")}</h1>
        <button
          className="icon-btn"
          aria-label={t("boards.new")}
          onClick={() => setCreating(true)}
        >
          <PlusIcon />
        </button>
      </header>

      <div className="screen has-nav">
        {error && <div className="error">{error}</div>}

        {loading ? null : boards.length === 0 && !error ? (
          <div className="empty">
            <div className="title">{t("boards.empty.title")}</div>
            <p>
              {showTasks
                ? t("boards.empty.withTasks")
                : t("boards.empty.boardsOnly")}
            </p>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <PlusIcon />
              {t("boards.new")}
            </button>
          </div>
        ) : (
          <div className="list">
            {boards.map((board) => {
              const open = openCount(board.id);
              return (
                <button
                  key={board.id}
                  className="row"
                  onClick={() => {
                    haptic();
                    onOpenBoard(board.id);
                  }}
                >
                  <div className="row-main">
                    <div className="row-title">{board.title}</div>
                    {showTasks && (
                      <div className="row-sub">
                        {open === 0 ? t("boards.allDone") : t("boards.open", { count: open })}
                      </div>
                    )}
                  </div>
                  <ChevronRight />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {creating && (
        <CreateBoardSheet
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

interface CreateBoardSheetProps {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

function CreateBoardSheet({ onClose, onCreated }: CreateBoardSheetProps) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    try {
      await api.createBoard(title);
      haptic("medium");
      await onCreated();
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : t("boards.sheet.failed"));
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("boards.sheet.title")} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}

        <label className="field">
          <div className="label">
            <span>{t("boards.sheet.field")}</span>
            {/* String(30) on TaskBoard.title */}
            <span className="limit">{title.length}/30</span>
          </div>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={30}
            placeholder={t("boards.sheet.placeholder")}
            autoFocus
          />
        </label>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy || !title.trim()}
        >
          {t("boards.sheet.submit")}
        </button>
      </form>
    </Sheet>
  );
}
