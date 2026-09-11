import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "../api";
import { Sheet } from "../components/Sheet";
import { CreateWorkspaceSheet } from "../components/CreateWorkspaceSheet";
import { PoweredBy } from "../components/PoweredBy";
import { CheckIcon, PlusIcon, SendIcon, TrashIcon } from "../components/Icons";
import {
  botUsername,
  confirmAction,
  haptic,
  hapticError,
  inviteLink,
  shareToTelegram,
} from "../telegram";
import { displayName, handle, initials } from "../lib/user";
import { setActiveWorkspace, useActiveWorkspace } from "../lib/workspace";
import { LANGUAGES, useLang, useT } from "../i18n";
import type { Board, ID, Invite, Member, User, Workspace } from "../types";

const showWorkspaces = api.isAvailable("workspaces");
const showWorkspace = api.isAvailable("workspace");
const showInvites = api.isAvailable("invites");

interface SettingsProps {
  user: User;
  /** Called after the local database is wiped, so the shell can re-derive the
   *  identity from Telegram. There is no sign-out to pair with it: the account
   *  is the Telegram one, and the app cannot revoke it. */
  onReset: () => void;
}

export function Settings({ user, onReset }: SettingsProps) {
  const t = useT();
  /* Subscribed, not just read: creating or switching a workspace has to move
     the tick in the list below without waiting for anything to refetch, and
     the same store is what the picker in the Boards bar reads. */
  const activeWorkspaceId = useActiveWorkspace();
  const [members, setMembers] = useState<Member[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  // Set when a share could not use Telegram's own sheet, which otherwise looks
  // exactly like a button that does nothing.
  const [note, setNote] = useState("");
  const [health, setHealth] = useState<"checking" | "up" | "down">("checking");

  const load = useCallback(async () => {
    try {
      const [m, w, b, i] = await Promise.all([
        showWorkspace ? api.listMembers() : Promise.resolve([]),
        showWorkspaces ? api.listWorkspaces() : Promise.resolve([]),
        api.listBoards(),
        showInvites ? api.listInvites() : Promise.resolve([]),
      ]);
      setMembers(m);
      setWorkspaces(w);
      setBoards(b);
      setInvites(i);
      setError("");
    } catch (err) {
      // In api mode the board list is a network call, so this screen has to
      // survive the server being unreachable rather than rendering half-empty
      // with no explanation.
      setError(err instanceof Error ? err.message : t("settings.loadFailed"));
    }
  }, [t, activeWorkspaceId]);

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

  /** The line that rides along with the link in the shared message. Telegram
   *  shows it next to the link preview, so it has to make sense on its own -
   *  the recipient sees it before they know what Planner is.
   *
   *  Built at share time rather than held as a constant: the sender's language
   *  is the one the message should be written in, and that can change while
   *  this screen is open. */
  function inviteText(boardTitles: string[]): string {
    const what =
      boardTitles.length === 1
        ? `"${boardTitles[0]}"`
        : t("settings.inviteBoards", { count: boardTitles.length });
    return t("settings.inviteText", { what });
  }

  async function remove(member: Member) {
    const ok = await confirmAction(
      t("settings.confirmRemove", { name: displayName(member) }),
    );
    if (!ok) return;
    try {
      await api.removeMember(member.id);
      haptic("medium");
      await load();
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : t("settings.removeFailed"));
    }
  }

  function shareAgain(invite: Invite) {
    haptic();
    const titles = invite.board_ids
      .map((id) => boards.find((b) => b.id === id)?.title)
      .filter((title): title is string => Boolean(title));
    const shared = shareToTelegram(inviteLink(invite.token), inviteText(titles));
    setNote(shared ? "" : t("settings.fallbackNote"));
  }

  async function revoke(invite: Invite) {
    const ok = await confirmAction(t("settings.confirmRevoke"));
    if (!ok) return;
    await api.revokeInvite(invite.id);
    haptic("medium");
    await load();
  }

  async function clearData() {
    const ok = await confirmAction(t("settings.confirmErase"));
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
        <h1>{t("settings.title")}</h1>
      </header>

      <div className="screen has-nav">
        {error && <div className="error">{error}</div>}

        <div className="section-head">
          <h2>{t("settings.account")}</h2>
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
              <div className="row-sub">{handle(user) ?? t("settings.signedIn")}</div>
            </div>
          </div>
        </div>

        <LanguageSection />

        {showWorkspaces && (
          <>
            <div className="section-head" style={{ marginTop: 24 }}>
              <h2>{t("workspaces.heading")}</h2>
              <span className="count">{workspaces.length}</span>
            </div>

            <div className="list">
              {workspaces.map((workspace) => {
                const chosen = workspace.id === activeWorkspaceId;
                return (
                  <button
                    key={workspace.id}
                    className="row"
                    role="radio"
                    aria-checked={chosen}
                    onClick={() => {
                      haptic();
                      /* The picker in the Boards bar reads the same store, so
                         switching here and switching there are one action. */
                      setActiveWorkspace(workspace.id);
                    }}
                  >
                    <div className="row-main">
                      <div className="row-title">{workspace.title}</div>
                      <div className="row-sub">
                        {workspace.owner_id === user.id
                          ? t("workspaces.owned")
                          : t("workspaces.shared")}
                      </div>
                    </div>
                    {chosen && <CheckIcon />}
                  </button>
                );
              })}
            </div>

            <button
              className="btn btn-secondary btn-block"
              style={{ marginTop: 12 }}
              onClick={() => {
                haptic();
                setCreatingWorkspace(true);
              }}
            >
              <PlusIcon />
              {t("workspaces.new")}
            </button>

            {/* Says where switching normally happens, so this list reads as a
                place to manage workspaces rather than the only way to leave
                one. */}
            <div className="hint" style={{ marginTop: 8 }}>
              {t("workspaces.settingsSub")}
            </div>
          </>
        )}

        {showWorkspace && (
          <>
            <div className="section-head" style={{ marginTop: 24 }}>
              <h2>{t("settings.workspace")}</h2>
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
                        ? t("settings.noBoards")
                        : member.board_ids
                            .map(boardName)
                            .filter(Boolean)
                            .join(", ")}
                    </div>
                  </div>

                  <span className={`tag ${member.role === "owner" ? "owner" : ""}`}>
                    {member.role === "owner" ? t("settings.roleOwner") : t("settings.roleMember")}
                  </span>
                  {member.status === "invited" && (
                    <span className="tag invited">{t("settings.invited")}</span>
                  )}

                  {member.role !== "owner" && (
                    <button
                      className="icon-btn"
                      aria-label={t("settings.removeAria", { name: displayName(member) })}
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
              {t("settings.invite")}
            </button>

            {boards.length === 0 && (
              <div className="hint" style={{ marginTop: 8 }}>
                {t("settings.inviteHint")}
              </div>
            )}
          </>
        )}

        {invites.length > 0 && (
          <>
            <div className="section-head" style={{ marginTop: 24 }}>
              <h2>{t("settings.inviteLinks")}</h2>
              <span className="count">{invites.length}</span>
            </div>

            {note && <div className="hint" style={{ marginBottom: 8 }}>{note}</div>}

            <div className="list">
              {invites.map((invite) => (
                <div key={invite.id} className="row" style={{ cursor: "default" }}>
                  <div className="row-main">
                    <div className="row-title">
                      {invite.board_ids.map(boardName).filter(Boolean).join(", ") ||
                        t("settings.boardDeleted")}
                    </div>
                    <div className="row-sub" style={{ wordBreak: "break-all" }}>
                      {inviteLink(invite.token)}
                    </div>
                  </div>

                  {invite.accepted_at ? (
                    <span className="tag">{t("settings.used")}</span>
                  ) : (
                    <button
                      className="icon-btn"
                      aria-label={t("settings.shareAgain")}
                      onClick={() => shareAgain(invite)}
                    >
                      <SendIcon />
                    </button>
                  )}

                  <button
                    className="icon-btn"
                    aria-label={t("settings.revoke")}
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
          <h2>{t("settings.data")}</h2>
        </div>
        <div className="list">
          {api.serverBacked && (
            <div className="row" style={{ cursor: "default" }}>
              <div className="row-main">
                <div className="row-title">{t("settings.backend")}</div>
                <div className="row-sub">{t("settings.backendSub")}</div>
              </div>
              <span className={`tag ${health === "up" ? "owner" : ""}`}>
                {health === "checking"
                  ? t("common.checking")
                  : health === "up"
                    ? t("common.online")
                    : t("common.offline")}
              </span>
            </div>
          )}

          {/* Reachable and registered are different things: /health answers
              before POST /user has ever succeeded, so a green row above can sit
              on top of an account the backend has no row for. */}
          {api.serverBacked && signInError && (
            <div className="row" style={{ cursor: "default", alignItems: "flex-start" }}>
              <div className="row-main">
                <div className="row-title">{t("settings.notRegistered")}</div>
                <div className="row-sub" style={{ whiteSpace: "normal" }}>
                  {signInError}
                </div>
              </div>
              <span className="tag invited">{t("settings.localTag")}</span>
            </div>
          )}

          <div className="row" style={{ cursor: "default" }}>
            <div className="row-main">
              <div className="row-title">{t("settings.storedHere")}</div>
              <div className="row-sub">
                {api.serverBacked
                  ? t("settings.storedHereApi")
                  : t("settings.storedHereLocal")}
              </div>
            </div>
            <div className="row-meta">{usage.label}</div>
          </div>
        </div>

        <div className="stack" style={{ marginTop: 16 }}>
          <button className="btn btn-danger btn-block" onClick={() => void clearData()}>
            {t("settings.erase")}
          </button>
        </div>

        <PoweredBy />
      </div>

      {creatingWorkspace && (
        <CreateWorkspaceSheet
          onClose={() => setCreatingWorkspace(false)}
          onCreated={async (workspace) => {
            setCreatingWorkspace(false);
            /* Switch to it, the way the picker does: creating one is how you
               say you want to be in it, and leaving the app in the old one
               makes the new row look like it did nothing. */
            setActiveWorkspace(workspace.id);
            await load();
          }}
        />
      )}

      {inviting && (
        <InviteSheet
          boards={boards}
          inviteText={inviteText}
          onClose={() => setInviting(false)}
          onInvited={async (sharedNatively) => {
            setInviting(false);
            setNote(sharedNatively ? "" : t("settings.fallbackNote"));
            await load();
          }}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------- */

/** The language switcher.
 *
 *  Chips rather than a <select>, for the same reason the priority picker uses
 *  them: Telegram's webview opens a native picker over half the screen for a
 *  select, and two options fit on one line. Every option is written in its own
 *  language, so someone who landed in the wrong one by way of Telegram's
 *  language_code can still find their way back.
 *
 *  The choice is per device - it lives in localStorage, because the backend has
 *  no column to hang it on - which is what the sub-line says rather than
 *  leaving people to discover it on their second phone. */
function LanguageSection() {
  const t = useT();
  const { lang, setLang } = useLang();

  return (
    <>
      <div className="section-head" style={{ marginTop: 24 }}>
        <h2>{t("settings.language")}</h2>
      </div>

      <div className="list">
        <div className="row" style={{ alignItems: "flex-start", cursor: "default" }}>
          <div className="row-main">
            <div className="row-sub" style={{ marginTop: 0, whiteSpace: "normal" }}>
              {t("settings.languageSub")}
            </div>
            <div className="chips" style={{ marginTop: 10 }} role="radiogroup"
                 aria-label={t("settings.language")}>
              {LANGUAGES.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  role="radio"
                  aria-checked={lang === option.code}
                  aria-pressed={lang === option.code}
                  className="chip"
                  lang={option.code}
                  onClick={() => {
                    haptic();
                    setLang(option.code);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------- */

function InviteSheet({
  boards,
  inviteText,
  onClose,
  onInvited,
}: {
  boards: Board[];
  inviteText: (boardTitles: string[]) => string;
  onClose: () => void;
  onInvited: (sharedNatively: boolean) => void | Promise<void>;
}) {
  const t = useT();
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
      setError(err instanceof Error ? err.message : t("settings.sheet.failed"));
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("settings.sheet.title")} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}

        {!botUsername && <div className="error">{t("settings.sheet.noBotUsername")}</div>}

        <div className="field">
          <div className="label">
            <span>{t("settings.sheet.boards")}</span>
            <span className="limit">
              {t("settings.sheet.selected", { count: picked.length })}
            </span>
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
          {t("settings.sheet.hint")}
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy || picked.length === 0}
        >
          <SendIcon />
          {t("settings.sheet.submit")}
        </button>
      </form>
    </Sheet>
  );
}
