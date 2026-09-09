import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "../api";
import { Sheet } from "../components/Sheet";
import { PoweredBy } from "../components/PoweredBy";
import { PlusIcon, SendIcon, TrashIcon } from "../components/Icons";
import {
  botUsername,
  confirmAction,
  haptic,
  hapticError,
  inviteLink,
  shareToTelegram,
} from "../telegram";
import { displayName, handle, initials } from "../lib/user";
import type { Board, ID, Invite, Member, User } from "../types";

/** The line that rides along with the link in the shared message. Telegram
 *  shows it next to the link preview, so it has to make sense on its own -
 *  the recipient sees it before they know what Planner is. */
const FALLBACK_NOTE =
  "Telegram's share sheet is only available inside the Telegram app — the link " +
  "opened in a browser tab instead. It is listed below, ready to copy.";

function inviteText(boardTitles: string[]): string {
  const what =
    boardTitles.length === 1
      ? `"${boardTitles[0]}"`
      : `${boardTitles.length} boards`;
  return `Join me on ${what} in Planner`;
}

const showTeam = api.isAvailable("team");
const showInvites = api.isAvailable("invites");

interface SettingsProps {
  user: User;
  /** Called after the local database is wiped, so the shell can re-derive the
   *  identity from Telegram. There is no sign-out to pair with it: the account
   *  is the Telegram one, and the app cannot revoke it. */
  onReset: () => void;
}

