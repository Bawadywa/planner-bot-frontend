/* How a person is labelled in the UI.

   Telegram's own convention: the real name is the label, the @handle is the
   secondary line, and neither is guaranteed - an account can have no surname,
   no username and no photo. Every helper here has to survive all three being
   absent, which is why they take the loose shape below rather than a User. */

import { t } from "../i18n";

export interface Person {
  first_name: string;
  last_name?: string | null;
  username?: string | null;
}

/** The primary label. Falls back to the @handle, then to a generic noun, so a
 *  row never renders as an empty string. */
export function displayName(person: Person): string {
  const full = [person.first_name, person.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (full) return full;
  return person.username ? `@${person.username}` : t("user.telegram");
}

/** The secondary line, or null when the account has no @username to show. */
export function handle(person: Person): string | null {
  return person.username ? `@${person.username}` : null;
}

/** Two letters for the avatar circle when there is no photo_url - initials of
 *  the first two words, or the first two characters of a single-word name. */
export function initials(person: Person): string {
  const source = displayName(person).replace(/^@/, "");
  const words = source.split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? `${words[0][0]}${words[1][0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}
