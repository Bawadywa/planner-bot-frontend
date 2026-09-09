/* ============================================================================
   HTTP transport.

   Everything that knows about fetch, base URLs, headers and error shapes lives
   here. src/api/remote.ts is left holding endpoint names and field mapping, and
   the screens never see any of it.

   Auth is Telegram's own. The client signs initData with the bot token before
   the page loads, so the signed blob goes up verbatim as

       Authorization: tma <initData>

   and verify_headers() in backend/app/main.py re-checks its HMAC on every
   request. There is no session, no cookie and no token to refresh - which is
   why `credentials` is deliberately left at its default below: sending cookies
   would only widen what CORS has to allow, for nothing.
   ============================================================================ */

import { initData } from "../telegram";

/* ----------------------------------------------------------------- config -- */

const config = window.APP_CONFIG;

/** Origin of the FastAPI app, without a trailing slash. Empty when unset. */
export const API_BASE = String(config?.API_BASE ?? "").replace(/\/+$/, "");

export const DEBUG = Boolean(config?.DEBUG);

/** What config.js asked for. Whether it can actually be honoured is
 *  `serverConfigured` below - "api" with no API_BASE is a misconfiguration, not
 *  an instruction to fail every screen. */
export const dataSource: "local" | "api" =
  config?.DATA_SOURCE === "api" ? "api" : "local";

/** Whether a real request could even be made.
 *
 *  initData is required, not optional: without it every call is a guaranteed
 *  401 from verify_headers(). That is the normal state of `npm run dev` in a
 *  desktop browser, where nothing signs a user - so the data layer falls back
 *  to the local mock there instead of failing every screen. */
export const serverConfigured = Boolean(API_BASE) && Boolean(initData);

/** Why the server is not being used, for the one warning the facade logs. */
export function unusableReason(): string | null {
  if (!API_BASE) return "API_BASE is empty in config.js";
  if (!initData) return "no Telegram initData in this launch (opened outside Telegram?)";
  return null;
}

/* ------------------------------------------------------------------ errors -- */

/** Mirrors an HTTP failure so screens can branch on `status`.
 *
 *  status 0 means the request never got an answer - DNS, TLS, a blocked CORS
 *  preflight, or the phone simply being offline. The browser deliberately hides
 *  which of those it was, so the message can only be a general one. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** FastAPI answers `{"detail": ...}` for both HTTPException (a string) and
 *  request validation (a list of {loc, msg, type}). Both are unpacked here so a
 *  screen can show the message as it stands. */
function messageFrom(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload.trim()) return payload;

  if (payload && typeof payload === "object") {
    const detail = (payload as { detail?: unknown }).detail;

    if (typeof detail === "string" && detail.trim()) return detail;

    if (Array.isArray(detail)) {
      const parts = detail
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const { loc, msg } = item as { loc?: unknown[]; msg?: string };
          const field = Array.isArray(loc)
            ? loc.filter((part) => part !== "body").join(".")
            : "";
          return field ? `${field}: ${msg ?? "invalid"}` : (msg ?? null);
        })
        .filter(Boolean);
      if (parts.length) return parts.join("; ");
    }
  }

  return `Request failed (${status})`;
}

/* --------------------------------------------------------------- requests -- */

/* Mobile data can leave a fetch hanging for minutes. A Mini App that looks
   frozen is worse than one that says it could not reach the server, so every
   request is capped. AbortSignal.timeout() is not in every Telegram webview
   yet, hence the explicit controller. */
const TIMEOUT_MS = 15_000;

export interface RequestOptions {
  /** Appended as a query string. Undefined values are dropped. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Serialised as a JSON body. Omit for GET. */
  body?: unknown;
}

function buildUrl(path: string, query: RequestOptions["query"]): string {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** One request. Resolves with the parsed JSON body, or undefined for an empty
 *  one - /health answers 200 with no body at all. */
export async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  if (!API_BASE) {
    throw new ApiError(0, "No backend configured. Set API_BASE in config.js.");
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (initData) headers.Authorization = `tma ${initData}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  /* A free ngrok tunnel answers anything with a browser User-Agent with its own
     HTML interstitial instead of proxying, which arrives here as a parse
     failure on every call. This header is the documented opt-out. Sent only for
     ngrok hosts, so a backend with a strict allow_headers list never sees an
     unexpected header on its preflight. */
  if (/\bngrok[\w.-]*\.(dev|io|app)$/i.test(new URL(API_BASE).hostname)) {
    headers["ngrok-skip-browser-warning"] = "planner";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (err) {
    if (DEBUG) console.warn(`[planner] ${method} ${path} failed`, err);
    throw new ApiError(
      0,
      controller.signal.aborted
        ? "The server took too long to answer."
        : "Could not reach the server. Check your connection.",
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload: unknown = undefined;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text; // an HTML error page from a proxy, most likely
    }
  }

  if (!response.ok) {
    if (DEBUG) console.warn(`[planner] ${method} ${path} -> ${response.status}`, payload);
    throw new ApiError(response.status, messageFrom(payload, response.status));
  }

  return payload as T;
}

export const get = <T,>(path: string, query?: RequestOptions["query"]) =>
  request<T>("GET", path, { query });

export const post = <T,>(path: string, body?: unknown) =>
  request<T>("POST", path, { body });

/* ------------------------------------------------------------ field helpers --

   The backend is still being written, so responses are read defensively: a
   field that is missing today (TaskBoardRead carries no created_at) must not
   turn into a crash, and one that arrives as an int - every primary key does -
   has to become the string the UI's ID type expects. */

export type Raw = Record<string, unknown>;

export function asRaw(value: unknown): Raw {
  return value && typeof value === "object" ? (value as Raw) : {};
}

/** Primary keys are ints server-side and opaque strings here. */
export function asId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** SQLAlchemy datetimes arrive as naive ISO strings, which Date would read as
 *  local time; server_default=func.now() makes them UTC, so an unqualified one
 *  is treated as such. Anything unparseable becomes the epoch, which sorts
 *  oldest-first rather than throwing. */
export function asIso(value: unknown): string {
  if (typeof value === "string" && value) {
    const utc = /[Zz]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
    const at = new Date(utc);
    if (!Number.isNaN(at.getTime())) return at.toISOString();
  }
  return new Date(0).toISOString();
}
