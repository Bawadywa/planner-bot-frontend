/* ============================================================================
   Planner Mini App - runtime config
   ----------------------------------------------------------------------------
   This file is NOT bundled. Vite copies it as-is into dist/, so on a deployed
   build you can change the backend URL by editing dist/config.js and reloading
   - no npm run build needed.

   API_BASE  Origin of the FastAPI backend, NO trailing slash.
             Unused while DATA_SOURCE is 'local'.

   DATA_SOURCE
             'local'  - everything lives in this browser's localStorage (today)
             'api'    - talk to API_BASE over HTTP (once the endpoints exist)

   BOT_USERNAME
             The bot's @username WITHOUT the @, exactly as BotFather shows it
             (letters, digits and underscores only - no hyphens). Invite links
             are built as t.me/<BOT_USERNAME>?startapp=<token>, so a wrong value
             here produces a link that opens a "user not found" page.
   ============================================================================ */
window.APP_CONFIG = {
  API_BASE: "",
  DATA_SOURCE: "local",
  BOT_USERNAME: "planner_bot",
  DEBUG: false,
};
