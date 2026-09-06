import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "../api";
import { Sheet } from "../components/Sheet";
import { PoweredBy } from "../components/PoweredBy";
import { LogoutIcon, PlusIcon, TrashIcon } from "../components/Icons";
import { confirmAction, haptic, hapticError } from "../telegram";
import type { Board, ID, Member, User } from "../types";

interface SettingsProps {
  user: User;
  onSignOut: () => void;
}

export function Settings({ user, onSignOut }: SettingsProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [m, b] = await Promise.all([api.listMembers(), api.listBoards()]);
    setMembers(m);
    setBoards(b);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(member: Member) {
    const ok = await confirmAction(`Remove ${member.email} from the team?`);
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

  async function signOut() {
    const ok = await confirmAction("Sign out of this device?");
    if (!ok) return;
    await api.logout();
    onSignOut();
  }

  async function clearData() {
    const ok = await confirmAction(
      "Erase every board, task and comment stored in this browser? This cannot be undone.",
    );
    if (!ok) return;
    await api.resetLocalData();
    onSignOut();
  }

  const usage = api.storageUsage();
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
            <div className="avatar">{user.email.slice(0, 2)}</div>
            <div className="row-main">
              <div className="row-title">{user.email}</div>
              <div className="row-sub">Signed in on this device</div>
            </div>
          </div>
        </div>

        <div className="section-head" style={{ marginTop: 24 }}>
          <h2>Team</h2>
          <span className="count">{members.length}</span>
        </div>

        <div className="list">
          {members.map((member) => (
            <div key={member.id} className="row" style={{ cursor: "default" }}>
              <div className="avatar">{member.email.slice(0, 2)}</div>

              <div className="row-main">
                <div className="row-title">{member.email}</div>
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
              {member.status === "invited" && <span className="tag invited">invited</span>}

              {member.role !== "owner" && (
                <button
                  className="icon-btn"
                  aria-label={`Remove ${member.email}`}
                  onClick={() => void remove(member)}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
        </div>

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

        <div className="section-head" style={{ marginTop: 24 }}>
          <h2>Data</h2>
        </div>
        <div className="list">
          <div className="row" style={{ cursor: "default" }}>
            <div className="row-main">
              <div className="row-title">Stored in this browser</div>
              <div className="row-sub">
                Nothing is sent to a server yet — invites are local only.
              </div>
            </div>
            <div className="row-meta">{usage.label}</div>
          </div>
        </div>

        <div className="stack" style={{ marginTop: 16 }}>
          <button className="btn btn-secondary btn-block" onClick={() => void signOut()}>
            <LogoutIcon />
            Sign out
          </button>
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
          onInvited={async () => {
            setInviting(false);
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
  onInvited: () => void | Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<ID[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle(id: ID) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    try {
      await api.inviteMember(email, picked);
      haptic("medium");
      await onInvited();
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : "Could not send the invite.");
      setBusy(false);
    }
  }

  return (
    <Sheet title="Invite to the team" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}

        <label className="field">
          <div className="label">
            <span>Email</span>
          </div>
          <input
            className="input"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="teammate@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            autoFocus
          />
        </label>

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
          No email is actually sent yet — the invite is recorded locally so the
          team list and per-board access are real once the backend exists.
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy || !email.trim() || picked.length === 0}
        >
          Send invite
        </button>
      </form>
    </Sheet>
  );
}
