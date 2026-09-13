/**
 * Element classification — which selection strategy an element gets, and the
 * two diagnostics for hosts that will not visibly select.
 *
 * The default answer is `'text'`: any ordinary element holds text, and
 * selecting that text is the reason this directive exists. Only elements that
 * cannot hold text at all fall through to `null`.
 */
import { notRenderedWarned, unselectableWarned, unsupportedWarned } from './state'
import type { SelectTextKind } from './types'

export type SelectableInput = HTMLInputElement | HTMLTextAreaElement

// Input types where setSelectionRange is meaningless or throws in real browsers.
// Selection only makes sense for textual inputs that show characters.
const NON_SELECTABLE_INPUT_TYPES = new Set<string>([
  'hidden',
  'file',
  'image',
  'submit',
  'reset',
  'button',
  'checkbox',
  'radio',
  'color',
  'range',
])

// Void and replaced elements: they render something, but never a text node a
// Range could wrap. `<select>` is here because its text lives in `<option>`s
// the user cannot select.
const NON_TEXT_TAGS = new Set<string>([
  'img',
  'br',
  'hr',
  'canvas',
  'video',
  'audio',
  'iframe',
  'embed',
  'object',
  'select',
  'progress',
  'meter',
  'svg',
])

function isContentEditable(el: HTMLElement): boolean {
  // `el.isContentEditable` walks the contenteditable inheritance chain in
  // real browsers. jsdom doesn't always implement the getter, so we walk
  // ancestors manually as a fallback.
  if (el.isContentEditable === true) return true
  let cur: HTMLElement | null = el
  while (cur) {
    const attr = cur.getAttribute('contenteditable')
    if (attr === '' || attr === 'true' || attr === 'plaintext-only') return true
    if (attr === 'false') return false
    cur = cur.parentElement
  }
  return false
}

export function getElementKind(el: HTMLElement): SelectTextKind | null {
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase()
    if (NON_SELECTABLE_INPUT_TYPES.has(type)) return null
    return 'input'
  }
  if (el instanceof HTMLTextAreaElement) return 'textarea'
  if (isContentEditable(el)) return 'contenteditable'
  if (NON_TEXT_TAGS.has(el.tagName.toLowerCase())) return null
  return 'text'
}

export function warnUnsupported(el: HTMLElement): void {
  if (unsupportedWarned.has(el)) return
  unsupportedWarned.add(el)
  let descriptor = el.tagName.toLowerCase()
  if (el instanceof HTMLInputElement && el.type) {
    descriptor += `[type="${el.type.toLowerCase()}"]`
  }
  console.warn(
    `[v-select-text] <${descriptor}> holds no selectable text. Use an <input>, a <textarea>, or any element with text content.`,
  )
}

/**
 * A programmatic Range over a `user-select: none` subtree is real but paints
 * nothing, which reads as "the directive did not fire". Say so once per
 * element — this is the single most common false bug report for static text.
 */
export function warnIfUnselectable(el: HTMLElement): void {
  if (unselectableWarned.has(el)) return
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return
  const style = window.getComputedStyle(el)
  const userSelect = style.userSelect || style.webkitUserSelect
  if (userSelect !== 'none') return
  unselectableWarned.add(el)
  console.warn(
    `[v-select-text] <${el.tagName.toLowerCase()}> resolves to \`user-select: none\`, so the selection is made but never painted. Remove that rule (or set \`user-select: text\`) to see it.`,
  )
}

/**
 * A host that renders nothing — `display: none` on itself, or anywhere up its
 * ancestor chain, which is what `v-show="false"` sets on a tab panel or a modal
 * that mounts hidden — still accepts a Range. The `select-text` event then
 * reports text that `getSelection().toString()` reads back as `''`, because
 * nothing was ever painted. That is the same class of defect as reporting a
 * selection on an empty host, so it gets the same treatment as
 * `user-select: none`: say so once, and let the selection stand so it is there
 * if the host is shown later.
 *
 * The chain has to be walked. `getComputedStyle(el).display` inside a hidden
 * subtree returns the element's own computed value (`'block'` for a `<p>`), not
 * the used one — the ancestor is where the `none` lives.
 */
export function warnIfNotRendered(el: HTMLElement): void {
  if (notRenderedWarned.has(el)) return
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return

  let hidden: HTMLElement | null = null
  for (let cur: HTMLElement | null = el; cur; cur = cur.parentElement) {
    if (window.getComputedStyle(cur).display === 'none') {
      hidden = cur
      break
    }
  }
  if (!hidden) return

  notRenderedWarned.add(el)
  const self = el.tagName.toLowerCase()
  const where =
    hidden === el
      ? 'is `display: none`'
      : `sits inside a \`display: none\` <${hidden.tagName.toLowerCase()}> (a \`v-show="false"\` ancestor, for instance)`
  console.warn(
    `[v-select-text] <${self}> ${where}, so it renders nothing and the selection cannot be painted. The event still reports the text it resolved.`,
  )
}
