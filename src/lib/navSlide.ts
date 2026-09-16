/* ============================================================================
   Press the bottom nav, keep the finger down, and slide: whichever tab is
   under the fingertip becomes the open one, and lifting off leaves it there.
   The same gesture Instagram's tab bar has - a tap is the degenerate case of
   it, so nothing about tapping changes.

   Touch only, like lib/pullToRefresh.ts, and for the same reason: a mouse has
   no equivalent of a finger resting on the screen, and a click still switches
   tabs on its own. Dragging a mouse across the bar simply does nothing.

   Two details that are easy to get wrong:

   - touchmove is bound with { passive: false } so a horizontal stroke can be
     claimed with preventDefault. Left to the webview it is a swipe, and
     Telegram reads its own swipes as "close the Mini App" - the app would
     vanish mid-gesture. `touch-action: none` on the bar says the same thing
     ahead of time; the call is what covers clients that ignore it.
   - After the finger lifts, the browser sends a click to the element the touch
     STARTED on, which after a slide is the tab the user just left. Letting it
     through would bounce them straight back, so a slide swallows the click
     that follows it.
   ============================================================================ */

import { useEffect, useRef, useState } from "react";

/** How far the finger must travel before the stroke counts as a slide. Below
 *  this it is a tap with a shaky hand, and the button's own onClick owns it. */
const SLOP = 8;

/** How long after a slide a click is still assumed to be its ghost. A backstop
 *  only: the window is normally closed by the next touch (see onStart), and the
 *  clients that never send the click at all are what it is here for. */
const GHOST_MS = 400;

export interface NavSlide {
  /** Put this on the element the buttons live in. Each button needs a
   *  `data-tab` attribute holding the value handed back to onSelect.
   *
   *  A callback ref rather than an object one, because the bar is not on screen
   *  for the app's first render - it waits on the launch identity - and a plain
   *  ref would have been null the one time the listeners are bound. */
  ref: (el: HTMLElement | null) => void;
  /** True while a finger is actually dragging along the bar, so the caller can
   *  show which tab it is over instead of leaving :active on the one it left. */
  sliding: boolean;
}

/** @param onSelect fires once per tab the finger crosses into, never for the
 *  tab it started on. Switching is live rather than on release: the point of
 *  the gesture is seeing the screens go by. */
export function useNavSlide<T extends string>(onSelect: (tab: T) => void): NavSlide {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [sliding, setSliding] = useState(false);

  /* The listeners are bound once, for the life of the bar, so everything they
     read lives in a ref - including the callback, which is a fresh closure on
     every render of the app shell. Same reasoning as pullToRefresh.ts. */
  const latest = useRef(onSelect);
  latest.current = onSelect;

  const slots = useRef<{ tab: T; right: number }[]>([]);
  const startX = useRef<number | null>(null);
  const current = useRef<T | null>(null);
  const moved = useRef(false);
  const ghostUntil = useRef(0);

  useEffect(() => {
    const el = node;
    if (!el) return;

    /* Measured once per gesture rather than per move. The bar cannot reflow
       while a finger is on it, so re-reading the rects would be a layout every
       frame for an answer that never changes. Right edges are enough: the
       buttons tile the bar, so the first one the x falls short of is the one
       under the finger. */
    function measure() {
      slots.current = [...el!.querySelectorAll<HTMLElement>("[data-tab]")].map((b) => ({
        tab: b.dataset.tab as T,
        right: b.getBoundingClientRect().right,
      }));
    }

    /* Only x is consulted. A finger that wanders above the bar mid-slide is
       still sliding - the bar is 70px tall and the gesture would otherwise
       break on a sloppy arc - and there is nothing above it to hit by mistake,
       because the screens ignore touches that began down here. */
    function tabAt(x: number): T | null {
      const list = slots.current;
      if (list.length === 0) return null;
      for (const slot of list) if (x < slot.right) return slot.tab;
      return list[list.length - 1].tab; // past the last button, clamped to it
    }

    function onStart(e: TouchEvent) {
      moved.current = false;
      /* A ghost click always lands before the next touch starts, so anything
         still pending here is not one - and swallowing it would eat a real tap
         from someone who slid and then went straight for another tab. */
      ghostUntil.current = 0;
      // A second finger means a pinch or a stray palm, not a slide.
      if (e.touches.length !== 1) {
        startX.current = null;
        return;
      }
      measure();
      startX.current = e.touches[0].clientX;
      current.current = tabAt(startX.current);
    }

    function onMove(e: TouchEvent) {
      if (startX.current === null) return;

      const x = e.touches[0].clientX;

      if (!moved.current) {
        if (Math.abs(x - startX.current) < SLOP) return;
        moved.current = true;
        setSliding(true);
      }

      e.preventDefault(); // see the header - an unclaimed swipe closes the app

      const next = tabAt(x);
      if (next !== null && next !== current.current) {
        current.current = next;
        // No haptic here: onSelect is the app's own tab switch, which already
        // buzzes. Two buzzes on one crossing reads as a stutter.
        latest.current(next);
      }
    }

    function onEnd() {
      if (startX.current === null) return;
      startX.current = null;
      current.current = null;
      if (moved.current) ghostUntil.current = Date.now() + GHOST_MS;
      setSliding(false);
    }

    /* Capture, so it runs before the click reaches React's root listener and
       the button's own handler never sees it. */
    function onClick(e: MouseEvent) {
      if (Date.now() >= ghostUntil.current) return;
      ghostUntil.current = 0;
      e.preventDefault();
      e.stopPropagation();
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("click", onClick, true);

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("click", onClick, true);
    };
  }, [node]);

  return { ref: setNode, sliding };
}
