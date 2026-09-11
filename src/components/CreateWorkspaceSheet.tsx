/* ============================================================================
   The "new workspace" form.

   Its own file because two screens open it: the switcher in the Boards top bar
   (components/WorkspacePicker.tsx) and the Workspaces section in Settings. They
   ask for different things afterwards - the picker switches to what was just
   created, Settings only reloads its list - so the sheet reports the new row
   and lets the caller decide, rather than reaching for the workspace store
   itself.
   ============================================================================ */

import { useState, type FormEvent } from "react";
import * as api from "../api";
import { Sheet } from "./Sheet";
import { haptic, hapticError } from "../telegram";
import { useT } from "../i18n";
import type { Workspace } from "../types";

interface CreateWorkspaceSheetProps {
  onClose: () => void;
  onCreated: (workspace: Workspace) => void | Promise<void>;
}

export function CreateWorkspaceSheet({ onClose, onCreated }: CreateWorkspaceSheetProps) {
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
      const workspace = await api.createWorkspace(title);
      haptic("medium");
      await onCreated(workspace);
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : t("workspaces.sheet.failed"));
      /* Only cleared on the failure path. On success the caller unmounts this,
         and dropping `busy` first would let a double tap post twice. */
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("workspaces.sheet.title")} onClose={onClose}>
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
          disabled={busy || !title.trim()}
        >
          {t("workspaces.sheet.submit")}
        </button>
      </form>
    </Sheet>
  );
}
