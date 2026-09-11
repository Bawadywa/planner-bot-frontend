/* ============================================================================
   The workspace switcher - the button in the middle of the top bar.

   A dropdown rather than a bottom sheet, because it is a change of context and
   not a form: the list is short, the answer is one tap, and anchoring it under
   the button keeps the boards behind it visible so the switch reads as a
   filter rather than a navigation.

   Everything it changes flows through src/lib/workspace.ts. The screens do not
   take a workspace prop - they subscribe to that store and reload - so this
   component can sit in any top bar without the ones around it knowing.
   ============================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api";
import { CreateWorkspaceSheet } from "./CreateWorkspaceSheet";
import { CheckIcon, ChevronDown, PlusIcon } from "./Icons";
import { haptic, pushBack } from "../telegram";
import { useT } from "../i18n";
import { setActiveWorkspace, useActiveWorkspace } from "../lib/workspace";
import type { ID, Workspace } from "../types";

export function WorkspacePicker() {
  const t = useT();
  const active = useActiveWorkspace();

  /* Null whenever the backend carries the list, which it does now - see the
     `workspaces` entry in api/index.ts. Kept rather than deleted because local
     mode still exists and still keeps the list in this browser, and a per-
     device list passing for a shared one is exactly what this line prevents.
     Resolved on every render rather than once at import: it is a translated
     sentence, and useT() above is what re-runs this when the language changes
     under it. */
  const localOnly = api.missingFor("workspaces");

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setWorkspaces(await api.listWorkspaces());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("workspaces.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Repairs the stored choice against the list.
   *
   *  It can name a workspace that is gone - deleted on another device, or
   *  minted in the other data source, since local ids are uuids and server ids
   *  are ints. Left alone it matches no board at all, which looks like every
   *  board was deleted rather than like a stale setting. Also what picks the
   *  first workspace on a launch that has never chosen one. */
  useEffect(() => {
    if (workspaces.length > 0 && !workspaces.some((w) => w.id === active)) {
      setActiveWorkspace(workspaces[0].id);
    }
  }, [workspaces, active]);

  // Tap anywhere else, Escape, or Telegram's back arrow closes the menu.
  useEffect(() => {
    if (!open) return;

    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    const pop = pushBack(() => setOpen(false));

    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      pop();
    };
  }, [open]);

  const current = workspaces.find((w) => w.id === active) ?? workspaces[0];

  function choose(id: ID) {
    haptic();
    setActiveWorkspace(id);
    setOpen(false);
  }

  return (
    <div className="ws-picker" ref={root}>
      <button
        type="button"
        className="ws-current"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("workspaces.switch")}
        onClick={() => {
          haptic();
          setOpen((was) => !was);
        }}
      >
        {/* An ellipsis while the first list is in flight, so the bar keeps its
            height instead of the title popping in and shifting the row. */}
        <span className="ws-name">{current?.title ?? "…"}</span>
        <ChevronDown />
      </button>

      {open && (
        <div className="ws-menu" role="menu">
          <div className="ws-menu-head">{t("workspaces.heading")}</div>

          {error && <div className="ws-menu-note error">{error}</div>}

          <div className="ws-menu-list">
            {workspaces.map((workspace) => {
              const chosen = workspace.id === current?.id;
              return (
                <button
                  key={workspace.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={chosen}
                  className={`ws-item${chosen ? " is-active" : ""}`}
                  onClick={() => choose(workspace.id)}
                >
                  <span className="ws-item-title">{workspace.title}</span>
                  {chosen && <CheckIcon />}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            role="menuitem"
            className="ws-item ws-new"
            onClick={() => {
              haptic();
              setOpen(false);
              setCreating(true);
            }}
          >
            <PlusIcon size={16} />
            <span className="ws-item-title">{t("workspaces.new")}</span>
          </button>

          {/* Says where the list actually lives, rather than letting a
              per-device setting pass for a shared one. */}
          {localOnly && <div className="ws-menu-note">{localOnly}</div>}
        </div>
      )}

      {creating && (
        <CreateWorkspaceSheet
          onClose={() => setCreating(false)}
          onCreated={async (workspace) => {
            setCreating(false);
            // Switch to it first: the point of creating one is to be in it, and
            // the boards behind the sheet should already be its own.
            setActiveWorkspace(workspace.id);
            await load();
          }}
        />
      )}
    </div>
  );
}
