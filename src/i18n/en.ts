/* ============================================================================
   English - the source dictionary.

   This file DEFINES the key set: every other locale is typed as
   Record<Key, Phrase>, so adding a line here breaks the build of any
   translation that has not caught up. That is the point - a missing string
   should be a compile error, not an English word surfacing in the middle of a
   Ukrainian screen.

   Placeholders are `{name}` and are filled from the params object at the call
   site. `{count}` is also what selects the plural form - see pick() in
   ./index.ts.
   ============================================================================ */

import type { Phrase } from "./types";

export const en = {
  /* ------------------------------------------------------------------ app -- */
  "app.nav.boards": "Taskboard",
  "app.nav.calendar": "Calendar",
  "app.nav.settings": "Settings",

  /* --------------------------------------------------------------- common -- */
  "common.back": "Back",
  "common.close": "Close",
  "common.none": "None",
  "common.online": "online",
  "common.offline": "offline",
  "common.checking": "…",

  /* ----------------------------------------------------------- workspaces -- */
  "workspaces.default": "Personal",
  "workspaces.switch": "Switch workspace",
  "workspaces.heading": "Workspaces",
  "workspaces.new": "New workspace",
  "workspaces.loadFailed": "Could not load your workspaces.",
  "workspaces.owned": "You own this one",
  "workspaces.shared": "Shared with you",
  "workspaces.settingsSub":
    "Switch between them from the name at the top of the Boards tab.",
  "workspaces.sheet.title": "New workspace",
  "workspaces.sheet.field": "Name",
  "workspaces.sheet.placeholder": "Design team",
  "workspaces.sheet.submit": "Create workspace",
  "workspaces.sheet.failed": "Could not create the workspace.",

  /* --------------------------------------------------------------- boards -- */
  "boards.title": "Boards",
  "boards.new": "New board",
  "boards.empty.title": "No boards yet",
  "boards.empty.withTasks":
    "A board holds a set of tasks — one per project, client or week.",
  "boards.empty.boardsOnly":
    "Create one to check that it reaches the backend and comes back.",
  "boards.allDone": "All done",
  "boards.open": "{count} open",
  "boards.loadFailed": "Could not load your boards.",
  "boards.notRegistered":
    "Not registered with the backend: {reason}. Boards cannot be saved.",
  "boards.sheet.title": "New board",
  "boards.sheet.field": "Title",
  "boards.sheet.placeholder": "Sprint 12",
  "boards.sheet.submit": "Create board",
  "boards.sheet.failed": "Could not create the board.",

  /* ---------------------------------------------------------------- board -- */
  "board.deleteAria": "Delete board",
  "board.newTaskAria": "New task",
  "board.noTasks": "No tasks yet",
  "board.openDone": "{open} open · {done} done",
  "board.taskCount": { one: "{count} task", other: "{count} tasks" },
  "board.confirmDelete":
    "Delete “{title}” and all of its tasks? This cannot be undone.",
  "board.saveFailed": "Could not save that.",
  "board.deleteFailed": "Could not delete the board.",
  "board.hidden.title": "Boards only, for now",
  "board.hidden.body":
    "This board is saved on the backend. Tasks are not yet, so they are hidden rather than written somewhere this board cannot see them.",
  "board.empty.title": "Nothing here yet",
  "board.empty.body": "Add the first task to this board.",
  "board.markDone": "Mark as done",
  "board.markNotDone": "Mark as not done",
  "board.sheet.title": "New task",
  "board.sheet.submit": "Create task",
  "board.sheet.failed": "Could not create the task.",

  /* ------------------------------------------------------------- calendar -- */
  "calendar.title": "Calendar",
  "calendar.today": "Today",
  "calendar.prevMonth": "Previous month",
  "calendar.nextMonth": "Next month",
  "calendar.nothingDue": "Nothing due on this day.",
  "calendar.noBoard": "—",

  /* ----------------------------------------------------------------- task -- */
  "task.title": "Task",
  "task.done": "Done",
  "task.open": "Open",
  "task.deleteAria": "Delete task",
  "task.confirmDelete": "Delete this task and its comments?",
  "task.deadline": "Deadline",
  "task.priority": "Priority",
  "task.edit": "Edit task",
  "task.sheet.title": "Edit task",
  "task.sheet.submit": "Save changes",
  "task.sheet.failed": "Could not save the task.",

  /* ------------------------------------------------------------- comments -- */
  "comments.title": "Comments",
  "comments.placeholder": "Add a comment",
  "comments.post": "Post comment",
  "comments.editAria": "Edit comment",
  "comments.deleteAria": "Delete comment",
  "comments.confirmDelete": "Delete this comment?",
  "comments.postFailed": "Could not post that comment.",
  "comments.saveFailed": "Could not save that comment.",
  "comments.deleteFailed": "Could not delete that comment.",
  "comments.loadFailed": "Could not load the comments.",
  "comments.sheet.title": "Edit comment",
  "comments.sheet.submit": "Save comment",
  "comments.attach": "Attach an image",
  "comments.you": "You",
  "comments.someone": "Teammate",

  /* ------------------------------------------------------------- settings -- */
  "settings.title": "Settings",
  "settings.account": "Account",
  "settings.signedIn": "Signed in with Telegram",
  "settings.language": "Language",
  "settings.languageSub": "Applies across the app on this device.",
  "settings.workspace": "Workspace",
  "settings.roleOwner": "owner",
  "settings.roleMember": "member",
  "settings.invited": "invited",
  "settings.noBoards": "No boards yet",
  "settings.confirmRemove": "Remove {name} from the workspace?",
  "settings.removeAria": "Remove {name}",
  "settings.removeFailed": "Could not remove them.",
  "settings.loadFailed": "Could not load your workspace.",
  "settings.invite": "Invite someone",
  "settings.inviteHint":
    "Create a board first — an invite grants access to specific boards.",
  "settings.inviteLinks": "Invite links",
  "settings.used": "used",
  "settings.shareAgain": "Share this link again",
  "settings.revoke": "Revoke this link",
  "settings.boardDeleted": "Board deleted",
  "settings.confirmRevoke":
    "Revoke this link? Anyone who already has it will not be able to join.",
  "settings.fallbackNote":
    "Telegram’s share sheet is only available inside the Telegram app — the link opened in a browser tab instead. It is listed below, ready to copy.",
  "settings.inviteText": "Join me on {what} in Planner",
  "settings.inviteBoards": { one: "{count} board", other: "{count} boards" },
  "settings.data": "Data",
  "settings.backend": "Backend",
  "settings.backendSub": "Boards and your account are stored on the server.",
  "settings.notRegistered": "Account not registered",
  "settings.localTag": "local",
  "settings.storedHere": "Stored in this browser",
  "settings.storedHereApi": "The workspace list and invites — not on the server yet.",
  "settings.storedHereLocal":
    "Nothing is sent to a server yet — invites are local only.",
  "settings.erase": "Erase local data",
  "settings.confirmErase":
    "Erase every board, task and comment stored in this browser? This cannot be undone.",
  "settings.sheet.title": "Invite to a board",
  "settings.sheet.noBotUsername":
    "BOT_USERNAME is not set in config.js — the link will point at t.me/?startapp=… and open nothing.",
  "settings.sheet.boards": "Boards they can open",
  "settings.sheet.selected": "{count} selected",
  "settings.sheet.hint":
    "Telegram opens its own share sheet next — search, recent chats and contacts — and sends the link from you. Nothing leaves this device until you pick someone there.",
  "settings.sheet.submit": "Choose a chat in Telegram",
  "settings.sheet.failed": "Could not create the invite.",

  /* --------------------------------------------------------------- invite -- */
  "invite.title": "You were invited",
  "invite.checking": "Checking the link…",
  "invite.unknownHandoff":
    "This link carries the token {token}, and Telegram delivered it to the app correctly — that is the whole handoff working.",
  "invite.unknownWhy":
    "It cannot be redeemed here because invites are still stored in the browser that created them. Once the backend has an /invites table, this is where the board would be joined.",
  "invite.boards": "Boards this link opens",
  "invite.boardsDeleted": "Those boards have since been deleted.",
  "invite.alreadyUsed": "This link has already been used.",
  "invite.join": "Join",
  "invite.joined": "You’re in",
  "invite.joinedBody": "The board is on your Taskboard tab now.",
  "invite.open": "Open Planner",
  "invite.loadFailed": "Could not load the boards.",
  "invite.acceptFailed": "Could not accept that invite.",

  /* --------------------------------------------------------------- fields -- */
  "fields.title": "Title",
  "fields.description": "Description",
  "fields.deadline": "Deadline",
  "fields.priority": "Priority",
  "fields.titlePlaceholder": "Write the release notes",
  "fields.descriptionPlaceholder": "Optional detail",

  /* ---------------------------------------------------------------- image -- */
  "image.label": "Image",
  "image.processing": "Processing…",
  "image.replace": "Replace",
  "image.attach": "Attach",
  "image.remove": "Remove image",
  "image.readFailed": "Could not read that image.",
  "image.tooLarge":
    "That image is too large even after compression. Try a smaller one.",
  "image.notAnImage": "That file is not an image we can read.",
  "image.noCanvas": "Canvas is unavailable in this browser.",

  /* ------------------------------------------------------------- priority -- */
  "priority.low": "Low",
  "priority.medium": "Medium",
  "priority.high": "High",
  "priority.unknown": "Priority {code}",

  /* ----------------------------------------------------------------- user -- */
  "user.telegram": "Telegram user",

  /* ----------------------------------------------------------------- date -- */
  "date.today": "Today",
  "date.tomorrow": "Tomorrow",
  "date.yesterday": "Yesterday",
  "date.justNow": "just now",

  /* ----------------------------------------------------------------- http -- */
  "http.noBackend": "No backend configured. Set API_BASE in config.js.",
  "http.unreachable": "Could not reach the server. Check your connection.",
  "http.timeout": "The server took too long to answer.",
  "http.failed": "Request failed ({status})",

  /* ------------------------------------------------------------------ api -- */
  "api.noIdentity": "No Telegram identity for this launch",
  "api.titleRequired": "Title required",
  "api.titleTooLong": "Title is limited to 30 characters",
  "api.noWorkspace":
    "No workspace to put this board in. Create one from the switcher at the top of the Boards tab.",
  "api.boardNotFound": "Board not found",
  "api.taskNotFound": "Task not found",
  "api.commentNotFound": "Comment not found",
  "api.memberNotFound": "Member not found",
  "api.ownerImmutable": "The owner cannot be removed",
  "api.writeSomething": "Write something first",
  "api.pickBoard": "Pick at least one board",
  "api.inviteInvalid": "That invite link is no longer valid",
  "api.inviteUsed": "That invite has already been used",
  "api.outOfStorage":
    "Out of local storage. Remove some task images, or clear the app data in Settings.",
  "api.localRow":
    "That row was created in local mode and does not exist on the server. Erase the local data in Settings.",
  "api.noRoute": "The backend has no {route} route yet.",
  "api.noUserId": "The server returned a user with no id.",
  "api.noBoardId": "The server returned a board with no id.",
  "api.noWorkspaceId": "The server returned a workspace with no id.",
  "api.noTaskId": "The server returned a task with no id.",
  "api.commentShape":
    "The server sent comments with no id, so none of them can be shown. Add `id` to CommentRead in backend/app/schemas.py — response_model only lets through the fields it declares.",

  /* -------------------------------------------------- why a feature hides -- */
  "missing.taskDone": "Marking a task done needs a `done` column on the Task model.",
  "missing.comments":
    "Comments need CommentRead in backend/app/schemas.py to carry id, user_id and created_at.",
  "missing.workspace":
    "Listing a workspace needs a route that reads the users sharing a workspace_id — the Workspace model itself already exists.",
  "missing.invites":
    "Invites need a table with a unique token, and routes to mint and redeem one.",

  /* -------------------------------------------------------------- credits -- */
  "powered.by": "Powered by",
} satisfies Record<string, Phrase>;
