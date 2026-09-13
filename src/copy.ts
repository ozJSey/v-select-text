/**
 * The clipboard write — **the only place in this package where one happens.**
 *
 * Two rules the split exists to protect:
 *
 * 1. **What is written is `detail.text`**, the same string the `select-text`
 *    event reports. Never `getSelection().toString()`: a `user-select: none`
 *    host stringifies to `''` and would wipe the clipboard on a selection the
 *    package considers successful; Chrome mirrors a focused field's own
 *    selection into the document selection while Firefox and Safari do not, so
 *    the input path would copy the right thing in one engine and nothing in
 *    two; and engines insert their own separators at block boundaries. Any of
 *    those would mean the package reports one string and the clipboard receives
 *    another.
 * 2. **The write is initiated in the same synchronous turn as the selection it
 *    copies**, and before `select-text` is dispatched. `writeText` needs
 *    transient user activation, and that activation is on a clock: about five
 *    seconds in Chrome (measured), UA-defined everywhere else. A write handed
 *    to a `setTimeout` often still lands; one handed to a consumer's
 *    `select-text` handler that awaits a round trip first does not. The only
 *    duration this package can rely on is *this turn*.
 *
 * Nothing here throws, and nothing here returns a rejected promise: on the
 * directive path nobody holds the promise, so a rejection would be
 * unhandled-rejection noise in every consumer's console. Failures are reported
 * on the `select-text-copy` event and in the returned detail instead.
 */
import { copyAbandoned, copySeqMap, copyTriggerWarned, lastCopyTextMap } from './state'
import type {
  SelectTextCopyDetail,
  SelectTextCopyReason,
  SelectTextEventDetail,
  SelectTextOrigin,
  SelectTextTrigger,
} from './types'

/** Reflects the copy attempt for CSS and for tests: `pending | copied | error`. */
export const COPY_STATE_ATTRIBUTE = 'data-select-text-copy'

/** Name of the CustomEvent every copy attempt reports through. */
export const COPY_EVENT = 'select-text-copy'

/** What the cycle asking for this write looked like. */
export interface CopyRequest {
  /** The trigger the binding resolved to. */
  trigger: SelectTextTrigger
  /** Whether a render or a deliberate act asked for the cycle. */
  origin: SelectTextOrigin
}

/**
 * Write the state attribute, but only when it actually changes.
 *
 * `setAttribute` queues a MutationRecord even for an identical value, so a
 * consumer with a `MutationObserver` on the host gets a callback per attempt —
 * and a callback that writes state is the same promise-crossing cycle as the
 * one below, with a different engine driving it. That is the exact mechanism
 * that hung the tab in `v-dropzone`. The measured cost of not guarding it here
 * was two mutation records per attempt, ~17,000 a second.
 */
function setCopyState(el: HTMLElement, value: 'pending' | 'copied' | 'error'): void {
  if (el.getAttribute(COPY_STATE_ATTRIBUTE) === value) return
  el.setAttribute(COPY_STATE_ATTRIBUTE, value)
}

/**
 * Is this a write nobody asked for, offering text this host already offered?
 *
 * `trigger: 'always'` fires on every render, and a `select-text-copy` handler
 * that writes state renders again — the README's own example is `toast(…)`.
 * The write settles in a **promise**, and Vue's recursive-update guard only
 * sees synchronous re-entry, so it never fires: measured at ~8,600 real
 * clipboard writes per second, indefinitely, on a page that still looked
 * responsive. SEL-5.
 *
 * The check is deliberately narrow, because *the same text again* is a
 * perfectly good request everywhere else:
 *
 * - `origin: 'request'` — a click, an Enter/Space press, or a
 *   `useSelectText().copy()` call — is one act per attempt and is never
 *   suppressed. The user may have copied something else in between; taking
 *   their own clipboard away from them would be a worse bug than the loop.
 * - `trigger: 'edge'` needs an explicit `false → true` re-arm, which is equally
 *   an act. Playground card 15 presses it repeatedly against one unchanged
 *   token and has to copy every time.
 *
 * What is left is exactly the render-driven repeat, where the guard is not a
 * limitation but the semantics: `'always'` exists so the selection follows text
 * that *moves*, so the copy should follow the text too — not the render.
 *
 * Keyed on the last **attempt** rather than the last success, because a refusal
 * re-renders just as well: `toast('could not copy')` is a state write too.
 */
function isRenderRepeat(el: HTMLElement, text: string, request: CopyRequest): boolean {
  return (
    request.origin === 'render' &&
    request.trigger === 'always' &&
    lastCopyTextMap.get(el) === text
  )
}

function dispatchCopyEvent(el: HTMLElement, detail: SelectTextCopyDetail): void {
  try {
    el.dispatchEvent(
      new CustomEvent<SelectTextCopyDetail>(COPY_EVENT, {
        detail,
        bubbles: true,
        cancelable: false,
      }),
    )
  } catch {
    // Same guard as `select-text`: some non-DOM hosts throw on CustomEvent.
  }
}

