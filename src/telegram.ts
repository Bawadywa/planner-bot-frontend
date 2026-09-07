/* ============================================================================
   Telegram Mini App glue.

   Everything here degrades to a no-op in a plain browser tab, so `npm run dev`
   on a desktop works without Telegram being involved at all.
   ============================================================================ */

interface TgInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TgBackButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface TgWebApp {
  ready(): void;
  expand(): void;
  isExpanded: boolean;
  platform?: string;
  isFullscreen?: boolean;
  exitFullscreen?(): void;
  safeAreaInset?: TgInset;
  contentSafeAreaInset?: TgInset;
  BackButton: TgBackButton;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  disableVerticalSwipes?(): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  openLink?(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink?(url: string): void;
  initDataUnsafe?: { start_param?: string };
  version?: string;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
    APP_CONFIG?: {
      API_BASE: string;
      DATA_SOURCE: "local" | "api";
      BOT_USERNAME: string;
      DEBUG: boolean;
    };
  }
}

export const tg: TgWebApp | undefined = window.Telegram?.WebApp;
export const inTelegram = Boolean(tg);

/* ------------------------------------------------------------- fullscreen --

   A Mini App can be launched straight INTO fullscreen: the "open app" / Main
   Mini App entry point sets tgWebAppFullscreen, and nothing in the page asked
   for it. On desktop that is a trap - the client drops the Mini App window's
   frame, so the app appears wherever the client put it, at whatever size it
   chose, with no title bar left to drag. It cannot be moved and it cannot be
   resized. So a launch-time fullscreen is dropped on any desktop-like client.

   On a phone fullscreen is fine and is kept: there Telegram's own floating
   controls and the device notch sit ON TOP of the page, which is exactly what
   the insets below pad for.

   The fullscreen API arrived in Bot API 8.0; older clients report nothing and
   exitFullscreen THROWS, hence the optional calls and the try/catch. */

const MOBILE_PLATFORMS = ["android", "android_x", "ios"];

