import type { ReactNode } from "react";
import type { PullToRefresh } from "../lib/pullToRefresh";

/** Wraps a screen's content so a pull moves it, with the spinner riding just
 *  above the first row.
 *
 *  The spinner is drawn rather than animated into view: while the finger is
 *  down it fades and turns in proportion to the pull, so the gesture reports
 *  its own progress and the threshold is something you can feel arriving
 *  instead of guess at. Only on release does it start spinning on its own. */
export function PullArea({ pull, children }: { pull: PullToRefresh; children: ReactNode }) {
  const progress = Math.min(pull.offset / 64, 1);

  return (
    <div
      className="ptr"
      style={{
        transform: `translateY(${pull.offset}px)`,
        /* No transition under the finger - it has to track exactly - and one
           on release, which is what makes the snap back read as elastic. */
        transition: pull.dragging ? "none" : "transform 220ms cubic-bezier(.2,.8,.3,1)",
      }}
    >
      <div className="ptr-indicator" aria-hidden={!pull.refreshing}>
        <div
          className={`ptr-spinner${pull.refreshing ? " is-spinning" : ""}`}
          style={
            pull.refreshing
              ? undefined
              : { opacity: progress, transform: `rotate(${pull.offset * 3}deg)` }
          }
        />
      </div>
      {children}
    </div>
  );
}
