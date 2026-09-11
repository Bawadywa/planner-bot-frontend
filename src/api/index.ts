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
import { ApiError, DEBUG, dataSource, serverConfigured, unusableReason } from "../lib/http";
import { activeWorkspace, setActiveWorkspace } from "../lib/workspace";
import { t, type Key } from "../i18n";
import type { Board, ID, Task, User, Workspace } from "../types";

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
  tasks: serverBacked,
  /* Completion has its own entry because it arrived on its own: the column, the
     schema field and the two handler assignments landed a step after the rest
     of a task did, and for that step the checkbox was hidden while everything
     around it worked. Kept as a separate flag rather than folded back into
     `tasks` - it is the finest grain the hiding rule has needed, and the next
     column to arrive late will want the same treatment. */
  taskDone: serverBacked,
  /* On. backend/app/main.py serves POST, PUT, DELETE /comment and
     GET /comments?task_id=, and CommentRead carries id, user_id and created_at
     now, so a thread maps cleanly.

     What it still does not carry is anything about the AUTHOR beyond an id -
     the User model has no name columns at all - so every comment but your own
     renders under a generic word. See toComment() in remote.ts. */
  comments: serverBacked,
  /* On. The two schema fields this was waiting for have landed: TaskBoardRead
     returns workspace_id and TaskBoardCreate accepts one, so the server can
     finally say which boards belong to a workspace - and GET /task_boards now
     REQUIRES the workspace rather than merely allowing it.

     What changed underneath is bigger than the flag. Membership is a real
     table (workspacemembers, keyed by workspace_id + user_id), so the list is
     no longer "workspaces you own" but "workspaces you were added to", and the
     choice is shared across devices instead of remembered per browser. The
     local assignment map is dead in api mode; it stays for local mode, which
     has no server to carry the column. */
  workspaces: serverBacked,
  /* The member list: which people share a workspace_id. Its own flag, because
     it needs a route that does not exist at all, rather than two fields on one
     that does. */
  workspace: false,
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
const missing: Record<Feature, Key | null> = {
  identity: null,
  boards: null,
  tasks: null,
  taskDone: "missing.taskDone",
  comments: "missing.comments",
  workspaces: null,
  workspace: "missing.workspace",
  invites: "missing.invites",
};

/** Why a feature is hidden, or null when it is not.
 *
 *  Resolved through the dictionary at CALL time rather than stored as a string:
 *  the sentence is on screen while someone switches language in Settings, and a
 *  value captured at import would still be in the old one. */
