/* ============================================================================
   Data layer - localStorage half.

   Every function here is async and named after the HTTP endpoint it stands in
   for (the endpoint is in the comment above each one), and each has a twin of
   the same signature in remote.ts. api/index.ts picks between them per feature,
   so a feature moves to the backend by flipping one flag there - no screen is
   touched, and the ones the backend has no routes for yet keep working.

   Nothing here is a security boundary. It is one browser's storage: the owner
   of the device can edit every row in it with devtools. The checks below exist
   to keep the shapes honest, not to enforce anything.
   ============================================================================ */

import { tgUser } from "../telegram";
import { displayName } from "../lib/user";
import { ApiError } from "../lib/http";
import {
  byUrgency,
  DEFAULT_PRIORITY,
  priorityOf,
  toPriorityCode,
  type PriorityCode,
} from "../lib/priority";
import type { Board, Comment, ID, Invite, Member, Task, User } from "../types";

const DB_KEY = "planner.db.v1";
const CURRENT_USER_KEY = "planner.current-user.v1";

interface Db {
  users: User[];
  boards: Board[];
  tasks: Task[];
  comments: Comment[];
  members: Member[];
  invites: Invite[];
}

const EMPTY_DB: Db = {
  users: [],
  boards: [],
  tasks: [],
  comments: [],
  members: [],
  invites: [],
};

/* ---------------------------------------------------------------- storage -- */

function readDb(): Db {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return structuredClone(EMPTY_DB);
    const db = { ...structuredClone(EMPTY_DB), ...(JSON.parse(raw) as Partial<Db>) };
    // Tasks written before priority existed have no priority_code, and the type
    // says they do. Filling it on read keeps that honest without a migration
    // step, and costs one pass over rows that are already in memory.
    for (const task of db.tasks) {
      if (task.priority_code == null) task.priority_code = DEFAULT_PRIORITY;
    }
    return db;
  } catch {
    // Corrupt JSON, or storage blocked entirely (private mode). Start clean
    // rather than leaving every screen throwing.
    return structuredClone(EMPTY_DB);
  }
}

function writeDb(db: Db): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // The usual cause is the ~5 MB quota, and the usual reason for hitting it
    // is attached images stored as data: URLs.
    throw new ApiError(
      507,
      "Out of local storage. Remove some task images, or clear the app data in Settings.",
    );
  }
}

