import { useEffect, useState } from "react";
import * as api from "../api";
import { Sheet } from "../components/Sheet";
import { CheckIcon } from "../components/Icons";
import { haptic, hapticError } from "../telegram";
import { useT } from "../i18n";
import type { InvitePreview } from "../types";

interface InviteAcceptProps {
  token: string;
  onDone: () => void;
}

type Lookup =
  | { state: "loading" }
  /** No such token. In local mode that means another browser minted it. In api
   *  mode it is what a preview route would answer for a link that is spent,
   *  revoked or expired - there is no such route yet, so nothing reaches this
   *  state on the server today, and the join below is what finds out instead. */
  | { state: "unknown" }
  /** The lookup itself failed - offline, a timeout, a 500. Distinct from
   *  `unknown`, because telling someone their link is dead when the phone
   *  simply has no signal is a lie they cannot check. */
  | { state: "failed" }
  | { state: "found"; preview: InvitePreview };

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
      // With invites hidden, no store is consulted at all: a token minted here
      // before the switch could still be found and "accepted", writing a
      // membership row the backend has no idea about.
      if (!showInvites) {
        setLookup({ state: "unknown" });
        return;
      }

      /* One read now, where there used to be two. The old version resolved
         board titles by intersecting api.listBoards() against invite.board_ids,
         which works only where the store holds everything - and the whole point
         of an invitee is that they are NOT a member yet, so listBoards() answers
         [] for them and the preview said they had been invited to nothing.

         So the titles have to come from the invite lookup itself. In api mode
         that lookup has nothing to call yet and answers a placeholder with
         board_titles null; the screen renders that as "cannot say" rather than
         as "nothing", and still offers the join. */
      try {
        const preview = await api.getInvite(token);
        if (!live) return;
        setLookup(preview ? { state: "found", preview } : { state: "unknown" });
      } catch (err) {
        if (!live) return;
        setError(err instanceof Error ? err.message : t("invite.loadFailed"));
        setLookup({ state: "failed" });
      }
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

      {lookup.state === "failed" && (
        <button className="btn btn-secondary btn-block" style={{ marginTop: 14 }} onClick={onDone}>
          {t("common.close")}
        </button>
      )}

      {lookup.state === "unknown" && (
        <>
          {api.serverBacked ? (
            /* The route will not say WHICH of used, revoked or expired it was,
               and it should not: that is information about an invite to someone
               who has been told they may not have it. */
            <div className="hint">{t("invite.unknownServed")}</div>
          ) : (
            /* The demo's honest dead end. In local mode invites live in
               localStorage, so a link opened anywhere other than the device
               that made it cannot resolve. */
            <>
              <div className="hint">{t("invite.unknownHandoff", { token })}</div>
              <div className="hint" style={{ marginTop: 10 }}>
                {t("invite.unknownWhy")}
              </div>
            </>
          )}
          <button className="btn btn-secondary btn-block" style={{ marginTop: 14 }} onClick={onDone}>
            {t("common.close")}
          </button>
        </>
      )}

      {lookup.state === "found" && !joined && (
        <>
          {lookup.preview.workspace_title && (
            <div className="field">
              <div className="label">
                <span>{t("invite.workspace")}</span>
              </div>
              <div className="row-title">{lookup.preview.workspace_title}</div>
            </div>
          )}

          <div className="field">
            <div className="label">
              <span>{t("invite.boards")}</span>
            </div>
            <div className="chips">
              {lookup.preview.board_titles === null ? (
                /* Nothing could look: there is no preview route yet. Not the
                   same as an invite that grants nothing, and saying "those
                   boards have been deleted" here would be a guess dressed as
                   a fact. */
                <span className="hint">{t("invite.noPreview")}</span>
              ) : lookup.preview.board_titles.length === 0 ? (
                <span className="hint">{t("invite.boardsDeleted")}</span>
              ) : (
                lookup.preview.board_titles.map((title, index) => (
                  // Titles are not unique and there is no id to key on - the
                  // preview deliberately carries none - so the position is the
                  // only stable key, and this list never reorders.
                  <span key={`${title}-${index}`} className="chip" aria-pressed>
                    {title}
                  </span>
                ))
              )}
            </div>
          </div>

          {lookup.preview.accepted ? (
            <div className="hint">{t("invite.alreadyUsed")}</div>
          ) : (
            <button
              className="btn btn-primary btn-block"
              /* Disabled only when the preview positively says the link grants
                 nothing. An unknown grant (board_titles null) still offers the
                 join - the server is the one that can actually decide, and
                 refusing here would hide a working invite behind a missing
                 read route. */
              disabled={busy || lookup.preview.board_titles?.length === 0}
              onClick={() => void join()}
            >
              {t("invite.join")}
            </button>
          )}

          {lookup.preview.accepted && (
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
