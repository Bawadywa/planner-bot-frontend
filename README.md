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
  api/index.ts      the seam — one table deciding which half serves each feature
  api/local.ts      localStorage implementation
  api/remote.ts     HTTP implementation, one function per real endpoint
  lib/http.ts       fetch, auth header, error mapping, defensive field readers
  types.ts          shapes mirroring backend/app/models.py
  telegram.ts       Mini App glue: insets, viewport, back-button stack, haptics
  lib/date.ts       deadline maths ("YYYY-MM-DD", no timezone shifts)
  lib/image.ts      downscales picked images before they go into localStorage
  components/       Sheet, TaskFields, ImagePicker, Icons
  screens/          Boards, Board, TaskDetail, Calendar, Settings, InviteAccept
```

## Data

Screens import `src/api` and nothing under it. Each feature is wired to either
the browser store or the backend by the `served` table in `src/api/index.ts`,
and `DATA_SOURCE` in `public/config.js` decides whether that table is honoured
at all.

| feature  | today    | endpoints it runs on / still needs                              |
| -------- | -------- | --------------------------------------------------------------- |
| identity | server   | `POST /user`                                                      |
| boards   | server   | `GET /taskboards`, `POST /taskboard` — read and create only       |
| ↳ rename | —        | needs `PATCH /taskboard`; raises 501 until then (no UI calls it)   |
| ↳ delete | server   | `DELETE /taskboard` (id in the body); sweeps local tasks too       |
| tasks    | browser  | needs `GET /taskboards/{id}/tasks`, `PATCH` + `DELETE /tasks/{id}`|
| comments | browser  | needs `GET` + `POST /tasks/{id}/comments`, `DELETE /comments/{id}`|
| team     | browser  | needs `GET /team`, `PATCH` + `DELETE /team/{id}`                  |
| invites  | browser  | needs `POST` + `GET /invites`, `GET` + `POST /invites/{token}`    |

Moving a feature across is one `false → true` in that table once its routes
exist. No screen changes — the two halves have identical signatures.

**In `api` mode the browser-backed features are hidden**, not merely unused:
the Calendar tab, the task list and its create button, the Team section, and
the invite flow all disappear, and an invite link opened in that mode says so
instead of resolving against the local store. With boards coming from the
server, a task list still quietly writing `localStorage` looks exactly like one
that works — until the same board is opened on a second device and it is empty.
A feature that is absent tells the truth; one that persists nowhere does not.

Anything with no route at all refuses out loud rather than pretending — a
visible refusal is worth more than a missing button you cannot tell from a bug.
In `local` mode nothing is hidden.

### Turning the backend on

1. Set `API_BASE` to the backend origin (scheme + host + port, **no path, no
   trailing slash**) and `DATA_SOURCE: "api"` in `public/config.js`.
2. Open the app **from inside Telegram**. Requests authenticate with the signed
   `initData` as `Authorization: tma <initData>`, which is exactly what
   `verify_headers()` in `backend/app/main.py` parses (it strips 4 characters of
   scheme). A desktop `npm run dev` has no `initData`, so it falls back to the
   local store with one console warning rather than 401-ing every screen.
3. Settings shows a **Backend** row with `/health` reachability, so a wrong
   `API_BASE` or a blocked CORS preflight is one line on screen rather than a
   failure on whichever tab was opened first.

The backend origin must be in the CORS allowlist as an **origin** —
`https://bawadywa.github.io`, not the app's full URL with its path. A path in
`allow_origins` never matches what the browser sends in `Origin:`.

The two stores do not share ids: local boards have uuids, server boards have the
database's ints. Switching modes on a device that already has data leaves the
old boards invisible and their tasks orphaned — erase the local data in Settings
after switching.

### Limits while a feature is still local

- **~5 MB total.** Images are stored as data: URLs, so `lib/image.ts` downscales
  every pick to 1280px / JPEG 0.72 and rejects anything still over 700 KB.
  Settings shows the current footprint.
- **One device.** Tasks, comments, team and invites live in one browser's
  storage. An invite link opened on the recipient's phone cannot resolve — the
  accept screen says so rather than showing an error.

## Not yet in the backend models

Against `backend/app/models.py` as it stands, the UI additionally needs:

- `Task.board_id` → `taskboards.id`. `Task.board` is declared as a relationship
  with no foreign key behind it, so a task cannot currently belong to a board at
  all — which is why tasks are the one feature that cannot move to the server
  even though `POST /task` exists.
- `Task.done` — a task board is unusable without completion state. A `status`
  column (or a `Column`/`Stage` table, if boards get named columns) is the
  fuller version.
- A constraint on `Task.priority_code`. It is a bare `int` column, so `999` is
  storable; `Literal[0, 1, 2]` on the Pydantic schema (or a CHECK) makes that a
  422 instead of a row nothing can label. `src/lib/priority.ts` mirrors the
  codes in `backend/app/data/json/priorities.json` and renders an unrecognised
  one as `Priority N` rather than rounding it to a neighbour, so drift between
  the two copies is visible instead of silent. The codes run low → high (2 is
  urgent); the CSS keys off a `tone` field rather than the number, so another
  renumbering cannot silently repaint High as the calm colour.
- `Comment.task_id` → `tasks.id`, the same missing FK one level down.
- A membership row carrying which boards a member may open, and an `invites`
  table with a unique token — the two features the demo can only fake locally.
- `User` has no `first_name` / `username` / `photo_url`. Nothing breaks without
  them (the launch payload carries them), but a comment written by someone else
  can only be labelled once those are stored server-side.
