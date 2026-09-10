/* ============================================================================
   Data layer - backend half.

   One function per endpoint that backend/app/main.py actually serves today, and
   an explicit refusal for the ones it does not. Every function is the twin of
   the one with the same name in local.ts: same arguments, same return shape, so
   api/index.ts can swap them per feature without a screen noticing.

   Endpoints this file uses, exactly as main.py declares them:

     POST   /user        -> the User row for the verified Telegram id
     GET    /taskboards  -> list[TaskBoardRead], filtered by ?user_id
     POST   /taskboard   -> the TaskBoard row, from {title}
     DELETE /taskboard   -> {id} in the body
     GET    /tasks       -> list[TaskRead], filtered by ?board_id
     GET    /task        -> one TaskRead, by ?id
     POST   /task        -> the created TaskRead
     PUT    /task        -> the updated TaskRead, every field replaced
     DELETE /task        -> {id} in the body
     GET    /comments    -> list[CommentRead], filtered by ?task_id
     POST   /comment     -> the created CommentRead
     PUT    /comment     -> the updated CommentRead, content and image replaced
     DELETE /comment     -> {id} in the body
     GET    /health      -> 200, empty body

   The comment routes are live. What is NOT finished is CommentRead, which
   declares `content` and `image` and nothing else - so a comment comes back
   with no id, no user_id and no created_at, none of which the client can
   invent. The mappers below read all three when they are there and say
   plainly when they are not, rather than dropping rows into an empty thread.

   The workspace list and invites have no routes at all and stay on the local
   store.
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
  type Raw,
} from "../lib/http";
import { toPriorityCode } from "../lib/priority";
import { boardOrder } from "../lib/taskOrder";
import type { Board, Comment, CommentAuthor, ID, Task } from "../types";
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

/* The id the server confirmed for this launch. GET /taskboards takes it as a
   query parameter, so it has to survive between calls; signIn() runs before the
   first screen renders (see App.tsx), so by the time anything reads this it is
   set. tgUser is the fallback for the same value, not a second source of
   truth - the server derives it from the signed initData either way. */
let confirmedId: ID | null = null;

function currentUserId(): ID {
  const id = confirmedId ?? (tgUser ? String(tgUser.id) : null);
  if (!id) throw new ApiError(401, t("api.noIdentity"));
  return id;
}

/** POST /user
 *
 *  Upsert by the id recovered from initData; nothing is sent in the body,
 *  because verify_headers() trusts only what it verified itself.
 *
 *  The row that comes back carries the id and the timestamps and nothing else -
 *  the User model has no name, @username or photo columns - so the profile
 *  fields still come from the Telegram launch payload. Only the id is taken
 *  from the server, and that is the point: it is the one the server will scope
 *  every later query by. */
export async function signIn(): Promise<Identity> {
  const row = asRaw(await post<unknown>("/user"));

  const id = asId(row.id);
  if (!id) throw new ApiError(502, t("api.noUserId"));
  confirmedId = id;

  return {
    id,
    first_name: tgUser?.first_name ?? t("user.telegram"),
    last_name: tgUser?.last_name ?? null,
    username: tgUser?.username ?? null,
    photo_url: tgUser?.photo_url ?? null,
    created_at: asIso(row.created_at),
  };
}

/* ----------------------------------------------------------------- boards -- */

/** TaskBoardRead has no owner_id and no created_at, so both are filled in from
 *  what the caller already knows. POST /taskboard has no response_model and so
 *  answers with the whole row, which does carry them - hence reading both
 *  shapes here rather than two mappers. */
function toBoard(raw: Raw, ownerId: ID): Board | null {
  const id = asId(raw.id);
  if (!id) return null;
  return {
    id,
    title: asString(raw.title, "Untitled"),
    owner_id: asId(raw.user_id) ?? ownerId,
    created_at: asIso(raw.created_at),
  };
}

/** GET /taskboards?user_id=
 *
 *  Archived boards are dropped: the column exists server-side and the UI has no
 *  archive view, so showing them would put a board on the list with no way to
 *  tell it apart from a live one. */
