/* Shapes mirror backend/app/models.py so the swap from the localStorage mock to
   real endpoints is a change of transport, not of data shape. Lengths in the
   comments are the String(n) caps declared on the SQLAlchemy columns; the forms
   enforce them client-side so the mock can never hold a value the DB would
   reject. */

import type { PriorityCode } from "./lib/priority";

export type ID = string;

/** Identity comes from Telegram, so there is no email and no password here -
 *  `id` IS the Telegram user id. Everything but first_name is optional on
 *  Telegram's side: plenty of accounts have no @username, no surname and no
 *  visible photo, so every screen has to render without them. */
export interface User {
  id: ID; // Telegram user id, kept as a string like every other ID
  first_name: string;
  last_name: string | null;
  username: string | null;
  photo_url: string | null;
  created_at: string; // ISO 8601
}

/** A container for boards - Workspace in backend/app/models.py, where
 *  TaskBoard.workspace_id points at it and User.workspace_id says which one a
 *  person landed in.
 *
 *  Only the owner is modelled here. Membership is the `users` relationship on
 *  the model and has no route to read it, so the picker lists what this
 *  identity owns and nothing more. */
export interface Workspace {
  id: ID;
  title: string; // String(50)
  owner_id: ID;
  created_at: string;
}

export interface Board {
  id: ID;
  title: string; // String(30)
  owner_id: ID;
  /** Which workspace the board sits in - TaskBoard.workspace_id.
   *
   *  Null when nothing has said yet: TaskBoardRead does not carry the column,
   *  so a board fetched from the server arrives without one and the data layer
   *  fills it in from the local assignment map. See scopeBoards() in
   *  api/local.ts. */
  workspace_id: ID | null;
  created_at: string;
}

export interface Task {
  id: ID;
  board_id: ID;
  title: string; // String(30)
  description: string; // String(100)
  deadline: string | null; // date, "YYYY-MM-DD"
  image: string | null; // data: URL in the mock; an object-storage key later
  done: boolean; // NOT in models.py yet - see the note in the handover
  /** Task.priority_code on the backend: a plain int column, not a foreign key,
   *  carrying the codes in backend/app/data/json/priorities.json. Labels are
   *  resolved at render time - see lib/priority.ts. Not nullable, because the
   *  column is not. */
  priority_code: PriorityCode;
  created_at: string;
}

export interface Comment {
  id: ID;
  task_id: ID;
  content: string; // String(100)
  image: string | null;
  author_id: ID;
  created_at: string;
}

/** Who wrote a comment, as much as the store knows about them.
 *
 *  Deliberately shaped like lib/user.ts's Person plus the photo, so
 *  displayName(), handle() and initials() apply to it unchanged - a comment
 *  head and the account row in Settings are the same problem.
 *
 *  A separate type from User rather than a reuse of it, because a comment
 *  author is a projection: no created_at, and nothing about roles or
 *  workspaces. The server has no business shipping a thread's worth of
 *  workspace structure to render a name and a circle. */
export interface CommentAuthor {
  id: ID;
  first_name: string;
  last_name: string | null;
  username: string | null;
  photo_url: string | null;
}

export type MemberRole = "owner" | "member";
export type MemberStatus = "active" | "invited";

export interface Member {
  id: ID;
  user_id: ID; // Telegram user id of the member
  first_name: string;
  last_name: string | null;
  username: string | null;
  role: MemberRole; // maps to the Role model
  status: MemberStatus;
  board_ids: ID[]; // which boards this person was invited to
  created_at: string;
}

/** A share-link invite.
 *
 *  Token-based rather than a row pointing at a person, because the share sheet
 *  never tells the app who the sender picked - the link is what identifies the
 *  invite, and the invitee becomes known only when they open it. `board_ids`
 *  is what the token grants on accept. */
export interface Invite {
  id: ID;
  token: string; // "inv_" + 16 url-safe chars
  board_ids: ID[];
  created_by: ID;
  created_at: string;
  accepted_by: ID | null;
  accepted_at: string | null;
}