function uid(): ID {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

/* --------------------------------------------------------------- identity -- */

/** Which user this browser is acting as.
 *
 *  This is NOT a session and it authenticates nobody. Telegram already did that
 *  before the page loaded - the client signs initData with the bot token - so
 *  all that is kept here is which id the launch carried, to scope the mock's
 *  rows. When the data layer talks to the backend instead, even this goes: the
 *  id is recovered from the verified initData on every request, by the same
 *  verify_headers() that backend/app/main.py already runs. */
function readCurrentUserId(): ID | null {
  try {
    return localStorage.getItem(CURRENT_USER_KEY);
  } catch {
    return null;
  }
}

function writeCurrentUserId(id: ID): void {
  try {
    localStorage.setItem(CURRENT_USER_KEY, id);
  } catch {
    /* storage blocked - signIn() just re-derives it on the next launch */
  }
}

function requireUser(): User {
  const id = readCurrentUserId();
  const user = id ? readDb().users.find((u) => u.id === id) : null;
  if (!user) throw new ApiError(401, "No Telegram identity for this launch");
  return user;
}

/** A user without the row's own timestamp - what a launch knows before any
 *  store has been consulted. */
export type Identity = Omit<User, "created_at"> & { created_at?: string };

/** The identity to run as.
 *
 *  Outside Telegram - `npm run dev` in a desktop browser - nothing signs a
 *  user, and refusing to start there would make the app untestable outside a
 *  phone. So one fixed local identity stands in. It never leaves the browser,
 *  and a real Telegram launch always wins over it. */
export function launchIdentity(): Identity {
  if (tgUser) {
    return {
      id: String(tgUser.id),
      first_name: tgUser.first_name,
      last_name: tgUser.last_name ?? null,
      username: tgUser.username ?? null,
      photo_url: tgUser.photo_url ?? null,
    };
  }
  return {
    id: "local-preview",
    first_name: "Local",
    last_name: "Preview",
    username: null,
    photo_url: null,
  };
}

/** Adopts rows left behind by the email-account build.
 *
 *  Identity used to be a random uuid minted at sign-up; it is the Telegram user
 *  id now. Every board, comment and invite created before the switch still
 *  points at that dead uuid, so listBoards() filters them all out and the app
 *  looks freshly wiped - with no boards, even the invite button greys out.
 *
 *  A legacy user row is the one with no first_name, since the field did not
 *  exist before. Legacy member rows were keyed by email and have no user_id at
 *  all, so they are dropped here and signIn() rebuilds the owner row.
 *
 *  Runs on every launch but does nothing once there is no legacy row left, so
 *  it can stay until the mock itself goes. */
function adoptLegacyRows(db: Db, owner: ID): void {
  const legacy = new Set(db.users.filter((u) => !u.first_name).map((u) => u.id));
  if (legacy.size === 0) return;

  db.users = db.users.filter((u) => !legacy.has(u.id));
  db.members = db.members.filter((m) => Boolean(m.user_id));

  for (const board of db.boards) {
    if (legacy.has(board.owner_id)) board.owner_id = owner;
  }
  for (const comment of db.comments) {
    if (legacy.has(comment.author_id)) comment.author_id = owner;
  }
  for (const invite of db.invites) {
    if (legacy.has(invite.created_by)) invite.created_by = owner;
    if (invite.accepted_by && legacy.has(invite.accepted_by)) {
      invite.accepted_by = owner;
    }
  }
}

/** POST /user
 *
 *  Upsert by Telegram id, which is what create_user() in backend/app/main.py
 *  already does against the verified id. Called once on launch in place of a
 *  sign-in screen; the profile fields are refreshed every time, because someone
 *  can rename themselves in Telegram and the app should follow.
 *
 *  `confirmed` is the row the backend just returned, when there is one. It is
 *  mirrored here rather than replacing this call, because the features the
 *  backend has no routes for yet - tasks, comments, team, invites - still read
 *  the local user row to know who is acting. */
export async function signIn(confirmed?: Identity): Promise<User> {
  const identity = confirmed ?? launchIdentity();
  const db = readDb();

  adoptLegacyRows(db, identity.id);

  const existing = db.users.find((u) => u.id === identity.id);
  const user: User = existing ?? {
    ...identity,
    created_at: identity.created_at ?? now(),
  };

  if (existing) {
    // created_at is the row's own, never the caller's - an absent one here
    // would otherwise blank a timestamp the row already has.
    const { created_at: _ignored, ...profile } = identity;
    Object.assign(existing, profile);
  } else {
    db.users.push(user);
    // The first identity to open the app on this device owns the team.
    if (!db.members.some((m) => m.role === "owner")) {
      db.members.push({
        id: uid(),
        user_id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        role: "owner",
        status: "active",
        board_ids: [],
        created_at: now(),
      });
    }
  }

  writeDb(db);
  writeCurrentUserId(user.id);
  return user;
}

/* ----------------------------------------------------------------- boards -- */

/** GET /boards */
export async function listBoards(): Promise<Board[]> {
  const user = requireUser();
  const db = readDb();
  const invited = new Set(
    db.members.filter((m) => m.user_id === user.id).flatMap((m) => m.board_ids),
  );
  return db.boards
    .filter((b) => b.owner_id === user.id || invited.has(b.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** POST /boards */
export async function createBoard(title: string): Promise<Board> {
  const user = requireUser();
  const clean = title.trim();
  if (!clean) throw new ApiError(422, "Title required");
  if (clean.length > 30) throw new ApiError(422, "Title is limited to 30 characters");

  const db = readDb();
  const board: Board = {
    id: uid(),
    title: clean,
    owner_id: user.id,
    created_at: now(),
  };
  db.boards.push(board);
  writeDb(db);
  return board;
}

/** PATCH /boards/{id} */
export async function renameBoard(id: ID, title: string): Promise<Board> {
  const clean = title.trim();
  if (!clean) throw new ApiError(422, "Title required");
  const db = readDb();
  const board = db.boards.find((b) => b.id === id);
  if (!board) throw new ApiError(404, "Board not found");
  board.title = clean.slice(0, 30);
  writeDb(db);
  return board;
}

/** DELETE /boards/{id} - cascades the way ondelete="CASCADE" will. */
export async function deleteBoard(id: ID): Promise<void> {
  const db = readDb();
  const taskIds = new Set(db.tasks.filter((t) => t.board_id === id).map((t) => t.id));
  db.boards = db.boards.filter((b) => b.id !== id);
  db.tasks = db.tasks.filter((t) => t.board_id !== id);
  db.comments = db.comments.filter((c) => !taskIds.has(c.task_id));
  db.members = db.members.map((m) => ({
    ...m,
    board_ids: m.board_ids.filter((b) => b !== id),
  }));
  writeDb(db);
}

/** GET /boards/{id} */
export async function getBoard(id: ID): Promise<Board> {
  const board = readDb().boards.find((b) => b.id === id);
  if (!board) throw new ApiError(404, "Board not found");
  return board;
}

/* ------------------------------------------------------------------ tasks -- */

export interface TaskInput {
  title: string;
  description: string;
  deadline: string | null;
  image: string | null;
  priority_code: PriorityCode;
}

/** GET /boards/{board_id}/tasks */
export async function listTasks(boardId: ID): Promise<Task[]> {
  return readDb()
    .tasks.filter((t) => t.board_id === boardId)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1; // open work first
      // Then soonest deadline; tasks with no deadline sink to the bottom.
      // Deadline outranks priority on purpose - something due tomorrow is more
      // urgent than a "high" with no date - so priority only breaks the tie,
      // which for undated tasks is every comparison.
      const ad = a.deadline ?? "9999-12-31";
      const bd = b.deadline ?? "9999-12-31";
      return (
        ad.localeCompare(bd) ||
        byUrgency(priorityOf(a.priority_code).code, priorityOf(b.priority_code).code) ||
        a.created_at.localeCompare(b.created_at)
      );
    });
}

/** GET /tasks - every task on the given boards, for the calendar.
 *
 *  The board list is passed in rather than read here, because in api mode the
 *  boards come from the server while the tasks are still local. */
export async function tasksForBoards(boardIds: ID[]): Promise<Task[]> {
  const visible = new Set(boardIds);
  return readDb().tasks.filter((t) => visible.has(t.board_id));
}

/** POST /boards/{board_id}/tasks */
export async function createTask(boardId: ID, input: TaskInput): Promise<Task> {
  requireUser();
  const title = input.title.trim();
  if (!title) throw new ApiError(422, "Title required");

  const db = readDb();
  if (!db.boards.some((b) => b.id === boardId))
    throw new ApiError(404, "Board not found");

  const task: Task = {
    id: uid(),
    board_id: boardId,
    title: title.slice(0, 30),
    description: input.description.trim().slice(0, 100),
    deadline: input.deadline || null,
    image: input.image,
    done: false,
    priority_code: toPriorityCode(input.priority_code),
    created_at: now(),
  };
  db.tasks.push(task);
  writeDb(db);
  return task;
}

/** PATCH /tasks/{id} */
export async function updateTask(
  id: ID,
  patch: Partial<Omit<Task, "id" | "board_id" | "created_at">>,
): Promise<Task> {
  const db = readDb();
  const task = db.tasks.find((t) => t.id === id);
  if (!task) throw new ApiError(404, "Task not found");
  Object.assign(task, patch);
  task.title = task.title.slice(0, 30);
  task.description = task.description.slice(0, 100);
  writeDb(db);
  return task;
}

/** DELETE /tasks/{id} */
export async function deleteTask(id: ID): Promise<void> {
  const db = readDb();
  db.tasks = db.tasks.filter((t) => t.id !== id);
  db.comments = db.comments.filter((c) => c.task_id !== id);
  writeDb(db);
}

/** GET /tasks/{id} */
export async function getTask(id: ID): Promise<Task> {
  const task = readDb().tasks.find((t) => t.id === id);
  if (!task) throw new ApiError(404, "Task not found");
  return task;
}

/* --------------------------------------------------------------- comments -- */

export interface CommentView extends Comment {
  author_name: string;
}

/** GET /tasks/{task_id}/comments - joined with the author the way the `author`
 *  relationship on the Comment model will be. */
export async function listComments(taskId: ID): Promise<CommentView[]> {
  const db = readDb();
  const byId = new Map(db.users.map((u) => [u.id, displayName(u)]));
  return db.comments
    .filter((c) => c.task_id === taskId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((c) => ({ ...c, author_name: byId.get(c.author_id) ?? "Unknown" }));
}

/** POST /tasks/{task_id}/comments */
export async function createComment(
  taskId: ID,
  content: string,
  image: string | null = null,
): Promise<Comment> {
  const user = requireUser();
  const clean = content.trim();
  if (!clean && !image) throw new ApiError(422, "Write something first");

  const db = readDb();
  const comment: Comment = {
    id: uid(),
    task_id: taskId,
    content: clean.slice(0, 100),
    image,
    author_id: user.id,
    created_at: now(),
  };
  db.comments.push(comment);
  writeDb(db);
  return comment;
}

/** DELETE /comments/{id} */
export async function deleteComment(id: ID): Promise<void> {
  const db = readDb();
  db.comments = db.comments.filter((c) => c.id !== id);
  writeDb(db);
}

/* ------------------------------------------------------------------- team -- */

/** GET /team */
export async function listMembers(): Promise<Member[]> {
  requireUser();
  return readDb().members.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** PATCH /team/{id} */
export async function setMemberBoards(id: ID, boardIds: ID[]): Promise<Member> {
  const db = readDb();
  const member = db.members.find((m) => m.id === id);
  if (!member) throw new ApiError(404, "Member not found");
  member.board_ids = boardIds;
  writeDb(db);
  return member;
}

/** DELETE /team/{id} */
export async function removeMember(id: ID): Promise<void> {
  const db = readDb();
  const member = db.members.find((m) => m.id === id);
  if (member?.role === "owner") throw new ApiError(403, "The owner cannot be removed");
  db.members = db.members.filter((m) => m.id !== id);
  writeDb(db);
}

/* ---------------------------------------------------------------- invites -- */

/** URL-safe, ~96 bits of entropy, namespaced so telegram.ts can tell an invite
 *  start_param apart from any other deep link the app grows later.
 *
 *  Real tokens get minted server-side; this only has to be unguessable enough
 *  that a demo link is not a shared secret sitting in a chat log. */
function inviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `inv_${b64}`;
}

/** POST /invites */
export async function createInvite(boardIds: ID[]): Promise<Invite> {
  const user = requireUser();
  if (boardIds.length === 0) throw new ApiError(422, "Pick at least one board");

  const db = readDb();
  const invite: Invite = {
    id: uid(),
    token: inviteToken(),
    board_ids: boardIds,
    created_by: user.id,
    created_at: now(),
    accepted_by: null,
    accepted_at: null,
  };
  db.invites.push(invite);
  writeDb(db);
  return invite;
}

/** GET /invites - newest first, unaccepted ones on top. */
export async function listInvites(): Promise<Invite[]> {
  requireUser();
  return readDb().invites.sort((a, b) => {
    if (!a.accepted_at !== !b.accepted_at) return a.accepted_at ? 1 : -1;
    return b.created_at.localeCompare(a.created_at);
  });
}

/** GET /invites/{token}
 *
 *  Null rather than a 404 throw, because "no such token" is a normal outcome
 *  here, not a failure: the store is this browser's localStorage, so a link
 *  opened on the recipient's phone can never resolve. The accept screen says so
 *  in as many words instead of showing an error. */
export async function getInvite(token: string): Promise<Invite | null> {
  return readDb().invites.find((i) => i.token === token) ?? null;
}

/** POST /invites/{token}/accept
 *
 *  Single-use: the token is spent by the first person through it. Accepting an
 *  invite you created yourself is allowed on purpose - on one device that is
 *  the only way to see the round trip at all. */
export async function acceptInvite(token: string): Promise<Invite> {
  const user = requireUser();

  const db = readDb();
  const invite = db.invites.find((i) => i.token === token);
  if (!invite) throw new ApiError(404, "That invite link is no longer valid");
  if (invite.accepted_at) throw new ApiError(409, "That invite has already been used");

  invite.accepted_by = user.id;
  invite.accepted_at = now();

  // Mirrors the membership row the backend would write, so the Team list
  // reflects the accept rather than staying empty.
  const existing = db.members.find((m) => m.user_id === user.id);
  if (existing) {
    const merged = new Set([...existing.board_ids, ...invite.board_ids]);
    existing.board_ids = [...merged];
    existing.status = "active";
  } else {
    db.members.push({
      id: uid(),
      user_id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      role: "member",
      status: "active",
      board_ids: invite.board_ids,
      created_at: now(),
    });
  }

  writeDb(db);
  return invite;
}

/** DELETE /invites/{id} */
export async function revokeInvite(id: ID): Promise<void> {
  requireUser();
  const db = readDb();
  db.invites = db.invites.filter((i) => i.id !== id);
  writeDb(db);
}

/* ------------------------------------------------------------------ local -- */

/** Wipes the mock database. No endpoint equivalent - this only exists while
 *  the data lives in the browser.
 *
 *  The current-user key goes too, but that only forces the next launch to
 *  re-derive the identity from Telegram; it cannot sign anyone out. */
export async function resetLocalData(): Promise<void> {
  try {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
  } catch {
    /* nothing we can do if storage is blocked */
  }
}

/** Rough footprint of the stored database, shown in Settings so the ~5 MB
 *  quota is visible before it is hit. */
export function storageUsage(): { bytes: number; label: string } {
  let bytes = 0;
  try {
    bytes = (localStorage.getItem(DB_KEY) ?? "").length * 2; // UTF-16 code units
  } catch {
    /* ignore */
  }
  const label =
    bytes > 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} KB`;
  return { bytes, label };
}