function isTouchDevice(): boolean {
  try {
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/** Desktop = not a known mobile client AND not a touch screen, so an unknown
 *  platform on a phone keeps its fullscreen instead of being forced out of it. */
function isDesktopLike(): boolean {
  const platform = String(tg?.platform ?? "unknown").toLowerCase();
  return !MOBILE_PLATFORMS.includes(platform) && !isTouchDevice();
}

/* The client only clears isFullscreen once it answers with fullscreenChanged,
   so this flag keeps the page from painting fullscreen padding it is about to
   lose - a strip of dead space at the top for as long as the round trip takes. */
let fsExitPending = false;

function inFullscreen(): boolean {
  return Boolean(tg?.isFullscreen) && !fsExitPending;
}

function normalizeFullscreen(): void {
  if (!tg?.isFullscreen || !isDesktopLike()) return;
  try {
    tg.exitFullscreen?.();
    fsExitPending = true;
  } catch (e) {
    console.warn("[planner] exitFullscreen unsupported by this client", e);
  }
}

/** Copies Telegram's reported insets into CSS custom properties.
 *
 *  Only in fullscreen. There the Mini App owns the whole screen, so the notch
 *  and Telegram's own floating controls sit on top of the page: `safeAreaInset`
 *  is the device chrome, `contentSafeAreaInset` is Telegram's own, and they
 *  stack, so the layout has to pad by the sum - without it the bottom nav ends
 *  up underneath Telegram's bar and the top row underneath the close button.
 *
 *  In the normal launch mode Telegram's chrome is OUTSIDE the webview, so the
 *  properties are cleared instead and the 0px defaults in styles.css apply;
 *  padding by them there would only add a dead strip. */

// Insets exist from Bot API 8.0 on. When a fullscreen client stays silent this
// still clears its controls, which is the failure that actually hurts.
const FS_TOP_FALLBACK = 56;

function applyInsets(): void {
  const root = document.documentElement;

  if (!inFullscreen()) {
    for (const side of ["top", "bottom", "left", "right"]) {
      root.style.removeProperty(`--inset-${side}`);
    }
    return;
  }

  const safe = tg?.safeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const content = tg?.contentSafeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };

  const top = Math.max(safe.top + content.top, FS_TOP_FALLBACK);
  root.style.setProperty("--inset-top", `${top}px`);
  root.style.setProperty("--inset-bottom", `${safe.bottom + content.bottom}px`);
  root.style.setProperty("--inset-left", `${safe.left + content.left}px`);
  root.style.setProperty("--inset-right", `${safe.right + content.right}px`);
}

export function initTelegram(): void {
  if (!tg) return;

  tg.ready();
  if (!tg.isExpanded) tg.expand();

  // Desktop: never stay in a fullscreen the launch entry point asked for.
  normalizeFullscreen();

  // Our palette is a fixed light one, so pin Telegram's chrome to match rather
  // than following the user's Telegram theme. Keep these two in step with --bg
  // in styles.css, or a strip of the client shows through in the wrong colour.
  tg.setHeaderColor?.("#f7f9fb");
  tg.setBackgroundColor?.("#f7f9fb");

  // A vertical swipe inside a scrolling task list would otherwise start
  // dismissing the Mini App.
  tg.disableVerticalSwipes?.();

  applyInsets();

  tg.onEvent("fullscreenChanged", () => {
    fsExitPending = false;
    applyInsets();
  });
  tg.onEvent("safeAreaChanged", applyInsets);
  tg.onEvent("contentSafeAreaChanged", applyInsets);
  // The insets move on their own: rotation, keyboard, Telegram shifting its
  // controls. The page's height is Telegram's own CSS variable, not ours.
  tg.onEvent("viewportChanged", applyInsets);

  // Bound once for the life of the app; what it does depends on the stack.
  tg.BackButton.onClick(dispatchBack);
  tg.BackButton.hide();
}

/* Telegram exposes exactly one back arrow, but the UI nests: a sheet can sit on
   top of a pushed task screen, which sits on top of a tab. So handlers go on a
   stack and only the top one is ever invoked - otherwise opening a sheet over a
   screen would dismiss both at once. */

const backStack: Array<() => void> = [];

function dispatchBack(): void {
  backStack[backStack.length - 1]?.();
}

function syncBackButton(): void {
  if (!tg) return;
  if (backStack.length > 0) tg.BackButton.show();
  else tg.BackButton.hide();
}

/** Pushes a dismiss handler onto the back stack. Returns the matching pop, so
 *  a React effect can just `return pushBack(onClose)`. */
export function pushBack(handler: () => void): () => void {
  backStack.push(handler);
  syncBackButton();

  return () => {
    const at = backStack.lastIndexOf(handler);
    if (at !== -1) backStack.splice(at, 1);
    syncBackButton();
  };
}

/** Opens an external URL. Inside Telegram a plain target="_blank" is swallowed
 *  by the webview, so the client has to be asked to open it; in a browser the
 *  anchor's own default is left to run.
 *
 *  Returns true when it handled the navigation, so a click handler knows
 *  whether to call preventDefault(). */
export function openLink(url: string): boolean {
  if (tg?.openLink) {
    tg.openLink(url);
    return true;
  }
  return false;
}

/** Telegram's native confirm dialog where it exists, the browser's otherwise.
 *  Both are destructive-action gates, so callers always await the answer. */
export function confirmAction(message: string): Promise<boolean> {
  if (tg?.showConfirm) {
    return new Promise((resolve) => tg.showConfirm!(message, resolve));
  }
  return Promise.resolve(window.confirm(message));
}

export function haptic(style: "light" | "medium" | "heavy" = "light"): void {
  tg?.HapticFeedback?.impactOccurred(style);
}

export function hapticError(): void {
  tg?.HapticFeedback?.notificationOccurred("error");
}

/* ----------------------------------------------------------------- invites --

   Sharing an invite hands the job to Telegram's own share sheet rather than
   building a contact picker in here - a bot is never given the user's contact
   list, so a picker of our own could only ever be a list of people who already
   use the app. `t.me/share/url` opens the same sheet the client uses to forward
   a message: search, recent chats, contacts, multi-select.

   The upgrade path is WebApp.shareMessage() (Bot API 8.0), which sends a proper
   card with a "Join board" button instead of a link preview. It needs the
   backend to mint a prepared_message_id first, so it stays behind this seam:
   only shareToTelegram() changes when that lands. */

/** The bot's @username, normalised - config may or may not include the @. */
export const botUsername = String(window.APP_CONFIG?.BOT_USERNAME ?? "")
  .trim()
  .replace(/^@/, "");

/** A link that opens THIS Mini App with the token attached.
 *
 *  `?startapp=` (not `?start=`) is what jumps straight into the app instead of
 *  landing in the bot chat first; Telegram then hands the value back as
 *  initDataUnsafe.start_param. It requires the bot to have a Main Mini App set
 *  in BotFather - without one the link opens the chat, which is why the bot
 *  also answers /start with the same token. */
export function inviteLink(token: string): string {
  return `https://t.me/${botUsername}?startapp=${encodeURIComponent(token)}`;
}

/** Opens Telegram's native "Share to…" sheet on `url`.
 *
 *  Returns true when the native sheet was used, false when it fell back to a
 *  plain browser tab (desktop `npm run dev`, where there is no client to ask).
 *
 *  Note for old clients: up to Bot API 7.0 openTelegramLink CLOSED the Mini App
 *  on the way out, so the share sheet appears but the app is gone behind it.
 *  From 7.0 on the app stays open underneath. Nothing can be done about it from
 *  here - it is a reason to prefer shareMessage() eventually, not a bug. */
export function shareToTelegram(url: string, text: string): boolean {
  const share =
    `https://t.me/share/url?url=${encodeURIComponent(url)}` +
    `&text=${encodeURIComponent(text)}`;

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(share);
    return true;
  }
  window.open(share, "_blank", "noopener");
  return false;
}

