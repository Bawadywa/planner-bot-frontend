import { useEffect, useState } from "react";
import * as api from "../api";
import { Sheet } from "../components/Sheet";
import { CheckIcon } from "../components/Icons";
import { haptic, hapticError } from "../telegram";
import { useT } from "../i18n";
import type { Board, Invite } from "../types";

interface InviteAcceptProps {
  token: string;
  onDone: () => void;
}

type Lookup =
  | { state: "loading" }
  | { state: "unknown" } // no such token in this browser's store
  | { state: "found"; invite: Invite; boards: Board[] };

const showInvites = api.isAvailable("invites");

/** Shown when the app was launched from an invite link - either
 *  t.me/<bot>?startapp=inv_… or the bot's WebApp button carrying ?inv=… */
export function InviteAccept({ token, onDone }: InviteAcceptProps) {
  const t = useT();
  const [lookup, setLookup] = useState<Lookup>({ state: "loading" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      // With invites hidden, the local store is not consulted at all: a token
      // minted here before the switch could still be found and "accepted",
      // writing a membership row the backend has no idea about.
      if (!showInvites) {
        setLookup({ state: "unknown" });
        return;
      }

      // The two reads can come from different stores - invites are local, the
      // boards may be the server's - so they fail independently. A board list
      // that cannot be fetched must not turn a valid invite into a dead link.
      const invite = await api.getInvite(token).catch(() => null);
      let boards: Board[] = [];
      try {
        boards = await api.listBoards();
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : t("invite.loadFailed"));
      }
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
  }, [token, t]);

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
      setError(err instanceof Error ? err.message : t("invite.acceptFailed"));
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("invite.title")} onClose={onDone}>
      {error && <div className="error">{error}</div>}

      {lookup.state === "loading" && <div className="hint">{t("invite.checking")}</div>}

      {/* The demo's honest dead end. Invites live in localStorage, so a link
          opened anywhere other than the device that made it cannot resolve -
          this is exactly the part that starts working once /invites is a real
          endpoint, and saying so beats showing a broken-looking error. */}
      {lookup.state === "unknown" && (
        <>
          <div className="hint">{t("invite.unknownHandoff", { token })}</div>
          <div className="hint" style={{ marginTop: 10 }}>
            {t("invite.unknownWhy")}
          </div>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 14 }} onClick={onDone}>
            {t("common.close")}
          </button>
        </>
      )}

      {lookup.state === "found" && !joined && (
        <>
          <div className="field">
            <div className="label">
              <span>{t("invite.boards")}</span>
            </div>
            <div className="chips">
              {lookup.boards.length === 0 ? (
                <span className="hint">{t("invite.boardsDeleted")}</span>
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
            <div className="hint">{t("invite.alreadyUsed")}</div>
          ) : (
            <button
              className="btn btn-primary btn-block"
              disabled={busy || lookup.boards.length === 0}
              onClick={() => void join()}
            >
              {t("invite.join")}
            </button>
          )}

          {lookup.invite.accepted_at && (
            <button className="btn btn-secondary btn-block" style={{ marginTop: 10 }} onClick={onDone}>
              {t("common.close")}
            </button>
          )}
        </>
      )}

      {joined && (
        <>
          <div className="empty">
            <div className="title">
              <CheckIcon /> {t("invite.joined")}
            </div>
            <p>{t("invite.joinedBody")}</p>
          </div>
          <button className="btn btn-primary btn-block" onClick={onDone}>
            {t("invite.open")}
          </button>
        </>
      )}
    </Sheet>
  );
}
