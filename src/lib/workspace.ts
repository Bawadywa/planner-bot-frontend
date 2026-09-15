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

/* Bumped whenever this identity's MEMBERSHIPS change - a workspace created, or
   an invite accepted - as opposed to which of them is being looked at.
 *
 * The two are genuinely different events and only one of them was modelled.
 * Accepting an invite into a workspace you are already in changes no active id
 * at all, so nothing re-rendered and the boards you were just granted stayed
 * invisible until the app was reloaded. A counter gives those screens something
 * to depend on that changes even when the selection does not. */
let revision = 0;

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
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

  notify();
}

/** Says that the set of workspaces or boards this identity can reach has
 *  changed, so anything listing them should read again.
 *
 *  Called after an invite is accepted, which can add a workspace, add boards
 *  inside one already joined, or both. It carries no payload on purpose: the
 *  screens already know how to fetch, they only needed to be told to. */
export function invalidateWorkspaces(): void {
  revision += 1;
  notify();
}

function workspacesRevision(): number {
  return revision;
}

/** Subscribes a component to workspace switches.
 *
 *  Put the returned id in the dependency list of whatever loads rows, so a
 *  switch reloads the screen the way a language switch re-renders it. */
export function useActiveWorkspace(): ID | null {
  return useSyncExternalStore(subscribe, activeWorkspace, () => null);
}

/** Subscribes a component to membership changes.
 *
 *  Put it in the dependency list of whatever loads workspaces or boards, next
 *  to useActiveWorkspace(). The number itself means nothing - only that it is
 *  different from last time. */
export function useWorkspacesRevision(): number {
  return useSyncExternalStore(subscribe, workspacesRevision, () => 0);
}
