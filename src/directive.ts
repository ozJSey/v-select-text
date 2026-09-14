/**
 * The directive — lifecycle wiring only. Classifies the host, resolves the
 * binding, runs edge detection against the per-element previous value, and
 * delegates the actual selection to `selection.ts`.
 *
 * `updated` is Vue's answer to "my owner re-rendered", which is not the same
 * question as "did my text arrive". `late-text.ts` supplies the second one for
 * a host still waiting on its content; every hook here keeps that watch in step
 * with the binding.
 */
import type { ObjectDirective } from 'vue'
import { removeClickTrigger, syncClickTrigger } from './click-trigger'
import { abandonCopy, clearCopyState, warnCopyNeedsClick } from './copy'
import { getElementKind, warnUnsupported } from './element-kind'
import { removeLateText, syncLateText } from './late-text'
import { resolveBinding } from './resolve'
import { selectAndReport } from './selection'
import { edgeSpentMap } from './state'
import type { ResolvedBinding, SelectTextBinding } from './types'

/**
 * Keep the copy surface in step with the binding: warn once if `copy` is asking
 * for a clipboard write the trigger has no gesture for, and drop the state
 * attribute when `copy` is turned back off so nothing stale is left styling the
 * host.
 */
function syncCopy(el: HTMLElement, resolved: ResolvedBinding): void {
  if (!resolved.copy) {
    clearCopyState(el)
    return
  }
  // Only warn about a write that can actually be attempted. A host that mounts
  // `enabled: false` — playground card 15 does, and it is the ordinary "arm it
  // on a click" shape — is not asking for a clipboard write yet, and warning at
  // mount points at a problem the page does not have. The warning arrives on
  // the render that enables it, which is the one that needs the gesture. SEL-5.
  if (resolved.enabled && resolved.trigger !== 'click') warnCopyNeedsClick(el, resolved.trigger)
}

/**
 * `v-select-text` — selects the text of any element: an ordinary `<p>` or
 * `<code>` block via the Range API, an `<input>` / `<textarea>` via
 * `setSelectionRange`, a contenteditable host via either.
 *
 * Fires on a reactive `false → true` transition (the default), on every update
 * with `trigger: 'always'`, or on click and Enter/Space with
 * `trigger: 'click'`. A host that mounts with no text yet selects nothing,
 * dispatches nothing, leaves the document selection alone — and stays armed
 * until its text arrives, however it arrives.
 *
 * @example
 *   <p v-select-text="{ enabled: isQuoting, match: 'the important bit' }">…</p>
 *   <input v-select-text="isEditing" :value="text" />
 *   <code v-select-text="{ trigger: 'click', copy: true }">sk-live-…</code>
 *
 * @see SelectTextOptions for the full options bag.
 * @see useSelectText for the imperative form.
 */
export const vSelectText: ObjectDirective<HTMLElement, SelectTextBinding> = {
  mounted(el, binding) {
    const kind = getElementKind(el)
    if (!kind) {
      warnUnsupported(el)
      edgeSpentMap.set(el, false)
      return
    }

    const resolved = resolveBinding(binding.value)
    syncCopy(el, resolved)
    syncClickTrigger(el, kind, resolved)

    // A DOM trigger owns every fire; mounting is not a click.
    if (resolved.trigger === 'click') {
      edgeSpentMap.set(el, resolved.enabled)
      syncLateText(el, kind, resolved, false)
      return
    }

    // On mount, treat enabled:true as a false→true transition so the user sees
    // the selection. Mount enabled:false → the edge stays unspent, so a later
    // true update fires correctly.
    const cycle = resolved.enabled ? selectAndReport(el, kind, resolved, 'render') : null
    const spent = cycle !== null
    edgeSpentMap.set(el, spent)
    // Nothing landed, so the host is still waiting for its content — and its
    // owner re-rendering is not the same event as its text arriving.
    syncLateText(el, kind, resolved, !spent)
  },

  updated(el, binding) {
    const kind = getElementKind(el)
    if (!kind) {
      // A host can stop being selectable mid-life — `<input :type>` flipping to
      // `checkbox` is the ordinary case. Drop the listener with it, or every
      // later click fires an event claiming a selection that cannot happen.
      removeClickTrigger(el)
      removeLateText(el)
      warnUnsupported(el)
      return
    }

    const resolved = resolveBinding(binding.value)
    syncCopy(el, resolved)
    syncClickTrigger(el, kind, resolved)

    if (resolved.trigger === 'click') {
      edgeSpentMap.set(el, resolved.enabled)
      syncLateText(el, kind, resolved, false)
      return
    }

    // The edge is spent by a selection that *happened*, not by an enabled
    // render. `<p v-select-text>{{ fromApi }}</p>` mounts empty, selects
    // nothing, and must still fire when the text arrives. SEL-4.
    const spent = edgeSpentMap.get(el) ?? false
    const shouldFire = resolved.enabled && (resolved.trigger === 'always' || !spent)
    const cycle = shouldFire ? selectAndReport(el, kind, resolved, 'render') : null
    const nowSpent = resolved.enabled && (spent || cycle !== null)
    edgeSpentMap.set(el, nowSpent)
    syncLateText(el, kind, resolved, !nowSpent)
  },

  unmounted(el) {
    removeClickTrigger(el)
    removeLateText(el)
    abandonCopy(el)
    edgeSpentMap.delete(el)
  },
}

export default vSelectText
