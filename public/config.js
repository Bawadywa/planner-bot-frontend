/* ============================================================================
   Planner Mini App - runtime config
   ----------------------------------------------------------------------------
   This file is NOT bundled. Vite copies it as-is into dist/, so on a deployed
   build you can change the backend URL by editing dist/config.js and reloading
   - no npm run build needed.

   API_BASE  Origin of the FastAPI backend: scheme, host and port only, NO path
             and NO trailing slash. e.g. "https://api.example.com".
             Unused while DATA_SOURCE is 'local'.

   DATA_SOURCE
             'local'  - everything lives in this browser's localStorage
             'api'    - identity and boards come from API_BASE. Tasks,
                        comments, team and invites have no routes yet, so in
                        this mode their UI is HIDDEN rather than left running
                        against localStorage - otherwise they would look like
                        they work until the same board is opened on a second
                        device. See the table in src/api/index.ts for what
                        moves when.

             'api' needs two things to work, and quietly falls back to 'local'
             (with one console warning) without them:
               - a non-empty API_BASE
               - a launch from inside Telegram, so there is signed initData to
                 authenticate with. A desktop `npm run dev` has none, which is
                 why the fallback exists rather than an error on every screen.

             The two stores do not share ids: boards created in 'local' mode
             have uuids, boards created in 'api' mode have the database's ints.
             Switching modes on a device that already has data leaves the old
             boards invisible and their tasks orphaned - erase the local data in
             Settings after switching.

   BOT_USERNAME
             The bot's @username WITHOUT the @, exactly as BotFather shows it
             (letters, digits and underscores only - no hyphens). Invite links
             are built as t.me/<BOT_USERNAME>?startapp=<token>, so a wrong value
             here produces a link that opens a "user not found" page.

   DEBUG     Logs every failed request and the chosen data source to the
             console. Off in production - the log lines name the backend URL.
   ============================================================================ */
window.APP_CONFIG = {
  API_BASE: "https://dominion-strenuous-wrongful.ngrok-free.dev",
  DATA_SOURCE: "api",
  BOT_USERNAME: "lycee_planner_bot",
  DEBUG: true,
};
