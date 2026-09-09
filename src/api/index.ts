/* ============================================================================
   Data layer - the seam.

   Screens import this module and nothing under it. Each feature is wired to
   either local.ts (this browser's storage) or remote.ts (the FastAPI backend),
   and the table below is the whole switch: when a route lands in
   backend/app/main.py, one line here moves and no screen changes.

   Which half runs at all is config.js: DATA_SOURCE "local" keeps everything in
   the browser, "api" turns on every feature marked served. "api" is ignored
   when it cannot work - no API_BASE, or a launch outside Telegram with no
   initData to sign requests with - because `npm run dev` on a desktop has
   neither, and failing every screen there would make the app untestable off a
   phone.
   ============================================================================ */

import * as local from "./local";
import * as remote from "./remote";
import { DEBUG, dataSource, serverConfigured, unusableReason } from "../lib/http";
import type { Board, ID, Task, User } from "../types";

export { ApiError } from "../lib/http";
export type { TaskInput, CommentView } from "./local";

/* --------------------------------------------------------- what is served -- */

/** True when this launch is talking to the backend for the features below.
 *
 *  Exported so Settings can say so on screen: with boards on the server and
 *  everything else still local, "where does my data live" has two answers and
 *  the user is owed both. */
export const serverBacked = dataSource === "api" && serverConfigured;

if (dataSource === "api" && !serverBacked) {
  console.warn(
    `[planner] DATA_SOURCE is "api" but ${unusableReason()} - using local storage instead.`,
  );
} else if (serverBacked && DEBUG) {
  console.info("[planner] boards and identity are served by the backend");
}

/** Which features the backend can carry today. Flip a false to true once the
 *  routes listed in `missing` below exist. */
const served = {
  identity: serverBacked,
  boards: serverBacked,
  tasks: false,
  comments: false,
  team: false,
  invites: false,
};

export type Feature = keyof typeof served;

/** Whether the UI for a feature should be shown at all.
 *
 *  In local mode: always, because running everything in the browser is what
 *  that mode is for. In api mode: only once the backend can carry it.
 *
 *  The point is not to hide unfinished work, it is to stop the app lying. With
 *  boards coming from the server, a task list still quietly reading and writing
 *  localStorage looks exactly like a task list that works - until the same
 *  board is opened on a second device and it is empty. A feature that is absent
 *  says what is true; one that silently persists nowhere does not.
 *
 *  This is only about features whose local half SUCCEEDS. Board delete stays on
 *  screen in api mode even though it has no route, because it refuses out loud
 *  (501, naming the missing route) instead of pretending - and a visible
 *  refusal is worth more here than a missing button, which reads as a bug. */
export function isAvailable(feature: Feature): boolean {
  return !serverBacked || served[feature];
}

/** What each unserved feature is still waiting for, in the words the UI shows.
 *
 *  Deliberately next to `served`, and read by the screens rather than written
 *  into them: the first version of this lived as a paragraph inside Board.tsx
 *  and was describing a missing foreign key for days after the column landed.
 *  One place to edit, and flipping a flag above retires the sentence with it. */
const missing: Record<Feature, string> = {
  identity: "",
  boards: "",
  tasks:
    "Two things are missing: a route to list a board's tasks (GET /tasks?board_id=), " +
    "and a `done` column to store whether a task is finished.",
  comments:
    "Comments need a table with task_id and author_id, and routes to read and post them.",
  team: "The team list needs a membership table and a route to read it.",
  invites:
    "Invites need a table with a unique token, and routes to mint and redeem one.",
};

/** Why a feature is hidden, or null when it is not. */
export function missingFor(feature: Feature): string | null {
  return served[feature] || !serverBacked ? null : missing[feature];
}

/* --------------------------------------------------------------- identity -- */

/** Confirms the id with the backend, then mirrors the row locally.
 *
 *  Both halves run on purpose. The server's answer is what scopes every later
 *  query; the local copy is what the features still on local.ts read to know
 *  who is acting, and it is also where the display name lives, since the User
 *  model has no columns for one. */
/* Why the launch could not register with the backend, when it could not.
 *
 *  Kept because the consequence shows up somewhere else entirely: every write
 *  route calls resolve_user(), so a failed POST /user turns into "User not
 *  found" on the first board someone tries to create - a 404 that says nothing
 *  about what actually went wrong, two screens away from where it did. */
