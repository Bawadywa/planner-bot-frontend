/* ============================================================================
   Data layer - backend half.

   One function per endpoint that backend/app/main.py actually serves today, and
   an explicit refusal for the ones it does not. Every function is the twin of
   the one with the same name in local.ts: same arguments, same return shape, so
   api/index.ts can swap them per feature without a screen noticing.

   Endpoints this file uses, exactly as main.py declares them:

     POST   /user        -> the User row for the verified Telegram id
     GET    /workspaces  -> the Workspace rows this identity is a member of
     POST   /workspace   -> the Workspace row, from {title}
     PUT    /workspace   -> the updated Workspace row
     DELETE /workspace   -> {id} in the body
     GET    /task_boards -> list[TaskBoardRead], filtered by ?workspace_id
     POST   /task_board  -> the TaskBoard row, from {workspace_id, title}
     DELETE /task_board  -> {id} in the body
     GET    /tasks       -> list[TaskRead], filtered by ?task_board_id
     GET    /task        -> one TaskRead, by ?id
     POST   /task        -> the created TaskRead
     PUT    /task        -> the updated TaskRead, every field replaced
     DELETE /task        -> {id} in the body
     GET    /comments    -> list[CommentRead], filtered by ?task_id
     POST   /comment     -> the created CommentRead
     PUT    /comment     -> the updated CommentRead, content and image replaced
     DELETE /comment     -> {id} in the body
     POST   /invite      -> the Invite row, from one flat InviteCreate body
     GET    /invite      -> the Invite row for ?token=, for a non-member
     POST   /invite/accept -> the Invite row, from {token} plus four ignored fields
     DELETE /invite      -> {id} in the body
     GET    /health      -> 200, empty body

   Workspaces are served now. Membership is a real table - workspacemembers,
   keyed (workspace_id, user_id) - so GET /workspaces answers with the
   workspaces this identity was ADDED to rather than the ones it owns, and
   GET /task_boards takes the workspace as a REQUIRED query parameter. That is
   why listBoards() and createBoard() below take a workspace id where their
   local.ts twins take none: the server will not answer without one.

   What GET /task_boards no longer does is CHECK anything. It returns every
   board in the workspace to any caller who knows the id - no workspace
   membership test, no taskboardmembers filter (main.py marks both spots
   `fix user_id not used (not safe)`). The invite preview below leans on that
   to name boards; nothing else here should, and it is worth closing.

   CommentRead now carries id, user_id and created_at, so a thread maps
   cleanly. The shape guard in listComments() stays as a tripwire rather than a
   live workaround - it is what turns the next schema change into a named error
   instead of an empty thread.

   Invites are half-served: the three write routes above exist, the two reads
   do not. What that costs is in the invites section below, gap by gap - a
   token minted client-side because InviteCreate asks for one, a Settings list
   that stays empty, and an accept screen that cannot say what a link grants
   before it is redeemed. All five are deletions here once the server side
   moves.

   The member list still has no route at all and stays on the local store.
   `missing()` below is what a UI action with a local twin but no server route
   raises instead - it must not silently succeed against a copy the server will
   hand back again on the next load.
   ============================================================================ */

import { t } from "../i18n";
import { tgUser } from "../telegram";
import {
  ApiError,
  asId,
  asIso,
  asRaw,
  asString,
  DEBUG,
  get,
  post,
  request,
  toNaiveUtc,
  type Raw,
} from "../lib/http";
import { toPriorityCode } from "../lib/priority";
import { boardOrder } from "../lib/taskOrder";
import type {
  Board,
  Comment,
  CommentAuthor,
  ID,
  Invite,
  InvitePreview,
  Task,
  Workspace,
} from "../types";
import type { CommentView, Identity, TaskInput } from "./local";

/** Raised for a UI action the backend has no route for. 501 rather than 404:
 *  the resource exists, the verb does not. The screens already show
 *  `err.message`, so it names the route that would fix it. */
function missing(route: string): never {
  throw new ApiError(501, t("api.noRoute", { route }));
}

/** Ids are opaque strings up here and integers in the database, so anything
 *  going back the other way has to be one.
 *
 *  A non-numeric id is not a bad request, it is a board minted in local mode
 *  and still sitting in this browser's store - `null` would go up as the id and
 *  match nothing, which looks like a delete that quietly did nothing. */
function numericId(id: ID): number {
  const n = Number(id);
  if (!Number.isInteger(n)) throw new ApiError(422, t("api.localRow"));
  return n;
}

/* --------------------------------------------------------------- identity -- */

/* The id the server confirmed for this launch. No route takes it as a query
   parameter any more - every one of them reads it out of the signed initData -
   but the mappers below still need it: it is the owner a row falls back to
   when the schema does not carry one, and what decides whether a comment is
   yours. signIn() runs before the first screen renders (see App.tsx), so by
   the time anything reads this it is set. tgUser is the fallback for the same
   value, not a second source of truth - the server derives it from initData
   either way. */
