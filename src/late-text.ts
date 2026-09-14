/**
 * The re-entry point Vue does not provide.
 *
 * The package's flagship promise is that a host which mounts empty stays armed
 * and selects its text on the render that brings the text in — `<p
 * v-select-text>{{ fromApi }}</p>`. `edgeSpentMap` records "a selection landed"
 * rather than "enabled" specifically so the edge survives the empty mount.
 *
 * But the only thing that could ever re-run a cycle was the directive's
 * `updated` hook, and Vue runs that when the **owning component** re-renders —
 * never because the host's text changed. The two coincide exactly when the text
 * is interpolated in the same component, which is the shape every test and the
 * playground card happened to use. Put the text one layer down —
 * `<p v-select-text><Child/></p>`, a slot filled by a parent, a `v-html` written
 * by anything else — and the text arrives, `el.textContent` is correct, the edge
 * is still unspent, and **zero `select-text` events fire, ever**.
 *
 * So the decision "should I run a cycle now?" needs its own input. This module
 * is it: while a host is armed and has selected nothing, a `MutationObserver`
 * watches for text appearing under it and runs the cycle the render could not.
 *
 * **It disconnects the moment a selection lands**, and that is load-bearing, not
 * tidiness. A `MutationObserver` callback is a fresh task, so Vue's
 * recursive-update guard — which only sees synchronous re-entry — cannot see it,
 * exactly the way it could not see the promise-crossing clipboard loop in SEL-5.
 * An always-on observer plus a `select-text` handler that writes state into the
 * host would be that same unbounded loop with a different engine driving it.
 * Because the watch exists only *before* the first successful selection, and a
 * cycle that selects nothing dispatches nothing, there is no handler to feed it:
 * at most one cycle per external mutation, and at most one landing.
 *
 * What it deliberately does **not** cover: a host that has already selected once
 * and whose text later changes without its owner re-rendering. That is
 * `trigger: 'always'` territory, and arming an observer there is the loop above.
 * See README → *Text that arrives late*.
 */
import { selectAndReport } from './selection'
import { edgeSpentMap, lateTextMap } from './state'
import type { ResolvedBinding, SelectTextKind } from './types'

/**
 * `attributes` is deliberately absent from this list. `copy: true` writes
 * `data-select-text-copy` on the host, so observing attributes would feed the
 * copy state straight back into a new selection cycle — the mechanism that hung
 * the tab in `v-dropzone`.
 */
const WATCHING: MutationObserverInit = { childList: true, characterData: true, subtree: true }

/**
 * Only the two kinds whose text lives in the DOM. An `<input>` / `<textarea>`
 * carries its content in `value`, which mutates no node at all — a watch there
 * would never fire, and the `<textarea>`'s child text node is not its value.
 */
function watchable(kind: SelectTextKind): boolean {
  return kind === 'text' || kind === 'contenteditable'
}

/**
 * Bring the late-text watch in line with the current binding.
 *
 * @param armed  the host is enabled, its trigger is render-driven, and no
 *               selection has landed yet — i.e. `edgeSpentMap` is false.
 */
export function syncLateText(
  el: HTMLElement,
  kind: SelectTextKind,
  resolved: ResolvedBinding,
  armed: boolean,
): void {
  const wants =
    armed &&
    resolved.enabled &&
    resolved.trigger !== 'click' &&
    watchable(kind) &&
    typeof MutationObserver !== 'undefined'

  const existing = lateTextMap.get(el)
  if (!wants) {
    if (existing) {
      existing.observer.disconnect()
      lateTextMap.delete(el)
    }
    return
  }

  // Re-point the callback at the options of the render that installed it, the
  // same way `click-trigger.ts` re-binds its listener, but keep the observer
  // itself: disconnecting and re-observing on every unrelated re-render would
  // drop mutations queued in between.
  if (existing) {
    existing.resolved = resolved
    return
  }

  const observer = new MutationObserver(() => {
    const current = lateTextMap.get(el)
    if (!current) return
    // Never take a selection from someone who is typing. An editable host that
    // mounts empty is a text box being filled, and selecting the first
    // character the user types is the opposite of helpful.
    if (kind === 'contenteditable' && el.contains(document.activeElement)) return
    if (!selectAndReport(el, kind, current.resolved, 'render')) return
    // Landed out of band. Spend the edge — the next `updated` reads this, and
    // without it an unrelated re-render would select the same text again — then
    // stop watching, which is what keeps this from becoming a loop of its own.
    edgeSpentMap.set(el, true)
    removeLateText(el)
  })
  lateTextMap.set(el, { resolved, observer })
  observer.observe(el, WATCHING)
}

/** Teardown. */
export function removeLateText(el: HTMLElement): void {
  const watch = lateTextMap.get(el)
  if (!watch) return
  watch.observer.disconnect()
  lateTextMap.delete(el)
}
