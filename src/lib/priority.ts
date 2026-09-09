/* Task priority.

   `Task.priority_code` on the backend is a plain SmallInteger column, not a
   foreign key into a lookup table, and the codes below are copied from
   backend/app/data/json/priorities.json. There is nothing to join and nothing
   to seed: the labels are resolved here, at render time.

   The codes run LOW → HIGH (0 low, 1 medium, 2 high), so a larger number is
   more urgent and `ORDER BY priority_code DESC` reads the way it sounds. They
   were the other way round once; nothing below depends on the direction except
   byUrgency(), and nothing depends on the numbers themselves except the map -
   the CSS keys off `tone`, not the code, so a renumbering cannot silently
   repaint High as the calm colour.

   This file is the frontend's half of a contract that lives in two repos, so
   drift is the thing to design against: an unrecognised code is NOT quietly
   rounded to a default. See priorityOf() and toPriorityCode(). */

export type PriorityCode = 0 | 1 | 2;

/** What the code MEANS, which is what the styling keys off. Kept separate from
 *  the number so the two can be renumbered independently. */
export type PriorityTone = "calm" | "normal" | "urgent";

export interface Priority {
  code: number;
  /** name_en from the JSON, title-cased. What the chips and tags show. */
  label: string;
  /** Carried because the JSON has it and the bot speaks Ukrainian. Unused by
   *  the UI, which is English throughout. */
  label_uk: string;
  tone: PriorityTone;
  /** False for a code this build has no label for, so the UI can mark it
   *  rather than present a guess as fact. */
  known: boolean;
}

/** One of the codes this build knows, which is all the picker can offer. */
export interface KnownPriority extends Priority {
  code: PriorityCode;
  known: true;
}

/* In the JSON's own order, so the two can be read side by side. */
export const PRIORITIES: KnownPriority[] = [
  { code: 0, label: "Low", label_uk: "низький", tone: "calm", known: true },
  { code: 1, label: "Medium", label_uk: "середній", tone: "normal", known: true },
  { code: 2, label: "High", label_uk: "високий", tone: "urgent", known: true },
];

/** Most urgent first - the order the picker shows, because that is how someone
 *  reading three options expects to find the important one. */
export const PRIORITIES_BY_URGENCY: KnownPriority[] = [...PRIORITIES].reverse();

/** What a new task gets. Not null: `priority_code` is NOT NULL on the Task
 *  model, so a task without one is not a row the backend can hold. */
export const DEFAULT_PRIORITY: PriorityCode = 1;

/* Keyed by number, not PriorityCode: every lookup starts from whatever a row or
   a response actually held, which is exactly the value that might not be ours. */
const BY_CODE = new Map<number, KnownPriority>(PRIORITIES.map((p) => [p.code, p]));

/** A code the backend has and this bundle does not. Shown as itself rather than
 *  rounded to a neighbour: labelling an unknown "Medium" is a wrong answer
 *  stated confidently, and it hides exactly the drift worth noticing. */
function unknownPriority(code: number): Priority {
  return {
    code,
    label: `Priority ${code}`,
    label_uk: `Пріоритет ${code}`,
    tone: "normal",
    known: false,
  };
}

/** The priority to RENDER for whatever a row actually holds.
 *
 *  A missing value and an unrecognised one are different failures and get
 *  different answers: absent means the row predates the field, so the default
 *  is the right reading; present-but-unknown means the two sides disagree, and
 *  that gets surfaced. */
export function priorityOf(code: number | null | undefined): Priority {
  if (code == null) return BY_CODE.get(DEFAULT_PRIORITY)!;
  return BY_CODE.get(code) ?? unknownPriority(code);
}

/** The code to WRITE for whatever a row holds.
 *
 *  Reading and writing want different answers, which is why this is not
 *  priorityOf(). An unknown code can be displayed as itself, but it cannot be
 *  written back from a picker that has no chip for it, so here it does fall to
 *  the default - the alternative is an edit sheet that cannot round-trip the
 *  task it opened. */
export function toPriorityCode(code: number | null | undefined): PriorityCode {
  const found = code == null ? undefined : BY_CODE.get(code);
  return found ? found.code : DEFAULT_PRIORITY;
}

/** Sorts most urgent first. Codes run low → high, so this is the reverse of the
 *  numeric order; unknown codes sort after every known one rather than landing
 *  wherever their number happens to fall. */
export function byUrgency(a: number, b: number): number {
  const rank = (code: number) =>
    BY_CODE.has(code) ? code : Number.MIN_SAFE_INTEGER;
  return rank(b) - rank(a);
}
