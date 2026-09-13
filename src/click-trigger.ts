/**
 * `trigger: 'click'` — the one binding form driven by a DOM event rather than
 * by the reactive lifecycle. Owns attaching, replacing and removing that
 * listener; nothing else in the package touches `addEventListener`.
 *
 * It also owns the keyboard affordance that comes with it. The portfolio rule
 * (DESIGNS → DZ-1 / A11Y-1) is *a directive that makes an element clickable
 * must make it keyboard-operable, preferring a real focusable control over
 * injected ARIA*. `v-dropzone` complies natively because its host wraps a real
 * `<input type="file">`; a `<code>` token has no such control, so this is the
 * case that needs the `v-copy` treatment — injected `tabindex` + `role="button"`
 * + Enter/Space, only while `trigger: 'click'` is active, and only on hosts
 * that are not already interactive. Everything injected is removed again when
 * the trigger changes, when `enabled` turns false, or on unmount; an attribute
 * the author wrote is never touched.
 *
 * Listeners are **re-bound** on every sync, so the handler always closes over
 * the options of the render that installed it. The attributes are **not**:
 * they are diff-driven, because removing `tabindex` from a focused host blurs
 * it, and an unrelated re-render must not throw the user out of the control
 * they just tabbed to.
 */
import { selectAndReport } from './selection'
import { clickListenerMap, keyboardAffordanceMap } from './state'
import type { ResolvedBinding, SelectTextKind } from './types'

/**
 * Controls the browser already activates with Enter (and Space, for buttons),
 * turning the key into a real `click`. Adding our own handler there would fire
 * twice, and `role="button"` on an `<input>` or an `<a href>` would misdescribe
 * it to assistive tech.
 */
function isNativeInteractive(el: HTMLElement): boolean {
  const tag = el.tagName
  return (
    tag === 'BUTTON' ||
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (tag === 'A' && el.hasAttribute('href'))
  )
}

function detachListeners(el: HTMLElement): void {
  clickListenerMap.get(el)?.()
  clickListenerMap.delete(el)
}

function attachListeners(
  el: HTMLElement,
  kind: SelectTextKind,
  resolved: ResolvedBinding,
  withKeyboard: boolean,
): void {
  // `'request'`: a click or a key is one deliberate act, so the copy it asks
  // for is never suppressed as a repeat, however many times the same token is
  // clicked. See `copy.ts` → `isRenderRepeat`.
  const fire = () => {
    selectAndReport(el, kind, resolved, 'request')
  }
  el.addEventListener('click', fire)

  if (!withKeyboard) {
    clickListenerMap.set(el, () => el.removeEventListener('click', fire))
    return
  }

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return
    // Space would scroll the page, and both keys would otherwise activate
    // whatever the host sits inside.
    event.preventDefault()
    fire()
  }
  el.addEventListener('keydown', onKeydown)
  clickListenerMap.set(el, () => {
    el.removeEventListener('click', fire)
    el.removeEventListener('keydown', onKeydown)
  })
}

function addAffordance(el: HTMLElement): void {
  if (keyboardAffordanceMap.has(el)) return
  const injected = { tabindex: false, role: false }
  if (!el.hasAttribute('tabindex')) {
    el.setAttribute('tabindex', '0')
    injected.tabindex = true
  }
  if (!el.hasAttribute('role')) {
    el.setAttribute('role', 'button')
    injected.role = true
  }
  keyboardAffordanceMap.set(el, injected)
}

function removeAffordance(el: HTMLElement): void {
  const injected = keyboardAffordanceMap.get(el)
  if (!injected) return
  keyboardAffordanceMap.delete(el)
  if (injected.tabindex) el.removeAttribute('tabindex')
  if (injected.role) el.removeAttribute('role')
}

/**
 * Bring the element's click listener — and its keyboard affordance — in line
 * with the current binding. Called on every `mounted` / `updated`.
 */
export function syncClickTrigger(
  el: HTMLElement,
  kind: SelectTextKind,
  resolved: ResolvedBinding,
): void {
  const wants = resolved.trigger === 'click' && resolved.enabled
  const withKeyboard = wants && !isNativeInteractive(el)

  detachListeners(el)
  if (wants) attachListeners(el, kind, resolved, withKeyboard)

  if (withKeyboard) addAffordance(el)
  else removeAffordance(el)
}

export function removeClickTrigger(el: HTMLElement): void {
  detachListeners(el)
  removeAffordance(el)
}
