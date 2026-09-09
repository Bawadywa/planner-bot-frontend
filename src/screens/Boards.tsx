import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "../api";
import { Sheet } from "../components/Sheet";
import { ChevronRight, PlusIcon } from "../components/Icons";
import { haptic, hapticError } from "../telegram";
import type { Board, ID, Task } from "../types";

interface BoardsProps {
  onOpenBoard: (id: ID) => void;
}

const showTasks = api.isAvailable("tasks");

export function Boards({ onOpenBoard }: BoardsProps) {
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
      const [b, t] = await Promise.all([
        api.listBoards(),
        showTasks ? api.listAllTasks() : Promise.resolve([]),
      ]);
      setBoards(b);
      setTasks(t);
      // A failed sign-in does not fail this read - GET /taskboards just answers
      // with an empty list - so it has to be reported here or the first symptom
      // is a "User not found" 404 on whatever someone tries to create.
      const signIn = api.lastSignInError();
      setError(
        signIn ? `Not registered with the backend: ${signIn}. Boards cannot be saved.` : "",
      );
    } catch (err) {
      // Reading boards is a network call in api mode. Without this the screen
      // never leaves its loading state and shows nothing at all - a blank page
      // where "could not reach the server" belongs.
      setError(err instanceof Error ? err.message : "Could not load your boards.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = (boardId: ID) =>
    tasks.filter((t) => t.board_id === boardId && !t.done).length;

  return (
    <>
      <header className="topbar">
        <h1>Boards</h1>
        <button
          className="icon-btn"
          aria-label="New board"
          onClick={() => setCreating(true)}
        >
          <PlusIcon />
        </button>
      </header>

      <div className="screen has-nav">
        {error && <div className="error">{error}</div>}

        {loading ? null : boards.length === 0 && !error ? (
          <div className="empty">
            <div className="title">No boards yet</div>
            <p>
              {showTasks
                ? "A board holds a set of tasks — one per project, client or week."
                : "Create one to check that it reaches the backend and comes back."}
            </p>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <PlusIcon />
              New board
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
                        {open === 0 ? "All done" : `${open} open`}
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
      setError(err instanceof Error ? err.message : "Could not create the board.");
      setBusy(false);
    }
  }

  return (
    <Sheet title="New board" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}

        <label className="field">
          <div className="label">
            <span>Title</span>
            {/* String(30) on TaskBoard.title */}
            <span className="limit">{title.length}/30</span>
          </div>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={30}
            placeholder="Sprint 12"
            autoFocus
          />
        </label>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy || !title.trim()}
        >
          Create board
        </button>
      </form>
    </Sheet>
  );
}
