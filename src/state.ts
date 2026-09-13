/**
 * Per-element state. Every WeakMap/WeakSet the package keeps lives here, so
 * "what do we remember about an element" has exactly one answer. WeakMap so
 * GC'd elements don't leak.
 */

/**
 * Whether the `'edge'` trigger has been spent for this element — `enabled` is
 * currently true **and** a selection actually landed.
 *
 * It is deliberately not "the previous `enabled` value": an enabled render that
 * selected nothing (an empty host still waiting on `{{ fromApi }}`, a `match`
 * that has not arrived yet) leaves the edge unspent, so the selection happens
 * when the content does. SEL-4.
 */
export const edgeSpentMap = new WeakMap<HTMLElement, boolean>()

/**
 * Teardown for the listeners `trigger: 'click'` installed on an element — the
 * click handler, and the keydown handler when the host also got the keyboard
 * affordance. Re-bound on every sync so the handler closes over the current
 * options.
 */
export const clickListenerMap = new WeakMap<HTMLElement, () => void>()

/**
 * Which of `tabindex` / `role` the directive itself injected on a
 * `trigger: 'click'` host, so teardown removes exactly those and leaves the
 * author's own attributes alone.
 *
 * Kept separate from `clickListenerMap` on purpose: listeners are torn down and
 * re-bound on every render, and doing that to `tabindex` would blur a host the
 * user had just tabbed to.
 */
export const keyboardAffordanceMap = new WeakMap<
  HTMLElement,
  { tabindex: boolean; role: boolean }
>()

/** Elements already warned about `user-select: none` — warn once, not per fire. */
export const unselectableWarned = new WeakSet<HTMLElement>()

/** Elements already warned about rendering nothing (`display: none`, hidden ancestor). */
export const notRenderedWarned = new WeakSet<HTMLElement>()

/**
 * Elements already warned about holding no selectable text. `updated` runs on
 * every re-render, so without this a single `<img v-select-text>` prints one
 * warning per render.
 */
export const unsupportedWarned = new WeakSet<HTMLElement>()

/**
 * Monotonic copy-attempt counter per element. The last attempt owns
 * `data-select-text-copy`; an earlier one that settles late still reports on
 * `select-text-copy` — nothing is swallowed — but does not take the attribute
 * back.
 */
export const copySeqMap = new WeakMap<HTMLElement, number>()

/**
 * Elements whose directive has been torn down. A clipboard write already in
 * flight still lands (it is the browser's now), but an unmounted host
 * dispatches nothing and gets no attribute.
 */
export const copyAbandoned = new WeakSet<HTMLElement>()

/** Elements already warned that `copy` wants `trigger: 'click'` — warn once. */
export const copyTriggerWarned = new WeakSet<HTMLElement>()

/**
 * The text of this element's last copy **attempt**, successful or not.
 *
 * `trigger: 'always'` fires on every render, so without this a
 * `select-text-copy` handler that writes state is a cycle that never
 * terminates — the write settles in a promise, so Vue's recursive-update guard
 * never sees it. Cleared when `copy` is turned off and on teardown, so
 * re-arming the option re-arms the write. SEL-5, and see `copy.ts`.
 */
export const lastCopyTextMap = new WeakMap<HTMLElement, string>()
