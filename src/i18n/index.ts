/* ============================================================================
   Interface language.

   One active language for the whole app, held in a module-level store rather
   than a React context. Two reasons: the data layer throws user-facing strings
   (api/local.ts, lib/http.ts) from outside any component, and the screens read
   plain module constants at import time - neither can reach a context. So `t`
   is an ordinary function, and React subscribes to changes through useT().

   The choice is per DEVICE, not per account: it lives in localStorage, because
   the backend has no column for it and pinning it to the Telegram profile would
   make it unchangeable from here. A launch with nothing stored follows
   Telegram's own language_code, which is what the user already picked in the
   client.

   Adding a language is one file plus two lines here - the dictionary is typed
   against ./en, so the compiler lists every string still missing.
   ============================================================================ */

import { useSyncExternalStore } from "react";
import { tgUser } from "../telegram";
import { en } from "./en";
import { uk } from "./uk";
import type { Params, Phrase, Plural } from "./types";

export type { Params, Phrase } from "./types";

/** The key set, defined by the English dictionary. */
export type Key = keyof typeof en;

export type Lang = "en" | "uk";

const DICTS: Record<Lang, Record<Key, Phrase>> = { en, uk };

/** In the order the switcher shows them, labelled in the language itself -
 *  someone who has landed in a language they cannot read has to be able to find
 *  their way out, and "Ukrainian" is no help to a Ukrainian speaker. */
export const LANGUAGES: ReadonlyArray<{ code: Lang; label: string }> = [
  { code: "en", label: "English" },
  { code: "uk", label: "Українська" },
];

const STORE_KEY = "planner.lang.v1";

const FALLBACK: Lang = "en";

function isLang(value: unknown): value is Lang {
  return LANGUAGES.some((l) => l.code === value);
}

/** What this launch should open in.
 *
 *  Stored choice first, because it is the only one the user made deliberately.
 *  Then Telegram's language_code, then the browser's - both arrive as full tags
 *  ("uk-UA", "en-GB"), so only the primary subtag is compared. */
function detect(): Lang {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* storage blocked - fall through to the client's own preference */
  }

  const tags = [tgUser?.language_code, navigator.language, ...(navigator.languages ?? [])];
  for (const tag of tags) {
    const primary = String(tag ?? "").toLowerCase().split("-")[0];
    if (isLang(primary)) return primary;
  }
  return FALLBACK;
}

let active: Lang = detect();

/* ------------------------------------------------------------------ store -- */

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The active language. Safe to call from anywhere, including module scope. */
export function lang(): Lang {
  return active;
}

/** The BCP-47 tag to hand Intl. The same string as `lang()` today; kept as its
 *  own function because a locale is not a dictionary - a future "pt-BR" would
 *  want the tag while still reading the "pt" dictionary. */
export function locale(): string {
  return active;
}

/** Switches the language and re-renders everything subscribed through useT().
 *
 *  Also stamps <html lang>, which is what a screen reader picks its voice from
 *  and what `:lang()` rules in CSS would key off. */
export function setLang(next: Lang): void {
  if (next === active) return;
  active = next;

  try {
    localStorage.setItem(STORE_KEY, next);
  } catch {
    /* private mode - the choice holds for this launch and no longer */
  }

  document.documentElement.lang = next;
  for (const listener of listeners) listener();
}

// The initial stamp. Everything after it goes through setLang above.
document.documentElement.lang = active;

/* --------------------------------------------------------------- lookup -- */

function isPlural(phrase: Phrase): phrase is Plural {
  return typeof phrase !== "string";
}

/** The form to use for `count`, per the locale's own plural rules.
 *
 *  Intl decides the category - English has two, Ukrainian four - and `other` is
 *  the guaranteed fallback for one the dictionary did not spell out. */
function pick(phrase: Phrase, params: Params | undefined): string {
  if (!isPlural(phrase)) return phrase;

  const count = params?.count;
  if (typeof count !== "number") return phrase.other;

  const category = new Intl.PluralRules(locale()).select(count);
  return phrase[category] ?? phrase.other;
}

function fill(text: string, params: Params | undefined): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** The translated string for `key`.
 *
 *  Falls back to English for a key the active dictionary somehow lacks, and to
 *  the key itself if even that is missing - a visible `boards.title` on screen
 *  is a bug report; an empty string is a mystery. */
export function t(key: Key, params?: Params): string {
  const phrase = DICTS[active][key] ?? en[key];
  if (phrase === undefined) return key;
  return fill(pick(phrase, params), params);
}

/* ----------------------------------------------------------------- react -- */

/* One wrapper per language, handed out by useT() below.
   The identity matters. A single shared `t` would be stable forever, and every
   `useMemo(..., [t])` and `useCallback(..., [t])` built on it would be a
   dependency that can never fire - a month grid that stays in the old language
   after a switch, with a dependency list that looks correct. Changing identity
   exactly when the language changes makes `t` an honest dependency. */
const wrappers = new Map<Lang, typeof t>();

function wrapperFor(target: Lang): typeof t {
  const existing = wrappers.get(target);
  if (existing) return existing;
  const wrapper: typeof t = (key, params) => t(key, params);
  wrappers.set(target, wrapper);
  return wrapper;
}

/** Subscribes this component to language changes and hands back a translator.
 *
 *  Call it once at the top of a screen. The returned function is stable while
 *  the language is, so it is safe in a dependency list - and it belongs in one
 *  wherever a memo or a callback bakes a string in. */
export function useT(): typeof t {
  return wrapperFor(useSyncExternalStore(subscribe, lang, () => FALLBACK));
}

/** The active language plus the setter, for the switcher in Settings. */
export function useLang(): { lang: Lang; setLang: (next: Lang) => void } {
  const current = useSyncExternalStore(subscribe, lang, () => FALLBACK);
  return { lang: current, setLang };
}