let signInFailure: string | null = null;

/** The sign-in failure this launch is still living with, or null. */
export function lastSignInError(): string | null {
  return signInFailure;
}

export async function signIn(): Promise<User> {
  if (!served.identity) return local.signIn();

  try {
    const user = await local.signIn(await remote.signIn());
    signInFailure = null;
    return user;
  } catch (err) {
    /* This one call gates the whole shell - App.tsx renders nothing until it
       resolves - so a server that is down or an initData the backend rejects
       must not leave a blank page. The launch falls back to the Telegram
       profile, the app opens, and the failure surfaces where it is actionable:
       an error banner on Boards and a row in Settings. */
    signInFailure = err instanceof Error ? err.message : "POST /user failed";
    console.warn("[planner] POST /user failed, opening with the local identity", err);
    return local.signIn();
  }
}

/** The Telegram profile on its own, with no store consulted at all.
 *
 *  The last resort for a launch where even localStorage refuses to be written -
 *  private mode with site data blocked, or a full quota. The app opens read-only
 *  in effect: every write then fails with its own message. */
export function launchUser(): User {
  const identity = local.launchIdentity();
  return { ...identity, created_at: identity.created_at ?? new Date(0).toISOString() };
}

/* ----------------------------------------------------------------- boards -- */

export const listBoards = served.boards ? remote.listBoards : local.listBoards;
export const createBoard = served.boards ? remote.createBoard : local.createBoard;
export const getBoard = served.boards ? remote.getBoard : local.getBoard;

/* Renaming still has no route, and raises rather than falling back: the local
   store is not where the board lives, so a "successful" rename would be undone
   by the next listBoards(). */
export const renameBoard = served.boards ? remote.renameBoard : local.renameBoard;

/** DELETE /taskboard, then the same sweep locally.
 *
 *  Both halves, because the board's rows are split across the two stores while
 *  tasks are still local: the database cascades its own tasks through
 *  Task.board_id, and this clears the ones that never reached it. Without the
 *  second call they would sit in localStorage forever, invisible and pointing
 *  at a board id that no longer resolves. */
export async function deleteBoard(id: ID): Promise<void> {
  if (!served.boards) return local.deleteBoard(id);
  await remote.deleteBoard(id);
  await local.deleteBoard(id);
}

/* ------------------------------------------------------------------ tasks -- */

export const listTasks = local.listTasks;
export const createTask = local.createTask;
export const updateTask = local.updateTask;
export const deleteTask = local.deleteTask;
export const getTask = local.getTask;

/** GET /tasks - everything on every board this user can open, for the calendar.
 *
 *  Composed rather than delegated: the boards may come from the server while
 *  the tasks are still local, and only this layer knows that. */
export async function listAllTasks(): Promise<Task[]> {
  const boards: Board[] = await listBoards();
  return local.tasksForBoards(boards.map((b) => b.id));
}

/* --------------------------------------------------------------- comments -- */

export const listComments = local.listComments;
export const createComment = local.createComment;
export const deleteComment = local.deleteComment;

/* ------------------------------------------------------------------- team -- */

export const listMembers = local.listMembers;
export const setMemberBoards = local.setMemberBoards;
export const removeMember = local.removeMember;

/* ---------------------------------------------------------------- invites -- */

export const createInvite = local.createInvite;
export const listInvites = local.listInvites;
export const getInvite = local.getInvite;
export const acceptInvite = local.acceptInvite;
export const revokeInvite = local.revokeInvite;

/* ------------------------------------------------------------------ local -- */

/** Wipes the browser store. Still meaningful in api mode - tasks, comments,
 *  team and invites all live there - but it cannot touch anything the backend
 *  holds, which Settings says in as many words. */
export const resetLocalData = local.resetLocalData;
export const storageUsage = local.storageUsage;

/* ----------------------------------------------------------------- status -- */

/** Whether the backend answers /health. False without even asking when this
 *  launch is not talking to a backend at all. */
export async function checkHealth(): Promise<boolean> {
  return serverBacked ? remote.checkHealth() : false;
}

export type { Board, ID, Task, User };
