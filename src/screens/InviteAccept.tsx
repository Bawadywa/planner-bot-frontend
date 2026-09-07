import { useEffect, useState } from "react";
import * as api from "../api";
import { Sheet } from "../components/Sheet";
import { CheckIcon } from "../components/Icons";
import { haptic, hapticError } from "../telegram";
import type { Board, Invite } from "../types";

interface InviteAcceptProps {
  token: string;
  onDone: () => void;
}

type Lookup =
  | { state: "loading" }
  | { state: "unknown" } // no such token in this browser's store
  | { state: "found"; invite: Invite; boards: Board[] };

/** Shown when the app was launched from an invite link - either
 *  t.me/<bot>?startapp=inv_… or the bot's WebApp button carrying ?inv=… */
export function InviteAccept({ token, onDone }: InviteAcceptProps) {
  const [lookup, setLookup] = useState<Lookup>({ state: "loading" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [invite, boards] = await Promise.all([api.getInvite(token), api.listBoards()]);
      if (!live) return;
      setLookup(
        invite
          ? {
              state: "found",
              invite,
              boards: boards.filter((b) => invite.board_ids.includes(b.id)),
            }
          : { state: "unknown" },
      );
    })();
    return () => {
      live = false;
    };
  }, [token]);

  async function join() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.acceptInvite(token);
      haptic("medium");
      setJoined(true);
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : "Could not accept that invite.");
      setBusy(false);
    }
  }

  return (
    <Sheet title="You were invited" onClose={onDone}>
      {error && <div className="error">{error}</div>}

      {lookup.state === "loading" && <div className="hint">Checking the link…</div>}

      {/* The demo's honest dead end. Invites live in localStorage, so a link
          opened anywhere other than the device that made it cannot resolve -
          this is exactly the part that starts working once /invites is a real
          endpoint, and saying so beats showing a broken-looking error. */}
      {lookup.state === "unknown" && (
        <>
          <div className="hint">
            This link carries the token <code>{token}</code>, and Telegram
            delivered it to the app correctly — that is the whole handoff
            working.
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            It cannot be redeemed here because invites are still stored in the
            browser that created them. Once the backend has an
            <code> /invites</code> table, this is where the board would be
            joined.
          </div>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 14 }} onClick={onDone}>
            Close
          </button>
        </>
      )}

      {lookup.state === "found" && !joined && (
        <>
          <div className="field">
            <div className="label">
              <span>Boards this link opens</span>
            </div>
            <div className="chips">
              {lookup.boards.length === 0 ? (
                <span className="hint">Those boards have since been deleted.</span>
              ) : (
                lookup.boards.map((board) => (
                  <span key={board.id} className="chip" aria-pressed>
                    {board.title}
                  </span>
                ))
              )}
            </div>
          </div>

          {lookup.invite.accepted_at ? (
            <div className="hint">This link has already been used.</div>
          ) : (
            <button
              className="btn btn-primary btn-block"
              disabled={busy || lookup.boards.length === 0}
              onClick={() => void join()}
            >
              Join
            </button>
          )}

          {lookup.invite.accepted_at && (
            <button className="btn btn-secondary btn-block" style={{ marginTop: 10 }} onClick={onDone}>
              Close
            </button>
          )}
        </>
      )}

      {joined && (
        <>
          <div className="empty">
            <div className="title">
              <CheckIcon /> You're in
            </div>
            <p>The board is on your Taskboard tab now.</p>
          </div>
          <button className="btn btn-primary btn-block" onClick={onDone}>
            Open Planner
          </button>
        </>
      )}
    </Sheet>
  );
}