let confirmedId: ID | null = null;

function currentUserId(): ID {
  const id = confirmedId ?? (tgUser ? String(tgUser.id) : null);
  if (!id) throw new ApiError(401, t("api.noIdentity"));
  return id;
}

/** POST /user
 *
 *  Upsert by the id recovered from initData; nothing is sent in the body,
 *  because verify_headers() trusts only what it verified itself - and what it
 *  verifies includes the whole profile, which is where the stored copy comes
 *  from.
 *
 *  The launch payload still WINS over the stored row, which is the opposite of
 *  the usual rule and is right here: initData describes this viewer as Telegram
 *  knows them right now, while the row is whatever was written the last time
 *  they signed in - a rename or a new picture shows up in the payload first.
 *  The row is the fallback, and it is a real one: a launch outside Telegram has
 *  no payload at all, and used to render the account as the generic word.
 *
 *  Only the id is taken from the server unconditionally, and that is the point:
 *  it is the one the server will scope every later query by. */
export async function signIn(): Promise<Identity> {
  const row = asRaw(await post<unknown>("/user"));

  const id = asId(row.id);
  if (!id) throw new ApiError(502, t("api.noUserId"));
  confirmedId = id;

  /* `user_name` is the column; `username` is what UserRead calls it. Both are
     read so this survives whichever name the response actually carries - the
     same hedge toComment() below makes, and for the same reason. */
  const storedUsername =
    typeof row.username === "string"
      ? row.username
      : typeof row.user_name === "string"
        ? row.user_name
        : null;

  return {
    id,
    first_name: tgUser?.first_name || asString(row.first_name) || t("user.telegram"),
    last_name: tgUser?.last_name ?? (typeof row.last_name === "string" ? row.last_name : null),
    username: tgUser?.username ?? storedUsername,
    photo_url: tgUser?.photo_url ?? (typeof row.photo_url === "string" ? row.photo_url : null),
    created_at: asIso(row.created_at),
  };
}

/* ------------------------------------------------------------- workspaces -- */

/** WorkspaceRead declares `id` and `title` only, so the owner falls back to the
 *  identity that asked and the timestamp to the epoch, where asIso() puts
 *  anything it cannot read.
 *
 *  `owner_id` is read first anyway, because POST /workspace has no
 *  response_model and answers with the whole row. The fallback is no longer
 *  harmless the way it was: owning a workspace and being a member of one are
 *  now different things, so a workspace someone else shared comes back with
 *  THEIR owner_id, and guessing the caller would name the wrong person. */
function toWorkspace(raw: Raw, ownerId: ID): Workspace | null {
  const id = asId(raw.id);
  if (!id) return null;
  return {
    id,
    title: asString(raw.title, "Untitled"),
    owner_id: asId(raw.owner_id) ?? ownerId,
    created_at: asIso(raw.created_at),
  };
}

/** GET /workspaces - every workspace this identity is a member of.
 *
 *  No query parameter any more: the route reads the id out of the signed
 *  initData and filters on workspacemembers itself. */
