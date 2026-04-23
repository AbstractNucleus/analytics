import { readable, type Readable } from 'svelte/store';

// Number-readout tween. Spec calls for ~400ms spring-flavoured ease on every
// big digit that changes, so this is the primitive every panel's readout uses.
//
// Implementation notes:
// - We hand back a Svelte `readable` store: panels subscribe and template
//   bindings rerender without any extra glue.
// - Scheduling uses `setTimeout(..., 16)` rather than `requestAnimationFrame`.
//   Fake timers in jsdom+vitest intercept setTimeout deterministically, so
//   tests can advance wall time without races. 16ms is close enough to one
//   animation frame at 60fps; visually indistinguishable from rAF for a 400ms
//   tween.
// - "Spring" here is an ease-out cubic that lands exactly on `to` at t=1. A
//   real spring would overshoot; the spec explicitly says "no bounces", so a
//   monotonic ease-out is the right shape.

const FRAME_MS = 16;

export type Easing = (t: number) => number;

/** Ease-out cubic. Fast start, gentle landing. Monotonic on [0,1]. */
export const spring: Easing = (t) => {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
};

/**
 * Animate a number from `from` to `to` over `duration` ms.
 *
 * Returns a Svelte readable store that emits the current value each frame.
 * The store starts at `from`, is guaranteed to end exactly at `to`, and
 * never reverses direction (given a monotonic easing such as the default).
 */
export function tweenNumber(
  from: number,
  to: number,
  duration: number = 400,
  easing: Easing = spring
): Readable<number> {
  return readable<number>(from, (set) => {
    if (from === to || duration <= 0) {
      set(to);
      return () => {};
    }

    const delta = to - from;
    let startedAt: number | null = null;
    let handle: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (startedAt === null) startedAt = Date.now();
      const elapsed = Date.now() - startedAt;
      if (elapsed >= duration) {
        set(to);
        handle = null;
        return;
      }
      const t = elapsed / duration;
      set(from + delta * easing(t));
      handle = setTimeout(tick, FRAME_MS);
    };

    // First sample on the next frame, not synchronously: subscribers see
    // the `from` value first, then get progress updates.
    handle = setTimeout(tick, FRAME_MS);

    return () => {
      if (handle !== null) clearTimeout(handle);
    };
  });
}