export function missingFor(feature: Feature): string | null {
  const key = missing[feature];
  if (!key || served[feature] || !serverBacked) return null;
  return t(key);
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

/* ------------------------------------------------------------- workspaces -- */

/* The picker's two calls. Listing seeds a first workspace when there is none,
   so the picker is never empty and createBoard() below always has somewhere to
   put a board - the same guarantee POST /user gives server-side by creating one
   at sign-up.

   Renaming and deleting are deliberately absent: remote.ts has both, but
   deleting a workspace takes its boards and their tasks with it
   (cascade="all, delete-orphan" on Workspace.task_boards), and that is a
   confirm-and-explain flow rather than a line on a dropdown. */
export const listWorkspaces = served.workspaces
  ? remote.listWorkspaces
  : local.listWorkspaces;
export const createWorkspace = served.workspaces
  ? remote.createWorkspace
  : local.createWorkspace;

/** The workspace board reads are scoped to, resolving one if nothing has
 *  chosen yet.
 *
 *  Needed because GET /task_boards REQUIRES a workspace_id - there is no "all
 *  boards" answer to fall back on - and the board screen's first load can
 *  easily beat the picker's first list to it. Resolving here rather than
 *  giving up keeps that race off the screen: without it the first paint is an
 *  empty board list, which looks exactly like an account that has no boards.
 *
 *  The choice is written back through setActiveWorkspace() rather than kept
 *  here, so the picker in the top bar and every subscribed screen agree about
 *  which workspace is being shown. */
async function currentWorkspace(): Promise<ID | null> {
  const active = activeWorkspace();
  if (active) return active;

  const [first] = await listWorkspaces();
  if (!first) return null;

  setActiveWorkspace(first.id);
  return first.id;
}

/* ----------------------------------------------------------------- boards -- */

/** The boards in the workspace the picker is on.
 *
 *  The two halves scope themselves differently and neither can do the other's
 *  job, which is why this branches rather than swapping one function for
 *  another. The server filters by workspace AND by board membership, in SQL,
 *  and refuses to answer at all without a workspace. The local store has no
 *  membership table and holds rows that predate the picker, so scopeBoards()
 *  reconciles those against the assignment map.
 *
 *  In local mode an unset workspace still shows every board rather than none,
 *  for the reason it always did: a list that is empty because a choice has not
 *  been made yet looks exactly like one that failed to load. In api mode that
 *  case cannot arise - currentWorkspace() has resolved one by here, and a null
 *  means the account genuinely has no workspaces at all. */
export async function listBoards(): Promise<Board[]> {
  if (!served.boards) {
    const boards = await local.listBoards();
    const workspace = activeWorkspace();
    return workspace ? local.scopeBoards(boards, workspace) : boards;
  }

  const workspace = await currentWorkspace();
  return workspace ? remote.listBoards(workspace) : [];
}

/** Creates a board in the workspace the picker is on.
 *
 *  Nothing is recorded locally afterwards any more: the server stamps
 *  workspace_id on the row itself, and TaskBoardCreate has the field to send
 *  it. The assignment map is only still consulted by local mode, where
 *  createBoard() stamps the column itself. */
export async function createBoard(title: string): Promise<Board> {
  if (!served.boards) return local.createBoard(title);

  const workspace = await currentWorkspace();
  /* No workspace at all. POST /task_board would answer 422 about a missing
     field; this names the choice that is actually missing instead. */
  if (!workspace) throw new ApiError(422, t("api.noWorkspace"));

  return remote.createBoard(title, workspace);
}

/** One board, read out of the workspace it lives in.
 *
 *  Same shape as listBoards() and for the same reason - there is no route for
 *  a single board, so remote.getBoard() filters the list, and the list needs a
 *  workspace. */
export async function getBoard(id: ID): Promise<Board> {
  if (!served.boards) return local.getBoard(id);

  const workspace = await currentWorkspace();
  if (!workspace) throw new ApiError(404, t("api.boardNotFound"));
  return remote.getBoard(id, workspace);
}

/* Renaming still has no route, and raises rather than falling back: the local
   store is not where the board lives, so a "successful" rename would be undone
   by the next listBoards(). */
export const renameBoard = served.boards ? remote.renameBoard : local.renameBoard;

/** DELETE /task_board, then the same sweep locally.
 *
 *  Both halves, because a browser that has ever run in local mode still holds
 *  rows under the same board id: the database cascades its own tasks through
 *  Task.task_board_id, and this clears the ones that never reached it. Without
 *  the second call they would sit in localStorage forever, invisible and
 *  pointing at a board id that no longer resolves.
 *
 *  Worth knowing about the server half: the route matches on owner_id and
 *  answers 200 either way, so an invited member deleting a board they do not
 *  own gets a silent no-op that looks exactly like success until the list
 *  reloads unchanged. */
export async function deleteBoard(id: ID): Promise<void> {
  if (!served.boards) return local.deleteBoard(id);
  await remote.deleteBoard(id);
  await local.deleteBoard(id);
}

/* ------------------------------------------------------------------ tasks -- */

export const listTasks = served.tasks ? remote.listTasks : local.listTasks;
export const createTask = served.tasks ? remote.createTask : local.createTask;
export const updateTask = served.tasks ? remote.updateTask : local.updateTask;
export const deleteTask = served.tasks ? remote.deleteTask : local.deleteTask;
export const getTask = served.tasks ? remote.getTask : local.getTask;

/** Every task on every board this user can open, for the calendar.
 *
 *  Composed rather than delegated, because there is no route for it: the server
 *  lists tasks one board at a time, so this fans out over the board list. That
 *  is N+1 requests, which is fine at the handful of boards one person keeps and
 *  would not be at a hundred - a GET /tasks with no board_id would collapse it.
 *
 *  In local mode the same shape reads one store, hence the branch rather than
 *  two implementations. */
export async function listAllTasks(): Promise<Task[]> {
  const boards: Board[] = await listBoards();
  if (!served.tasks) return local.tasksForBoards(boards.map((b) => b.id));

  const perBoard = await Promise.all(boards.map((b) => remote.listTasks(b.id)));
  return perBoard.flat();
}

/* --------------------------------------------------------------- comments -- */

/* Four calls, one flag. The remote half targets POST/PUT/DELETE /comment as
   main.py already declares them, plus the GET /comments?task_id= it does not -
   reading a thread back is the piece with no server-side equivalent at all, so
   there was nothing to point the list at but the route that has to exist. */
export const listComments = served.comments ? remote.listComments : local.listComments;
export const createComment = served.comments ? remote.createComment : local.createComment;
export const updateComment = served.comments ? remote.updateComment : local.updateComment;
export const deleteComment = served.comments ? remote.deleteComment : local.deleteComment;

/* -------------------------------------------------------------- workspace -- */

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

/** Wipes the browser store. Still meaningful in api mode - the workspace list
 *  and invites live there - but it cannot touch anything the backend holds,
 *  which Settings says in as many words. */
export const resetLocalData = local.resetLocalData;
export const storageUsage = local.storageUsage;

/* ----------------------------------------------------------------- status -- */

/** Whether the backend answers /health. False without even asking when this
 *  launch is not talking to a backend at all. */
export async function checkHealth(): Promise<boolean> {
  return serverBacked ? remote.checkHealth() : false;
}

export type { Board, ID, Task, User, Workspace };
