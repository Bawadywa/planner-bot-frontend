/* ============================================================================
   Data layer - backend half.

   One function per endpoint that backend/app/main.py actually serves today, and
   an explicit refusal for the ones it does not. Every function is the twin of
   the one with the same name in local.ts: same arguments, same return shape, so
   api/index.ts can swap them per feature without a screen noticing.

   Endpoints this file uses, exactly as main.py declares them:

     POST /user          -> the User row for the verified Telegram id
     GET  /taskboards    -> list[TaskBoardRead], filtered by ?user_id
     POST /taskboard     -> the TaskBoard row, from {title}
     GET  /health        -> 200, empty body

   Deliberately not used, and why:

     GET /task           takes its id in a Pydantic BODY on a GET, which a
                         browser cannot send - fetch drops a body on GET, so
                         the request would arrive with none and 422.

   Everything else the UI needs (listing tasks on a board, editing or deleting
   one, comments, team, invites) has no route yet, so api/index.ts leaves those
   features on the local store. `missing()` below is what the two board routes
   that DO have a local twin but no server one raise instead - a rename or a
   delete must not silently succeed against a copy the server will hand back
   again on the next load.
   ============================================================================ */

import { tgUser } from "../telegram";
import {
  ApiError,
  asId,
  asIso,
  asRaw,
  asString,
  get,
  post,
  request,
  type Raw,
} from "../lib/http";
import type { Board, ID } from "../types";
import type { Identity } from "./local";

/** Raised for a UI action the backend has no route for. 501 rather than 404:
 *  the resource exists, the verb does not. The screens already show
 *  `err.message`, so it names the route that would fix it. */
function missing(route: string): never {
  throw new ApiError(501, `The backend has no ${route} route yet.`);
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
  if (!id) throw new ApiError(401, "No Telegram identity for this launch");
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
  if (!id) throw new ApiError(502, "The server returned a user with no id.");
  confirmedId = id;

  return {
    id,
    first_name: tgUser?.first_name ?? "Telegram user",
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
  if (!clean) throw new ApiError(422, "Title required");
  if (clean.length > 30) throw new ApiError(422, "Title is limited to 30 characters");

  const board = toBoard(asRaw(await post<unknown>("/taskboard", { title: clean })), owner);
  if (!board) throw new ApiError(502, "The server returned a board with no id.");
  return board;
}

/** GET /taskboards/{id}
 *
 *  No such route, but the board is already in the list the app can fetch, so
 *  this reads it from there rather than refusing. One extra round trip on the
 *  board screen; it collapses into a real fetch the moment the route lands. */
export async function getBoard(id: ID): Promise<Board> {
  const board = (await listBoards()).find((b) => b.id === id);
  if (!board) throw new ApiError(404, "Board not found");
  return board;
}

/** PATCH /taskboards/{id} - no route. */
export async function renameBoard(_id: ID, _title: string): Promise<Board> {
  return missing("PATCH /taskboards/{id}");
}

/** DELETE /taskboards/{id} - no route. */
export async function deleteBoard(_id: ID): Promise<void> {
  return missing("DELETE /taskboards/{id}");
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