export function Settings({ user, onReset }: SettingsProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  // Set when a share could not use Telegram's own sheet, which otherwise looks
  // exactly like a button that does nothing.
  const [note, setNote] = useState("");
  const [health, setHealth] = useState<"checking" | "up" | "down">("checking");

  const load = useCallback(async () => {
    try {
      const [m, b, i] = await Promise.all([
        showTeam ? api.listMembers() : Promise.resolve([]),
        api.listBoards(),
        showInvites ? api.listInvites() : Promise.resolve([]),
      ]);
      setMembers(m);
      setBoards(b);
      setInvites(i);
      setError("");
    } catch (err) {
      // In api mode the board list is a network call, so this screen has to
      // survive the server being unreachable rather than rendering half-empty
      // with no explanation.
      setError(err instanceof Error ? err.message : "Could not load your team.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Only asked when there is a backend to ask. Nothing depends on the answer -
  // it is a diagnosis for the row below, so a failure just reads as "offline".
  useEffect(() => {
    if (!api.serverBacked) return;
    let live = true;
    void api.checkHealth().then((ok) => {
      if (live) setHealth(ok ? "up" : "down");
    });
    return () => {
      live = false;
    };
  }, []);

  async function remove(member: Member) {
    const ok = await confirmAction(`Remove ${displayName(member)} from the team?`);
    if (!ok) return;
    try {
      await api.removeMember(member.id);
      haptic("medium");
      await load();
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : "Could not remove them.");
    }
  }

  function shareAgain(invite: Invite) {
    haptic();
    const titles = invite.board_ids
      .map((id) => boards.find((b) => b.id === id)?.title)
      .filter((t): t is string => Boolean(t));
    const shared = shareToTelegram(inviteLink(invite.token), inviteText(titles));
    setNote(shared ? "" : FALLBACK_NOTE);
  }

  async function revoke(invite: Invite) {
    const ok = await confirmAction(
      "Revoke this link? Anyone who already has it will not be able to join.",
    );
    if (!ok) return;
    await api.revokeInvite(invite.id);
    haptic("medium");
    await load();
  }

  async function clearData() {
    const ok = await confirmAction(
      "Erase every board, task and comment stored in this browser? This cannot be undone.",
    );
    if (!ok) return;
    await api.resetLocalData();
    onReset();
  }

  const usage = api.storageUsage();
  const signInError = api.lastSignInError();
  const boardName = (id: ID) => boards.find((b) => b.id === id)?.title;

  return (
    <>
      <header className="topbar">
        <h1>Settings</h1>
      </header>

      <div className="screen has-nav">
        {error && <div className="error">{error}</div>}

        <div className="section-head">
          <h2>Account</h2>
        </div>
        <div className="list">
          <div className="row" style={{ cursor: "default" }}>
            {user.photo_url ? (
              <img className="avatar" src={user.photo_url} alt="" />
            ) : (
              <div className="avatar">{initials(user)}</div>
            )}
            <div className="row-main">
              <div className="row-title">{displayName(user)}</div>
              <div className="row-sub">
                {handle(user) ?? "Signed in with Telegram"}
              </div>
            </div>
          </div>
        </div>

        {showTeam && (
          <>
            <div className="section-head" style={{ marginTop: 24 }}>
              <h2>Team</h2>
              <span className="count">{members.length}</span>
            </div>

            <div className="list">
              {members.map((member) => (
                <div key={member.id} className="row" style={{ cursor: "default" }}>
                  <div className="avatar">{initials(member)}</div>

                  <div className="row-main">
                    <div className="row-title">{displayName(member)}</div>
                    <div className="row-sub">
                      {member.board_ids.length === 0
                        ? "No boards yet"
                        : member.board_ids
                            .map(boardName)
                            .filter(Boolean)
                            .join(", ")}
                    </div>
                  </div>

                  <span className={`tag ${member.role === "owner" ? "owner" : ""}`}>
                    {member.role}
                  </span>
                  {member.status === "invited" && (
                    <span className="tag invited">invited</span>
                  )}

                  {member.role !== "owner" && (
                    <button
                      className="icon-btn"
                      aria-label={`Remove ${displayName(member)}`}
                      onClick={() => void remove(member)}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {showInvites && (
          <>
            <button
              className="btn btn-secondary btn-block"
              style={{ marginTop: 12 }}
              onClick={() => setInviting(true)}
              disabled={boards.length === 0}
            >
              <PlusIcon />
              Invite someone
            </button>

            {boards.length === 0 && (
              <div className="hint" style={{ marginTop: 8 }}>
                Create a board first — an invite grants access to specific boards.
              </div>
            )}
          </>
        )}

        {invites.length > 0 && (
          <>
            <div className="section-head" style={{ marginTop: 24 }}>
              <h2>Invite links</h2>
              <span className="count">{invites.length}</span>
            </div>

            {note && <div className="hint" style={{ marginBottom: 8 }}>{note}</div>}

            <div className="list">
              {invites.map((invite) => (
                <div key={invite.id} className="row" style={{ cursor: "default" }}>
                  <div className="row-main">
                    <div className="row-title">
                      {invite.board_ids.map(boardName).filter(Boolean).join(", ") ||
                        "Board deleted"}
                    </div>
                    <div className="row-sub" style={{ wordBreak: "break-all" }}>
                      {inviteLink(invite.token)}
                    </div>
                  </div>

                  {invite.accepted_at ? (
                    <span className="tag">used</span>
                  ) : (
                    <button
                      className="icon-btn"
                      aria-label="Share this link again"
                      onClick={() => shareAgain(invite)}
                    >
                      <SendIcon />
                    </button>
                  )}

                  <button
                    className="icon-btn"
                    aria-label="Revoke this link"
                    onClick={() => void revoke(invite)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="section-head" style={{ marginTop: 24 }}>
          <h2>Data</h2>
        </div>
        <div className="list">
          {api.serverBacked && (
            <div className="row" style={{ cursor: "default" }}>
              <div className="row-main">
                <div className="row-title">Backend</div>
                <div className="row-sub">
                  Boards and your account are stored on the server.
                </div>
              </div>
              <span className={`tag ${health === "up" ? "owner" : ""}`}>
                {health === "checking" ? "…" : health === "up" ? "online" : "offline"}
              </span>
            </div>
          )}

          {/* Reachable and registered are different things: /health answers
              before POST /user has ever succeeded, so a green row above can sit
              on top of an account the backend has no row for. */}
          {api.serverBacked && signInError && (
            <div className="row" style={{ cursor: "default", alignItems: "flex-start" }}>
              <div className="row-main">
                <div className="row-title">Account not registered</div>
                <div className="row-sub" style={{ whiteSpace: "normal" }}>
                  {signInError}
                </div>
              </div>
              <span className="tag invited">local</span>
            </div>
          )}

          <div className="row" style={{ cursor: "default" }}>
            <div className="row-main">
              <div className="row-title">Stored in this browser</div>
              <div className="row-sub">
                {api.serverBacked
                  ? "Tasks, comments, team and invites — not on the server yet."
                  : "Nothing is sent to a server yet — invites are local only."}
              </div>
            </div>
            <div className="row-meta">{usage.label}</div>
          </div>
        </div>

        <div className="stack" style={{ marginTop: 16 }}>
          <button className="btn btn-danger btn-block" onClick={() => void clearData()}>
            Erase local data
          </button>
        </div>

        <PoweredBy />
      </div>

      {inviting && (
        <InviteSheet
          boards={boards}
          onClose={() => setInviting(false)}
          onInvited={async (sharedNatively) => {
            setInviting(false);
            setNote(sharedNatively ? "" : FALLBACK_NOTE);
            await load();
          }}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------- */

function InviteSheet({
  boards,
  onClose,
  onInvited,
}: {
  boards: Board[];
  onClose: () => void;
  onInvited: (sharedNatively: boolean) => void | Promise<void>;
}) {
  const [picked, setPicked] = useState<ID[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle(id: ID) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

  /* Mint the token first, then hand the link to Telegram. The sheet closes
     either way: on a real client the share sheet is already on top of it, and
     in a browser the link is waiting in the Invite links list. */
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    try {
      const invite = await api.createInvite(picked);
      const titles = boards.filter((b) => picked.includes(b.id)).map((b) => b.title);
      const shared = shareToTelegram(inviteLink(invite.token), inviteText(titles));
      haptic("medium");
      await onInvited(shared);
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : "Could not create the invite.");
      setBusy(false);
    }
  }

  return (
    <Sheet title="Invite to a board" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}

        {!botUsername && (
          <div className="error">
            BOT_USERNAME is not set in config.js — the link will point at
            t.me/?startapp=… and open nothing.
          </div>
        )}

        <div className="field">
          <div className="label">
            <span>Boards they can open</span>
            <span className="limit">{picked.length} selected</span>
          </div>
          <div className="chips">
            {boards.map((board) => (
              <button
                key={board.id}
                type="button"
                className="chip"
                aria-pressed={picked.includes(board.id)}
                onClick={() => toggle(board.id)}
              >
                {board.title}
              </button>
            ))}
          </div>
        </div>

        <div className="hint" style={{ marginBottom: 14 }}>
          Telegram opens its own share sheet next — search, recent chats and
          contacts — and sends the link from you. Nothing leaves this device
          until you pick someone there.
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy || picked.length === 0}
        >
          <SendIcon />
          Choose a chat in Telegram
        </button>
      </form>
    </Sheet>
  );
}