export async function listBoards(): Promise<Board[]> {
  const owner = currentUserId();
  const rows = await get<unknown>("/taskboards", { user_id: owner });

  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const raw = asRaw(row);
      return raw.archived === true ? null : toBoard(raw, owner);
    })
    .filter((board): board is Board => board !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/** POST /taskboard
 *
 *  The title cap is the UI's 30, not the column's String(50): a board title is
 *  a row label here and a longer one only truncates on screen. */
export async function createBoard(title: string): Promise<Board> {
  const owner = currentUserId();
  const clean = title.trim();
  if (!clean) throw new ApiError(422, t("api.titleRequired"));
  if (clean.length > 30) throw new ApiError(422, t("api.titleTooLong"));

  const board = toBoard(asRaw(await post<unknown>("/taskboard", { title: clean })), owner);
  if (!board) throw new ApiError(502, t("api.noBoardId"));
  return board;
}

/** GET /taskboards/{id}
 *
 *  No such route, but the board is already in the list the app can fetch, so
 *  this reads it from there rather than refusing. One extra round trip on the
 *  board screen; it collapses into a real fetch the moment the route lands. */
export async function getBoard(id: ID): Promise<Board> {
  const board = (await listBoards()).find((b) => b.id === id);
  if (!board) throw new ApiError(404, t("api.boardNotFound"));
  return board;
}

/** PATCH /taskboard - no route. */
export async function renameBoard(_id: ID, _title: string): Promise<Board> {
  return missing("PATCH /taskboard");
}

/** DELETE /taskboard
 *
 *  The id travels in a JSON body rather than the path, which is what the route
 *  declares. fetch() does send a body on DELETE - unlike GET, where it drops
 *  it - so this works from a browser, though some proxies are known to strip
 *  DELETE bodies and a path parameter would be the safer shape.
 *
 *  The tasks go with it in the database: Task.board_id is ON DELETE CASCADE.
 *  The answer is ignored - there is nothing left to show. */
export async function deleteBoard(id: ID): Promise<void> {
  await request<unknown>("DELETE", "/taskboard", { body: { id: numericId(id) } });
}

/* ------------------------------------------------------------------ tasks -- */

/** TaskRead nests the whole board rather than carrying a board_id, so the
 *  parent is read back out of it. It also has no created_at column, so that
 *  falls to the epoch - harmless, because listTasks() orders by deadline and
 *  priority and only uses created_at to break a remaining tie, and the server
 *  already returns rows in creation order.
 *
 *  `done` IS read here, so the client is ready the moment the routes carry it.
 *  Whether the checkbox is shown is a separate question - see the `taskDone`
 *  entry in api/index.ts. */
function toTask(raw: Raw): Task | null {
  const id = asId(raw.id);
  /* TaskRead has carried the parent both ways: a nested `board` object first,
     a flat `board_id` now. Both are read, because a task whose board cannot be
     identified is dropped below - and when that happened silently, every task
     vanished from its board while creating one still appeared to work. */
  const boardId = asId(raw.board_id) ?? asId(asRaw(raw.board).id);

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

/** GET /tasks?board_id=
 *
 *  Re-sorted rather than taken as it comes: the route orders by created_at,
 *  and the board screen wants open work first, then by deadline. */
export async function listTasks(boardId: ID): Promise<Task[]> {
  const rows = await get<unknown>("/tasks", { board_id: numericId(boardId) });
  return (Array.isArray(rows) ? rows : [])
    .map((row) => toTask(asRaw(row)))
    .filter((task): task is Task => task !== null)
    .sort(boardOrder);
}

/** GET /task?id= */
export async function getTask(id: ID): Promise<Task> {
  const task = toTask(asRaw(await get<unknown>("/task", { id: numericId(id) })));
  if (!task) throw new ApiError(404, t("api.taskNotFound"));
  return task;
}

/** POST /task */
export async function createTask(boardId: ID, input: TaskInput): Promise<Task> {
  const title = input.title.trim();
  if (!title) throw new ApiError(422, t("api.titleRequired"));

  const body = { ...taskBody(input), board_id: numericId(boardId) };
  const task = toTask(asRaw(await post<unknown>("/task", body)));
  if (!task) throw new ApiError(502, t("api.noTaskId"));
  return task;
}

/** PUT /task
 *
 *  The route replaces every field from the body rather than merging, so a
 *  partial patch has to be completed first - which is what the callers pass.
 *  Read-then-write is a race in principle; with one Telegram user per account
 *  editing one task at a time, it is not one in practice. */
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
          username: typeof user.username === "string" ? user.username : null,
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