/** The launch parameter this session arrived with, or null.
 *
 *  Three places have to be checked because three different entry points put it
 *  somewhere different:
 *    - initDataUnsafe.start_param - t.me/<bot>?startapp=<token>
 *    - #tgWebAppStartParam        - the same launch, straight off the URL, which
 *                                   is also what survives a reload
 *    - ?startapp= / ?inv=         - a WebApp keyboard button, whose URL we build
 *                                   ourselves (Telegram does NOT forward the
 *                                   /start payload into it), and hand-typing it
 *                                   in a browser while developing
 *
 *  Read once at module load: Telegram does not update these after launch, and a
 *  later read would race the history.replaceState below. */
function findStartParam(): string | null {
  const fromInitData = tg?.initDataUnsafe?.start_param;
  if (fromInitData) return fromInitData;

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const fromHash = hash.get("tgWebAppStartParam");
  if (fromHash) return fromHash;

  const query = new URLSearchParams(window.location.search);
  return query.get("startapp") ?? query.get("inv");
}

export const startParam: string | null = findStartParam();

/** Invite tokens are namespaced so a start_param can carry other things later
 *  (a deep link to one task, say) without the accept flow grabbing it. */
export const INVITE_PREFIX = "inv_";

export const startInviteToken: string | null =
  startParam && startParam.startsWith(INVITE_PREFIX) ? startParam : null;

/** Drops the token from the address bar once it has been handled, so a reload
 *  does not re-open the accept sheet on an invite already dealt with. */
export function clearStartParam(): void {
  if (!window.location.search && !window.location.hash) return;
  try {
    window.history.replaceState(null, "", window.location.pathname);
  } catch {
    // Some webviews refuse replaceState on a non-http origin. Harmless: the
    // sheet is dismissible, this only saves the user one tap on reload.
  }
}