export async function listWorkspaces(): Promise<Workspace[]> {
  const owner = currentUserId();
  const rows = await get<unknown>("/workspaces");

  return (Array.isArray(rows) ? rows : [])
    .map((row) => toWorkspace(asRaw(row), owner))
    .filter((workspace): workspace is Workspace => workspace !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/** POST /workspace */
export async function createWorkspace(title: string): Promise<Workspace> {
  const owner = currentUserId();
  const clean = title.trim();
  if (!clean) throw new ApiError(422, t("api.titleRequired"));

  const raw = asRaw(await post<unknown>("/workspace", { title: clean.slice(0, 50) }));
  const workspace = toWorkspace(raw, owner);
  if (!workspace) throw new ApiError(502, t("api.noWorkspaceId"));
  return workspace;
}

/** PUT /workspace
 *
 *  The id goes in the body next to the title, which is what the handler reads.
 *  Note that WorkspaceUpdate does not declare the field, so a backend that
 *  validates the body strictly will drop it before the handler ever sees it. */
export async function renameWorkspace(id: ID, title: string): Promise<Workspace> {
  const owner = currentUserId();
  const clean = title.trim();
  if (!clean) throw new ApiError(422, t("api.titleRequired"));

  const body = { id: numericId(id), title: clean.slice(0, 50) };
  const workspace = toWorkspace(asRaw(await request<unknown>("PUT", "/workspace", { body })), owner);
  if (!workspace) throw new ApiError(502, t("api.noWorkspaceId"));
  return workspace;
}

/** DELETE /workspace - the id travels in the body, as the route declares.
 *
 *  The boards go with it: TaskBoard.workspace_id is part of the `task_boards`
 *  relationship, declared cascade="all, delete-orphan". */
export async function deleteWorkspace(id: ID): Promise<void> {
  await request<unknown>("DELETE", "/workspace", { body: { id: numericId(id) } });
}

/* ----------------------------------------------------------------- boards -- */

/** TaskBoardRead has no owner_id and no created_at, so both are filled in from
 *  what the caller already knows. POST /task_board has no response_model and so
 *  answers with the whole row, which does carry them - hence reading both
 *  shapes here rather than two mappers.
 *
 *  `user_id` is kept as a second name for the owner: the column was renamed to
 *  owner_id when workspaces became many-to-many, and a backend on the old side
 *  of that rename would otherwise hand back a board attributed to nobody. */
function toBoard(raw: Raw, ownerId: ID): Board | null {
  const id = asId(raw.id);
  if (!id) return null;
  return {
    id,
    title: asString(raw.title, "Untitled"),
    owner_id: asId(raw.owner_id) ?? asId(raw.user_id) ?? ownerId,
    /* TaskBoardRead declares this now, so every server row knows its own
       workspace and the local assignment map is dead in api mode. */
    workspace_id: asId(raw.workspace_id),
    created_at: asIso(raw.created_at),
  };
}

/** GET /task_boards?workspace_id=
 *
 *  The workspace is required by the route rather than optional scoping the
 *  client could skip. api/index.ts is what resolves which workspace that is.
 *
 *  It used to be filtered twice server-side - by the workspace and by
 *  taskboardmembers - and is now filtered once, by the workspace alone. The
 *  route 404s only when the workspace does not exist, so this answers with
 *  every board in it whether or not the caller is a member of any of them.
 *  Nothing on this side can restore that check; it is a server-side fix.
 *
 *  Archived boards are dropped: the column exists server-side and the UI has no
 *  archive view, so showing them would put a board on the list with no way to
 *  tell it apart from a live one. */
export async function listBoards(workspaceId: ID): Promise<Board[]> {
  const owner = currentUserId();
  const rows = await get<unknown>("/task_boards", {
    workspace_id: numericId(workspaceId),
  });

  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const raw = asRaw(row);
      return raw.archived === true ? null : toBoard(raw, owner);
    })
    .filter((board): board is Board => board !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/** POST /task_board
 *
 *  TaskBoardCreate.workspace_id is declared without a default, which in
 *  Pydantic v2 means REQUIRED - and the handler checks the caller is a member
 *  of that workspace before inserting, so it is not something the server can
 *  be left to guess.
 *
 *  The title cap is the UI's 30, not the column's String(50): a board title is
 *  a row label here and a longer one only truncates on screen. */
export async function createBoard(title: string, workspaceId: ID): Promise<Board> {
  const owner = currentUserId();
  const clean = title.trim();
  if (!clean) throw new ApiError(422, t("api.titleRequired"));
  if (clean.length > 30) throw new ApiError(422, t("api.titleTooLong"));

  const body = { title: clean, workspace_id: numericId(workspaceId) };
  const board = toBoard(asRaw(await post<unknown>("/task_board", body)), owner);
  if (!board) throw new ApiError(502, t("api.noBoardId"));
  return board;
}

/** GET /task_boards/{id}
 *
 *  No such route, but the board is already in the list the app can fetch, so
 *  this reads it from there rather than refusing - hence the workspace
 *  argument, which the list route will not answer without. One extra round
 *  trip on the board screen; it collapses into a real fetch the moment the
 *  route lands. */
export async function getBoard(id: ID, workspaceId: ID): Promise<Board> {
  const board = (await listBoards(workspaceId)).find((b) => b.id === id);
  if (!board) throw new ApiError(404, t("api.boardNotFound"));
  return board;
}

/** PATCH /task_board - no route. */
export async function renameBoard(_id: ID, _title: string): Promise<Board> {
  return missing("PATCH /task_board");
}

/** DELETE /task_board
 *
 *  The id travels in a JSON body rather than the path, which is what the route
 *  declares. fetch() does send a body on DELETE - unlike GET, where it drops
 *  it - so this works from a browser, though some proxies are known to strip
 *  DELETE bodies and a path parameter would be the safer shape.
 *
 *  It refuses out loud now, where it used to answer 200 to everyone and delete
 *  nothing: 404 when the board does not exist, 401 when the caller is not a
 *  member of it, 403 when their role on it is neither admin nor manager. All
 *  three arrive as an ApiError carrying the server's own wording, which the
 *  board screen already shows - so a member who may not delete finally learns
 *  that instead of watching the list reload unchanged.
 *
 *  The tasks go with it in the database: Task.task_board_id is ON DELETE
 *  CASCADE. The answer is ignored - there is nothing left to show. */
export async function deleteBoard(id: ID): Promise<void> {
  await request<unknown>("DELETE", "/task_board", { body: { id: numericId(id) } });
}

/* ------------------------------------------------------------------ tasks -- */

/** TaskRead has no created_at column, so that falls to the epoch - harmless,
 *  because listTasks() orders by deadline and priority and only uses created_at
 *  to break a remaining tie, and the server already returns rows in creation
 *  order.
 *
 *  `done` IS read here, so the client is ready the moment the routes carry it.
 *  Whether the checkbox is shown is a separate question - see the `taskDone`
 *  entry in api/index.ts. */
function toTask(raw: Raw): Task | null {
  const id = asId(raw.id);
  /* TaskRead has named the parent three ways now: a nested `board` object
     first, then a flat `board_id`, and `task_board_id` since the column was
     renamed in models.py. All of them are read, because a task whose board
     cannot be identified is dropped below - and when that happened silently,
     every task vanished from its board while creating one still appeared to
     work. The current name is tried first; the rest are there so a stale
     backend does not empty every list. */
  const boardId =
    asId(raw.task_board_id) ??
    asId(raw.board_id) ??
    asId(asRaw(raw.task_board).id) ??
    asId(asRaw(raw.board).id);

  if (!id || !boardId) {
    // Never silent. A row the mapper cannot read is a contract change, and the
    // symptom - an empty list - looks nothing like the cause.
    if (DEBUG) console.warn("[planner] unreadable task row, dropped", raw);
    return null;
  }

  return {
    id,
    board_id: boardId,
    title: asString(raw.title),
    description: asString(raw.description),
    deadline: typeof raw.deadline === "string" ? raw.deadline : null,
    image: typeof raw.image === "string" ? raw.image : null,
    done: raw.done === true,
    priority_code: toPriorityCode(
      typeof raw.priority_code === "number" ? raw.priority_code : null,
    ),
    created_at: asIso(raw.created_at),
  };
}

/** The fields POST and PUT share. Every Optional field on TaskCreate and
 *  TaskUpdate is declared without a default, which in Pydantic v2 means
 *  REQUIRED - so each one is sent explicitly, nulls included.
 *
 *  `done` is not among them: TaskCreate has no such field (a new task is never
 *  done), while TaskUpdate does, so it is added by updateTask alone. */
function taskBody(input: TaskInput): Raw {
  return {
    title: input.title.trim().slice(0, 60),
    description: input.description.trim().slice(0, 100),
    deadline: input.deadline || null,
    image: input.image,
    priority_code: toPriorityCode(input.priority_code),
  };
}

/** GET /tasks?task_board_id=
 *
 *  Board-scoped, not author-scoped: the route checks the caller is a member of
 *  the board and then returns every task on it, so a shared board finally shows
 *  everyone's work instead of only your own rows.
 *
 *  Re-sorted rather than taken as it comes: the route orders by created_at,
 *  and the board screen wants open work first, then by deadline. */
export async function listTasks(boardId: ID): Promise<Task[]> {
  const rows = await get<unknown>("/tasks", { task_board_id: numericId(boardId) });
  return (Array.isArray(rows) ? rows : [])
    .map((row) => toTask(asRaw(row)))
    .filter((task): task is Task => task !== null)
    .sort(boardOrder);
}

/** GET /task?id=
 *
 *  Board-scoped now rather than author-scoped: the route checks the caller is
 *  a member of the task's board instead of matching on user_id, so a shared
 *  board opens everyone's tasks and not only your own rows. */
export async function getTask(id: ID): Promise<Task> {
  const task = toTask(asRaw(await get<unknown>("/task", { id: numericId(id) })));
  if (!task) throw new ApiError(404, t("api.taskNotFound"));
  return task;
}

/** POST /task */
export async function createTask(boardId: ID, input: TaskInput): Promise<Task> {
  const title = input.title.trim();
  if (!title) throw new ApiError(422, t("api.titleRequired"));

  /* TaskCreate.task_board_id, renamed from board_id along with the column.
     Only the current name is sent: the field is declared without a default,
     which in Pydantic v2 means REQUIRED, so a backend on either side of the
     rename rejects the other name outright and there is nothing to hedge. */
  const body = { ...taskBody(input), task_board_id: numericId(boardId) };
  const task = toTask(asRaw(await post<unknown>("/task", body)));
  if (!task) throw new ApiError(502, t("api.noTaskId"));
  return task;
}

/** PUT /task
 *
 *  The route replaces every field from the body rather than merging, so a
 *  partial patch has to be completed first - which is what the callers pass.
 *
 *  Read-then-write is a race in principle, and it is closer to one than it
 *  was: the route gates on board membership rather than on authorship now, so
 *  two people on a shared board can be editing the same task at once and the
 *  later write replaces every field of the earlier one. Still not worth a
 *  PATCH until the route has one. */
export async function updateTask(
  id: ID,
  patch: Partial<Omit<Task, "id" | "board_id" | "created_at">>,
): Promise<Task> {
  const current = await getTask(id);
  const merged = { ...current, ...patch };

  const body = { ...taskBody(merged), id: numericId(id), done: merged.done };
  const task = toTask(asRaw(await request<unknown>("PUT", "/task", { body })));
  if (!task) throw new ApiError(502, t("api.noTaskId"));
  return task;
}

/** DELETE /task - the id travels in the body, as the route declares. */
export async function deleteTask(id: ID): Promise<void> {
  await request<unknown>("DELETE", "/task", { body: { id: numericId(id) } });
}

/* --------------------------------------------------------------- comments -- */

/** CommentRead has carried the author two ways - a nested `user` object, and a
 *  flat `user_id` before that - so both are read. Same treatment TaskRead's
 *  board_id already gets in toTask(): a shape that has changed once will change
 *  again, and the failure mode of guessing wrong is silent.
 *
 *  The nested object is the live one now that `users` stores the profile, so
 *  every comment in a thread can finally render under its author's real name
 *  and picture rather than under a generic noun.
 *
 *  The profile is read only if a `first_name` actually came back. Telegram
 *  guarantees that field for every account, so its absence means the server has
 *  no profile to give - not that this particular person lacks a name - and the
 *  row falls back to "You" or a generic word from `mine` at render time. Those
 *  are translated, which is why they are picked in the component rather than
 *  frozen here in whichever language the thread was fetched in.
 *
 *  Guessing is not on the table: inventing "User 482910" would read like a
 *  name, and putting a raw Telegram id on screen would publish something the
 *  app has no business showing.
 *
 *  `task_id` is read from the row but falls back to the task that was asked
 *  for - a thread is only ever fetched one task at a time, so the fallback is
 *  right whether or not the schema declares the column. */
function toComment(raw: Raw, taskId: ID): CommentView | null {
  const id = asId(raw.id);
  if (!id) {
    if (DEBUG) console.warn("[planner] unreadable comment row, dropped", raw);
    return null;
  }

  const user = asRaw(raw.user);
  const authorId = asId(user.id) ?? asId(raw.user_id) ?? asId(raw.author_id) ?? "";

  const first = asString(user.first_name);
  const author: CommentAuthor | null =
    authorId && first
      ? {
          id: authorId,
          first_name: first,
          last_name: typeof user.last_name === "string" ? user.last_name : null,
          /* The column is `user_name`, UserRead declares `username`. Reading
             both means a thread keeps its @handles whichever way that lands. */
          username:
            typeof user.username === "string"
              ? user.username
              : typeof user.user_name === "string"
                ? user.user_name
                : null,
          photo_url: typeof user.photo_url === "string" ? user.photo_url : null,
        }
      : null;

  return {
    id,
    task_id: asId(raw.task_id) ?? taskId,
    content: asString(raw.content),
    image: typeof raw.image === "string" ? raw.image : null,
    author_id: authorId,
    created_at: asIso(raw.created_at),
    author,
    mine: authorId !== "" && authorId === currentUserId(),
  };
}

/** The body POST and PUT share. Both schemas declare `content` and `image`
 *  without defaults, which in Pydantic v2 means REQUIRED - so a null image is
 *  sent explicitly rather than left out.
 *
 *  The image goes up as the data: URL the picker produced. Comment.image is a
 *  LargeBinary column and the schema types it `bytes`, which Pydantic fills
 *  from a JSON string by UTF-8 encoding it - a data: URL is ASCII, so it
 *  round-trips unchanged. The same path Task.image already takes. */
function commentBody(content: string, image: string | null): Raw {
  return { content: content.trim().slice(0, 100), image };
}

/** GET /comments?task_id=
 *
 *  Oldest first, which is how a thread reads. The handler already orders by
 *  created_at, but the sort is repeated here because the rows currently arrive
 *  without one - see the note on the sort below. */
export async function listComments(taskId: ID): Promise<CommentView[]> {
  const rows = await get<unknown>("/comments", { task_id: numericId(taskId) });
  const raw = Array.isArray(rows) ? rows : [];

  const comments = raw
    .map((row) => toComment(asRaw(row), taskId))
    .filter((comment): comment is CommentView => comment !== null);

  /* Rows came back and not one of them could be read. That is the CommentRead
     gap, and an empty thread is the worst possible way to report it: it looks
     exactly like a task nobody has commented on, so the natural next move is
     to post another comment that also vanishes. Say what is wrong instead. */
  if (raw.length > 0 && comments.length === 0) {
    throw new ApiError(502, t("api.commentShape"));
  }

  /* Stable-sorted, so rows the server already ordered by created_at keep that
     order even while every one of them is carrying the epoch for want of a
     created_at field. */
  return comments.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** POST /comment
 *
 *  A comment with an image and no text is allowed, so the guard below refuses
 *  only when BOTH are empty. Comment.content is NOT NULL, which the empty
 *  string satisfies - a null would not. */
export async function createComment(
  taskId: ID,
  content: string,
  image: string | null = null,
): Promise<Comment> {
  const clean = content.trim();
  if (!clean && !image) throw new ApiError(422, t("api.writeSomething"));

  const body = { ...commentBody(content, image), task_id: numericId(taskId) };
  const comment = toComment(asRaw(await post<unknown>("/comment", body)), taskId);
  /* The row IS in the database at this point - the POST succeeded and only the
     response was unreadable. Raising anyway is deliberate: the caller reloads
     the thread next, which fails the same way, and one message that names the
     fix beats a comment that appears to post into nothing. */
  if (!comment) throw new ApiError(502, t("api.commentShape"));
  return comment;
}

/** PUT /comment - content and image are replaced together, as the route does.
 *
 *  The task is not in the response's reach, so the returned row is mapped
 *  against the id it already carries; callers reload the thread anyway. */
export async function updateComment(
  id: ID,
  content: string,
  image: string | null = null,
): Promise<Comment> {
  const clean = content.trim();
  if (!clean && !image) throw new ApiError(422, t("api.writeSomething"));

  const body = { ...commentBody(content, image), id: numericId(id) };
  const comment = toComment(asRaw(await request<unknown>("PUT", "/comment", { body })), "");
  if (!comment) throw new ApiError(502, t("api.commentShape"));
  return comment;
}

/** DELETE /comment - the id travels in the body, as the route declares.
 *
 *  The answer is ignored, which is just as well: the handler returns
 *  SQLAlchemy's CursorResult, so the body says nothing about what happened.
 *  Note that it answers 200 even when the id matched nothing, so a caller
 *  cannot tell a delete from a no-op without re-reading the thread - which
 *  TaskDetail does anyway. */
export async function deleteComment(id: ID): Promise<void> {
  await request<unknown>("DELETE", "/comment", { body: { id: numericId(id) } });
}

/* ---------------------------------------------------------------- invites --

   Written against main.py AS IT STANDS, not against the handover's §4. Three
   routes exist - POST /invite, POST /invite/accept, DELETE /invite - and the
   two GETs do not, so this half fills the gaps client-side rather than calling
   something that would 404. Every workaround below is marked BACKEND GAP and
   is a deletion, not a rewrite, once the route or the schema changes.

   The gaps, shortest first:

     1. InviteCreate declares `token`, `expires_at` and `role_id`, so the CLIENT
        has to mint all three. The token is the one secret in the flow and has
        no business being chosen out here; `role_id` is worse, because nothing
        on this side knows what the roles table contains.
     2. There is no GET /invites, so Settings cannot list links.
     3. GET /invite answers with the invite ROW rather than a preview, so the
        boards it grants arrive as ids and have to be named separately.
   ---------------------------------------------------------------------------- */

/** BACKEND GAP 1. Mirrors inviteToken() in local.ts - url-safe, ~96 bits,
 *  namespaced with the prefix telegram.ts and bot/tg_bot.py both match on.
 *
 *  A token minted by the client is not a secret the server controls: anyone
 *  who can run this page can choose their own. It is here only because
 *  InviteCreate declares `token` as a required field. `secrets.token_urlsafe`
 *  server-side is what retires it. */
function mintInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `inv_${b64}`;
}

/** BACKEND GAP 1. How long a link this app mints stays good for.
 *
 *  Sent as naive UTC, through toNaiveUtc(): Invite.expires_at is a
 *  `timestamp without time zone`, so the database holds UTC and nothing else,
 *  and the reader's own zone is applied at render time rather than written into
 *  the row. Sending toISOString() as-is puts a `Z` on it, which Pydantic turns
 *  into an aware datetime that asyncpg then refuses to bind. */
const INVITE_TTL_DAYS = 7;

/** InviteRead carries no board_ids and POST /invite has no response_model, so
 *  what actually comes back is the whole ORM row: id, workspace_id, created_by,
 *  token, expires_at, role_id, accepted_by, accepted_at and the timestamps.
 *
 *  `accepted_at` is the field to be careful with: it is null on every live
 *  invite, and asIso() turns anything it cannot read into the epoch - which
 *  would put a real timestamp on an unaccepted row and make every link read as
 *  "used". Hence the explicit string check before mapping it. */
function toInvite(raw: Raw, ownerId: ID, boardIds: ID[] = []): Invite | null {
  const id = asId(raw.id);
  const token = asString(raw.token);

  if (!id || !token) {
    if (DEBUG) console.warn("[planner] unreadable invite row, dropped", raw);
    return null;
  }

  const accepted = typeof raw.accepted_at === "string" && raw.accepted_at !== "";

  return {
    id,
    token,
    workspace_id: asId(raw.workspace_id),
    /* The row cannot say what it grants - the boards live in invitetaskboards
       and nothing joins them in - so the caller's own list stands in. That is
       true for a create, where this side chose them; it is a lie waiting to
       happen anywhere else, which is why nothing else passes them. */
    board_ids: Array.isArray(raw.board_ids)
      ? raw.board_ids
          .map((value) => asId(value))
          .filter((boardId): boardId is ID => boardId !== null)
      : boardIds,
    created_by: asId(raw.created_by) ?? ownerId,
    created_at: asIso(raw.created_at),
    accepted_by: accepted ? asId(raw.accepted_by) : null,
    accepted_at: accepted ? asIso(raw.accepted_at) : null,
  };
}

/** POST /invite
 *
 *  One flat body: InviteCreate declares workspace_id, token, expires_at,
 *  role_id and task_boards_ids, and every one of them is without a default -
 *  which in Pydantic v2 means REQUIRED, so all five are sent explicitly.
 *
 *  It has to be flat. A second body parameter next to `data` would make FastAPI
 *  embed both under their parameter names, and the body would need an envelope;
 *  with the list folded into the model there is a single body parameter, so the
 *  model IS the body. Sending the envelope against this shape is what produced
 *  "workspace_id: Field required" for every field at once.
 *
 *  Note what the route does NOT check: that the caller is a member of the
 *  workspace, or of the boards being handed out. Any id that exists will be
 *  written. Worth having before this is pointed at anything real. */
export async function createInvite(
  boardIds: ID[],
  workspaceId: ID,
  roleId: ID,
): Promise<Invite> {
  const owner = currentUserId();
  if (boardIds.length === 0) throw new ApiError(422, t("api.pickBoard"));

  const expires = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

  const body = {
    workspace_id: numericId(workspaceId),
    token: mintInviteToken(),
    expires_at: toNaiveUtc(expires),
    /* BACKEND GAP 1. InviteCreate requires role_id, and no route lists the
       roles, so the id travels from a table this side keeps by hand - see
       lib/role.ts, which is also where the hazard is written down. */
    role_id: numericId(roleId),
    task_boards_ids: boardIds.map(numericId),
  };

  const invite = toInvite(asRaw(await post<unknown>("/invite", body)), owner, boardIds);
  if (!invite) throw new ApiError(502, t("api.inviteShape"));

  /* The only second chance at this token while GET /invites is missing. The
     share sheet is the one place the link appears, and if it is dismissed the
     link is unrecoverable - there is nothing to list it back. Logged rather
     than surfaced because DEBUG is a developer's switch, and this is only
     needed while the list route is not there. */
  if (DEBUG) console.info("[planner] invite minted:", invite.token);

  return invite;
}

/** GET /invites?workspace_id= - BACKEND GAP 3, no such route.
 *
 *  Empty rather than a throw, and this is the one place that choice is worth
 *  arguing about. missing() would be the house style - it is what renameBoard()
 *  does - but this call is inside the Promise.all that loads the whole Settings
 *  screen, so a rejection here takes the workspace list, the board list and the
 *  member list down with it. An empty Invite links section costs one heading
 *  that never appears; the alternative costs the screen.
 *
 *  What it means while it is empty: a link can only be shared at the moment it
 *  is minted, because nothing can list it again afterwards. "Share again" and
 *  "Revoke" have nothing to appear on. */
export async function listInvites(_workspaceId: ID): Promise<Invite[]> {
  if (DEBUG) {
    console.info(
      "[planner] invite links are not listed: backend/app/main.py has no GET /invites route",
    );
  }
  return [];
}

/** The titles behind an invite's board ids, or null when they cannot be read.
 *
 *  Scoped to the invite's workspace and not to the active one: the accept
 *  screen opens on a link into a workspace this device has very likely never
 *  selected, and api/index.ts's listBoards() would scope the lookup to the
 *  wrong one and quietly match nothing.
 *
 *  This USED to fail for the very person it exists for - GET /task_boards
 *  required workspace membership and an invitee has none - which is why the
 *  screen could only ever show a count. That check is gone from the route, so
 *  the names now resolve for everyone holding a link. The fallback below stays
 *  regardless: it is what the screen shows if the check ever comes back, and
 *  it is the honest answer for a board that has been archived or deleted since
 *  the invite was minted.
 *
 *  Every failure funnels to null, which the screen renders as a count rather
 *  than as an empty list. */
async function inviteBoardTitles(
  workspaceId: ID | null,
  boardIds: ID[] | null,
): Promise<string[] | null> {
  if (!workspaceId || !boardIds || boardIds.length === 0) return null;

  try {
    const boards = await listBoards(workspaceId);
    const byId = new Map(boards.map((board) => [board.id, board.title]));

    const titles = boardIds
      .map((id) => byId.get(id))
      .filter((title): title is string => title !== undefined);

    // All or nothing - see the note in getInvite about understating a grant.
    return titles.length === boardIds.length ? titles : null;
  } catch (err) {
    if (DEBUG) console.info("[planner] invite boards could not be named", err);
    return null;
  }
}

/** GET /invite?token=
 *
 *  The one route that cannot gate on membership: whoever opens the link is by
 *  definition not a member yet, so it answers on the token alone.
 *
 *  Null on 404, not a throw. An unknown token is a normal outcome here - a
 *  revoked link, or one that was never real - and the accept screen has a
 *  sentence for it. Anything else (offline, 401, a 500) still raises, because
 *  those are worth showing as errors rather than reporting as a dead link.
 *
 *  BACKEND GAP 4: what comes back is the invite ROW, so the boards it grants
 *  arrive as ids and have to be named from somewhere else - which is the
 *  lookup below, against the invite's OWN workspace rather than the one the
 *  picker happens to be on.
 *
 *  That lookup is allowed to fail, and failing is the normal case: a genuine
 *  invitee has no membership row, so GET /task_boards answers 404 and the
 *  names stay unknown. It succeeds for anyone who can already see the
 *  workspace - the sender checking their own link, or someone being invited to
 *  further boards in a workspace they are in - and those are the cases where a
 *  name is worth more than a number.
 *
 *  Partial resolution is treated as no resolution on purpose. Naming two of
 *  three boards reads as a complete list and understates the grant, so unless
 *  every id resolves the screen falls back to the count, which is never wrong.
 *  (An archived board is one way to land there: listBoards() drops those.)
 *
 *  The COUNT always survives: task_boards_ids is on InviteRead, and how many
 *  boards a link opens gives away nothing that naming them would not.
 *
 *  `accepted_at` and `expires_at` need the explicit string checks below for
 *  the same reason `accepted_at` does in toInvite(): both are null on a live
 *  invite, and asIso() turns anything it cannot read into the epoch - which
 *  would mark every fresh link as used and long expired. */
export async function getInvite(token: string): Promise<InvitePreview | null> {
  let raw: Raw;
  try {
    raw = asRaw(await get<unknown>("/invite", { token }));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }

  /* The row has to be recognisable as one. The route declares no
     response_model, so a shape change here arrives silently - and a body that
     carries no token at all is the signature of the handler returning
     something other than the invite. Treating that as "no such invite" would
     send the reader to the dead-link message for a link that is fine. */
  if (!asString(raw.token)) {
    if (DEBUG) console.warn("[planner] GET /invite did not return an invite row", raw);
    throw new ApiError(502, t("api.inviteShape"));
  }

  const boardIds = Array.isArray(raw.task_boards_ids)
    ? raw.task_boards_ids
        .map((value) => asId(value))
        .filter((id): id is ID => id !== null)
    : null;

  return {
    token: asString(raw.token, token),
    workspace_title: null,
    board_titles: await inviteBoardTitles(asId(raw.workspace_id), boardIds),
    board_count: boardIds?.length ?? null,
    accepted: typeof raw.accepted_at === "string" && raw.accepted_at !== "",
    expires_at:
      typeof raw.expires_at === "string" && raw.expires_at !== ""
        ? asIso(raw.expires_at)
        : null,
  };
}

/** POST /invite/accept
 *
 *  Just the token. InviteAccept used to declare workspace_id, expires_at,
 *  accepted_by and accepted_at as required alongside it, none of which the
 *  handler read and none of which an invitee could know - they were sent as
 *  filler to get past validation. The schema is down to the one field that
 *  means anything, so the filler is gone.
 *
 *  Two kinds of membership come out of this: a workspacemembers row and one
 *  taskboardmembers row per board. Both are written - which is why the caller
 *  re-reads the workspace list afterwards and not only the boards. */
export async function acceptInvite(token: string): Promise<Invite> {
  const owner = currentUserId();

  /* The token being spent, because "Invite not found" says nothing about WHICH
     token the server could not find - and the one thing worth comparing
     against the invites table is this exact string. */
  if (DEBUG) console.info("[planner] accepting invite:", token);

  const invite = toInvite(asRaw(await post<unknown>("/invite/accept", { token })), owner);
  if (!invite) throw new ApiError(502, t("api.inviteShape"));
  return invite;
}

/** DELETE /invite - the id travels in the body, as the route declares.
 *
 *  Matches on created_by, so revoking someone else's link is a silent no-op
 *  that answers 200 - the same shape every other delete route here has. No UI
 *  reaches this yet: revoking is offered from the Invite links list, which is
 *  empty until GET /invites exists. */
export async function revokeInvite(id: ID): Promise<void> {
  await request<unknown>("DELETE", "/invite", { body: { id: numericId(id) } });
}

/* ----------------------------------------------------------------- health -- */

/** GET /health, which answers 200 with an empty body.
 *
 *  Used by Settings to say whether the backend is reachable at all, so a
 *  misconfigured API_BASE or a blocked CORS preflight shows up as one line
 *  there instead of as a failure on whichever screen is opened first. */
export async function checkHealth(): Promise<boolean> {
  try {
    await request<void>("GET", "/health");
    return true;
  } catch {
    return false;
  }
}
