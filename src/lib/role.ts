/* ============================================================================
   The roles an invite can grant.

   This table is a STAND-IN, and it is worth being blunt about why. The roles
   live in a `roles` table server-side, seeded by backend/app/seed.py, and there
   is no route that lists them - so the ids below are read off the seed's
   insertion order rather than fetched. They are right for a database filled by
   that seed and never edited by hand.

   What goes wrong if they drift: InviteCreate.role_id is a foreign key, so a
   wrong number is not a wrong label, it is an IntegrityError on the INSERT and
   a 500 on the share sheet. That is the reason this sits in one file with one
   export rather than as a literal next to the request.

   A `GET /roles` returning {id, name} retires the whole file: the sheet would
   render whatever came back, and an invite could never name a role the database
   does not have.
   ============================================================================ */

import type { Key } from "../i18n";
import type { ID } from "../types";

export interface InviteRole {
  /** roles.id, as a string like every other ID here. */
  id: ID;
  /** Dictionary key rather than a label, so the sheet re-renders in the
   *  sender's language when they switch it mid-invite. */
  label: Key;
}

/* In the order seed.py inserts them, which is the order the ids run in.
   Offered widest-first, the way a permission list reads. */
export const INVITE_ROLES: readonly InviteRole[] = [
  { id: "1", label: "roles.admin" },
  { id: "2", label: "roles.manager" },
  { id: "3", label: "roles.worker" },
];

/** What the sheet opens on.
 *
 *  The narrowest one. A share link is forwardable and single-use only because
 *  the server marks it spent, so the default should be the role that costs
 *  least if it reaches the wrong chat - handing out `admin` by accident should
 *  take a deliberate tap. */
export const DEFAULT_INVITE_ROLE: ID = "3";

export function inviteRole(id: ID): InviteRole | undefined {
  return INVITE_ROLES.find((role) => role.id === id);
}