/**
 * Report one attempt. The sequence check is what keeps a slow first write from
 * overwriting the state a later one already settled — the event still fires,
 * because a swallowed failure is worse than a stale attribute.
 */
function settle(el: HTMLElement, seq: number, detail: SelectTextCopyDetail): SelectTextCopyDetail {
  if (copyAbandoned.has(el)) return detail
  if (copySeqMap.get(el) === seq) {
    setCopyState(el, detail.ok ? 'copied' : 'error')
  }
  dispatchCopyEvent(el, detail)
  return detail
}

/** A refusal decided before any write. Deferred so `select-text` still goes first. */
function refuse(
  el: HTMLElement,
  seq: number,
  selection: SelectTextEventDetail,
  reason: SelectTextCopyReason,
): Promise<SelectTextCopyDetail> {
  return Promise.resolve().then(() =>
    settle(el, seq, { ok: false, text: selection.text, reason, selection }),
  )
}

/**
 * Copy `selection.text`. Call this **synchronously** from the same turn as the
 * selection, before the `select-text` event is dispatched.
 *
 * Returns the attempt's detail; it never rejects. Returns `null` — no write, no
 * event, no attribute — when the attempt is a render-driven repeat of the text
 * this host last offered; see {@link isRenderRepeat}.
 */
export function startCopy(
  el: HTMLElement,
  selection: SelectTextEventDetail,
  request: CopyRequest,
): Promise<SelectTextCopyDetail> | null {
  // Before the sequence bump and before the attribute: a suppressed attempt
  // must leave no trace at all, or the state write it avoids comes back as an
  // attribute mutation.
  if (isRenderRepeat(el, selection.text, request)) return null
  lastCopyTextMap.set(el, selection.text)

  const seq = (copySeqMap.get(el) ?? 0) + 1
  copySeqMap.set(el, seq)
  copyAbandoned.delete(el)
  setCopyState(el, 'pending')

  // An empty string is never written — clearing a clipboard is not something a
  // selection directive should ever be able to do by accident.
  if (selection.text === '') return refuse(el, seq, selection, 'empty')

  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (typeof clipboard?.writeText !== 'function') {
    return refuse(el, seq, selection, 'no-clipboard')
  }

  // Read activation synchronously, immediately before the write, and use it
  // ONLY to explain a refusal afterwards. It must not gate the attempt:
  // pre-blocking would make the package less capable than Chrome permits, and
  // Safari does not expose the API at all.
  const active = typeof navigator === 'undefined' ? undefined : navigator.userActivation?.isActive

  return clipboard.writeText(selection.text).then(
    () => settle(el, seq, { ok: true, text: selection.text, selection }),
    (error: unknown) =>
      settle(el, seq, {
        ok: false,
        text: selection.text,
        reason: active === false ? 'no-user-activation' : 'denied',
        error,
        selection,
      }),
  )
}

/**
 * Drop the state attribute — `copy` turned off, or the host is going away.
 *
 * Forgets the last attempted text with it: turning `copy` off and on again is a
 * deliberate act, and the next write should happen even if the text has not
 * moved. (`removeAttribute` on an absent attribute queues no MutationRecord, so
 * this needs no guard of its own.)
 */
export function clearCopyState(el: HTMLElement): void {
  el.removeAttribute(COPY_STATE_ATTRIBUTE)
  lastCopyTextMap.delete(el)
}

/** Teardown: an in-flight write still lands, but this host reports nothing. */
export function abandonCopy(el: HTMLElement): void {
  copyAbandoned.add(el)
  clearCopyState(el)
}

/**
 * `copy` on a non-click trigger is the "the directive appears not to have
 * fired" failure mode, same shape as the `user-select: none` diagnostic: the
 * selection is made, the write is attempted, and two of three engines refuse it
 * silently because there was no gesture. Say so once per element, and name the
 * fix.
 */
export function warnCopyNeedsClick(el: HTMLElement, trigger: SelectTextTrigger): void {
  if (copyTriggerWarned.has(el)) return
  copyTriggerWarned.add(el)
  console.warn(
    `[v-select-text] \`copy: true\` with \`trigger: '${trigger}'\` has no user gesture to write under. ` +
      `Chrome refuses that as well as Firefox and Safari — the page has to still hold a transient ` +
      `activation (about five seconds after a real gesture in Chrome). ` +
      `Use \`trigger: 'click'\`, or call \`copy()\` from \`useSelectText\` inside your own click handler. ` +
      `The attempt is still made — listen for \`select-text-copy\` to see what happened.` +
      (trigger === 'always'
        ? ` Under \`trigger: 'always'\` the write also happens at most once per distinct text: ` +
          `a re-render alone does not re-copy, or a \`select-text-copy\` handler that writes state ` +
          `would loop forever.`
        : ''),
  )
}
