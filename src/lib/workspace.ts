/* ============================================================================
   Which workspace the app is looking at.

   A module-level store rather than React state or a context, for the same
   reason the language is one (src/i18n/index.ts): the data layer reads it from
   outside any component - listBoards() in api/index.ts scopes its answer by it
   - and a context cannot be reached from there. React subscribes through
   useActiveWorkspace() below.

   The choice is per DEVICE. It is a view setting, not a row: the backend has
   User.workspace_id, but no route reads or writes it, and pinning the picker
   to a column nothing can update would freeze it on whatever the sign-up
   happened to create.
   ============================================================================ */

import { useSyncExternalStore } from "react";
import type { ID } from "../types";

const STORE_KEY = "planner.workspace.v1";

function read(): ID | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    // Private mode with site data blocked. The choice then holds for this
    // launch and no longer, which is better than refusing to switch at all.
    return null;
  }
}

let active: ID | null = read();

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The workspace every board and task read is scoped to, or null before the
 *  first list has resolved. Safe to call from anywhere, module scope included. */
export function activeWorkspace(): ID | null {
  return active;
}

/** Switches workspaces and re-renders everything subscribed below.
 *
 *  Also called by the picker with the first workspace in the list when the
 *  stored id names one that no longer exists - a workspace deleted on another
 *  device, or a store carried across a switch between local and api mode,
 *  where the two never share ids. Without that repair the id would match
 *  nothing and every board would look deleted. */
export function setActiveWorkspace(id: ID | null): void {
  if (id === active) return;
  active = id;

  try {
    if (id) localStorage.setItem(STORE_KEY, id);
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* nothing to do - the switch still holds in memory for this launch */
  }

  for (const listener of listeners) listener();
}

/** Subscribes a component to workspace switches.
 *
 *  Put the returned id in the dependency list of whatever loads rows, so a
 *  switch reloads the screen the way a language switch re-renders it. */
export function useActiveWorkspace(): ID | null {
  return useSyncExternalStore(subscribe, activeWorkspace, () => null);
}
