/* The order a board lists its tasks in.

   Shared by both halves of the data layer on purpose. It lived inline in
   local.ts first, and when the backend started serving tasks the remote half
   returned rows in the server's order instead - which is created_at, so ticking
   something off left it sitting at the top of the list. Two functions with the
   same name and the same signature quietly disagreeing is exactly what the
   local/remote split is prone to, so the rule lives in one place and neither
   half owns it. */

import { byUrgency, priorityOf } from "./priority";
import type { Task } from "../types";

/** Open work first, then the soonest deadline, then the most urgent, then
 *  oldest first.
 *
 *  Deadline outranks priority deliberately - something due tomorrow beats a
 *  "high" with no date - so priority decides among tasks sharing a deadline,
 *  which for undated ones is all of them. Tasks with no deadline sink below
 *  every dated one.
 *
 *  The created_at tiebreaker only does anything in local mode: TaskRead carries
 *  no created_at, so server rows all hold the epoch and the comparison above it
 *  has already decided. Harmless, and it keeps one comparator for both. */
export function boardOrder(a: Task, b: Task): number {
  if (a.done !== b.done) return a.done ? 1 : -1;

  const ad = a.deadline ?? "9999-12-31";
  const bd = b.deadline ?? "9999-12-31";

  return (
    ad.localeCompare(bd) ||
    byUrgency(priorityOf(a.priority_code).code, priorityOf(b.priority_code).code) ||
    a.created_at.localeCompare(b.created_at)
  );
}
