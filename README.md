# planner-bot-frontend

Telegram Mini App for the planner: boards, tasks, calendar, team.

React + TypeScript, built by Vite into plain static files. No server-side
rendering and no Node runtime in production — `dist/` is just HTML, JS and CSS.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/
npm run preview    # serve the built dist/
npm run typecheck  # tsc --noEmit
```

Deploy by copying `dist/` to any static host and pointing the Mini App URL at it.

## Layout

```
index.html          Vite entry; loads the Telegram SDK and config.js
public/config.js    runtime config, copied verbatim into dist/ (edit without rebuilding)
src/
  api.ts            data layer — every function named after the endpoint it will become
  types.ts          shapes mirroring backend/app/models.py
  telegram.ts       Mini App glue: insets, viewport, back-button stack, haptics
  lib/date.ts       deadline maths ("YYYY-MM-DD", no timezone shifts)
  lib/image.ts      downscales picked images before they go into localStorage
  components/       Sheet, TaskFields, ImagePicker, Icons
  screens/          Auth, Boards, Board, TaskDetail, Calendar, Settings
```

## Data

**Nothing talks to the backend yet.** `src/api.ts` reads and writes
`localStorage` under `planner.db.v1`, with the session under
`planner.session.v1`.

Every function is async and shaped like the HTTP call it stands in for, so
switching over means rewriting the bodies of `api.ts` and nothing else. The
endpoint each one replaces is named in the comment above it:

| `api.ts`                          | becomes                          |
| --------------------------------- | -------------------------------- |
| `register` / `login` / `logout`   | `POST /auth/*`                   |
| `listBoards` / `createBoard`      | `GET` / `POST /boards`           |
| `listTasks` / `createTask`        | `GET` / `POST /boards/{id}/tasks`|
| `listComments` / `createComment`  | `GET` / `POST /tasks/{id}/comments` |
| `listMembers` / `inviteMember`    | `GET /team` / `POST /team/invites` |

`public/config.js` already carries `DATA_SOURCE` (`'local'` / `'api'`) and
`API_BASE` for that switch.

### Limits while the data is local

- **~5 MB total.** Images are stored as data: URLs, so `lib/image.ts` downscales
  every pick to 1280px / JPEG 0.72 and rejects anything still over 700 KB.
  Settings shows the current footprint.
- **One device.** Accounts, boards and invites live in one browser's storage.
  An invite records the address and the boards it grants — no email is sent.
- **Passwords are hashed in the browser** (SHA-256, no salt, no work factor)
  only so plaintext never sits in storage. Real hashing belongs server-side.

## Not yet in the backend models

`backend/app/models.py` has `Role`, `TaskBoard`, `Team`, `Task` and `Comment` as
stubs. Against those, the UI additionally needs:

- `Task.done` — a task board is unusable without completion state. A `status`
  column (or a `Column`/`Stage` table, if boards get named columns) is the
  fuller version.
- `Board.owner_id` → `users.id`, and a `Team`/membership row carrying which
  boards a member may open.
- `User.email` wants `String(254)`, `unique=True`, `index=True` — it is the
  login lookup.
