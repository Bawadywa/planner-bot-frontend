import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "../api";
import { Sheet } from "../components/Sheet";
import { ChevronRight, PlusIcon } from "../components/Icons";
import { haptic, hapticError } from "../telegram";
import type { Board, ID, Task } from "../types";

interface BoardsProps {
  onOpenBoard: (id: ID) => void;
}

export function Boards({ onOpenBoard }: BoardsProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [b, t] = await Promise.all([api.listBoards(), api.listAllTasks()]);
    setBoards(b);
    setTasks(t);
    setLoading(false);
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
        {loading ? null : boards.length === 0 ? (
          <div className="empty">
            <div className="title">No boards yet</div>
            <p>A board holds a set of tasks — one per project, client or week.</p>
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
                    <div className="row-sub">
                      {open === 0 ? "All done" : `${open} open`}
                    </div>
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
