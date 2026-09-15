/* ============================================================================
   The workspace form - one sheet, two jobs.

   Its own file because three callers open it: the switcher in the Boards top
   bar (components/WorkspacePicker.tsx) opens it to create, and the Workspaces
   section in Settings opens it to create OR to rename. Create and rename share
   every line but the verb - same field, same 50-character cap, same failure
   handling - so they are one component with an optional `workspace` rather than
   two that drift apart.

   It reports the row it wrote and lets the caller decide what happens next: the
   picker switches to a newly created workspace, Settings only reloads its list.
   ============================================================================ */

import { useState, type FormEvent } from "react";
import * as api from "../api";
import { Sheet } from "./Sheet";
import { haptic, hapticError } from "../telegram";
import { useT } from "../i18n";
import type { Workspace } from "../types";

interface WorkspaceSheetProps {
  /** The workspace to rename. Omit to create a new one. */
  workspace?: Workspace;
  onClose: () => void;
  onSaved: (workspace: Workspace) => void | Promise<void>;
}

export function WorkspaceSheet({ workspace, onClose, onSaved }: WorkspaceSheetProps) {
  const t = useT();
  const renaming = workspace !== undefined;
  const [title, setTitle] = useState(workspace?.title ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    try {
      const saved = renaming
        ? await api.renameWorkspace(workspace.id, title)
        : await api.createWorkspace(title);
      haptic("medium");
      await onSaved(saved);
    } catch (err) {
      hapticError();
      setError(
        err instanceof Error
          ? err.message
          : t(renaming ? "workspaces.sheet.renameFailed" : "workspaces.sheet.failed"),
      );
      /* Only cleared on the failure path. On success the caller unmounts this,
         and dropping `busy` first would let a double tap post twice. */
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={t(renaming ? "workspaces.sheet.renameTitle" : "workspaces.sheet.title")}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}

        <label className="field">
          <div className="label">
            <span>{t("workspaces.sheet.field")}</span>
            {/* String(50) on Workspace.title */}
            <span className="limit">{title.length}/50</span>
          </div>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={50}
            placeholder={t("workspaces.sheet.placeholder")}
            autoFocus
          />
        </label>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          /* An unchanged name is not a rename. Blocking it keeps a no-op PUT
             off the wire and makes the disabled button say so. */
          disabled={busy || !title.trim() || title.trim() === workspace?.title}
        >
          {t(renaming ? "workspaces.sheet.renameSubmit" : "workspaces.sheet.submit")}
        </button>
      </form>
    </Sheet>
  );
}
