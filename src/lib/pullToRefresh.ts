/* ============================================================================
   Pull down at the top of a list to reload it.

   Touch only, and deliberately so: the gesture does not exist on a desktop
   pointer, and faking it with a mouse would put a spinner on screen for a drag
   nobody performed. `npm run dev` in a browser simply never triggers it.

   Two things about running inside Telegram make this work at all:

   - The client's own vertical swipe would otherwise close the Mini App rather
     than reach the page. telegram.ts already calls disableVerticalSwipes() at
     start-up, which is what leaves the gesture available here.
   - touchmove is bound with { passive: false } so the pull can preventDefault
     and stop the webview rubber-banding underneath the content. A passive
     listener silently cannot, and the result is a page that bounces without
     ever refreshing.
   ============================================================================ */

import { useEffect, useRef, useState, type RefObject } from "react";
import { haptic } from "../telegram";

/** How far the content must travel before the release counts as a refresh. */
const THRESHOLD = 64;

/** The furthest it will travel, however hard the pull. */
const MAX = 96;

/** Finger distance is halved on the way to travel, so the list feels weighted
 *  rather than glued to the fingertip - the same damping every native list has
 *  and the reason a pull reads as resisted rather than free. */
const RESISTANCE = 0.5;

export interface PullToRefresh {
  /** Put this on the SCROLLING element - the one with overflow-y: auto. */
  ref: RefObject<HTMLDivElement | null>;
  /** How far the content should currently be pushed down, in pixels. */
  offset: number;
  /** True from release until the refresh settles. */
  refreshing: boolean;
  /** True once the pull is far enough that letting go would refresh. */
  armed: boolean;
  /** True while a finger is actually moving the list, so the caller can drop
   *  its transition and track the finger exactly. */
  dragging: boolean;
}

export function usePullToRefresh(onRefresh: () => void | Promise<void>): PullToRefresh {
  const ref = useRef<HTMLDivElement | null>(null);

  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);

  /* Everything the listeners read lives in refs. They are bound once, for the
     life of the element, so anything they closed over would be the value from
     the first render - including the reload function, which changes every time
     the screen's dependencies do. */
  const startY = useRef<number | null>(null);
  const armed = useRef(false);
  const busy = useRef(false);
  const latest = useRef(onRefresh);
  latest.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function reset() {
      startY.current = null;
      armed.current = false;
      setDragging(false);
      setOffset(0);
    }

    function onStart(e: TouchEvent) {
      // Only a single finger, and only from a list that is already at its top -
      // otherwise this is an ordinary scroll, or a pinch.
      if (busy.current || e.touches.length !== 1) return;
      startY.current = el!.scrollTop <= 0 ? e.touches[0].clientY : null;
    }

    function onMove(e: TouchEvent) {
      if (startY.current === null || busy.current) return;

      const dy = e.touches[0].clientY - startY.current;

      /* Pulling up, or the list has scrolled away under the finger. Give the
         gesture back to the browser rather than half-owning it: a pull that
         turns into a scroll mid-stroke should scroll. */
      if (dy <= 0 || el!.scrollTop > 0) {
        if (startY.current !== null) reset();
        return;
      }

      e.preventDefault();

      const next = Math.min(dy * RESISTANCE, MAX);
      setDragging(true);
      setOffset(next);

      const nowArmed = next >= THRESHOLD;
      if (nowArmed !== armed.current) {
        armed.current = nowArmed;
        // Only on the way in. Crossing back out is the user changing their
        // mind, and buzzing at them for it is noise.
        if (nowArmed) haptic();
      }
    }

    async function onEnd() {
      if (startY.current === null) return;

      startY.current = null;
      setDragging(false);

      if (!armed.current) {
        setOffset(0);
        return;
      }

      armed.current = false;
      busy.current = true;
      setRefreshing(true);
      // Held at the threshold while the work runs, which is what makes the
      // spinner look like it is waiting on something rather than snapping back.
      setOffset(THRESHOLD);

      try {
        await latest.current();
      } catch {
        /* The screen reports its own failures - this only drives the spinner,
           and leaving it turning on a refresh that already failed would be the
           one outcome worse than no refresh. */
      } finally {
        busy.current = false;
        setRefreshing(false);
        setOffset(0);
      }
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return { ref, offset, refreshing, armed: offset >= THRESHOLD, dragging };
}
