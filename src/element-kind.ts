/**
 * Element classification — which selection strategy an element gets, and the
 * diagnostics for a host that will not visibly select or a binding that cannot
 * be read.
 *
 * The default answer is `'text'`: any ordinary element holds text, and
 * selecting that text is the reason this directive exists. Only elements that
 * cannot hold text at all fall through to `null`.
 */
import { styleOf } from './computed-style'
import {
  noRangeWarned,
  notRenderedChecked,
  unreadableWarned,
  unselectableChecked,
  unsupportedWarned,
} from './state'
import type { SelectTextKind, SelectTextUnreadable } from './types'

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
  // Tag before contenteditable: `contenteditable` is inherited, so an <img>
  // inside an editable region reports `isContentEditable === true` and would
  // otherwise be classified `'contenteditable'` and sent down the Range path,
  // where it holds no text node to anchor on. The four-kind classification is
  // only exhaustive if "can this element hold text at all" is asked first.
  if (NON_TEXT_TAGS.has(el.tagName.toLowerCase())) return null
  if (isContentEditable(el)) return 'contenteditable'
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
  if (unselectableChecked.has(el)) return
  // Memoized on the CHECK, not on the finding. Adding the element only when a
  // rule was found made the *normal* host — the overwhelming majority — re-walk
  // and re-resolve styles on every selection cycle forever, in the shipped
  // bundle, to produce a warning that was never going to be printed. The
  // contract was already once per element; now the work is too.
  unselectableChecked.add(el)
  if (styleOf(el).userSelect !== 'none') return
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
  if (notRenderedChecked.has(el)) return
  // Same memoize-the-check rule as above, and it matters more here: this walks
  // the whole ancestor chain resolving styles, so a host ten levels deep cost
  // twelve style resolutions per selection cycle to decide, every time, that
  // there was nothing to say.
  notRenderedChecked.add(el)

  let hidden: HTMLElement | null = null
  let rule = ''
  for (let cur: HTMLElement | null = el; cur; cur = cur.parentElement) {
    const style = styleOf(cur)
    // `visibility: hidden` paints nothing either, and unlike `display: none` it
    // still reserves the box — so the host looks present in devtools while the
    // selection over it is invisible. A descendant can set `visibility: visible`
    // and come back, but `el` itself cannot un-hide itself, so for the host the
    // nearest hidden ancestor is the answer for both properties.
    if (style.display === 'none') rule = 'display: none'
    else if (style.visibility === 'hidden') rule = 'visibility: hidden'
    else continue
    hidden = cur
    break
  }
  if (!hidden) return

  const self = el.tagName.toLowerCase()
  const where =
    hidden === el
      ? `is \`${rule}\``
      : `sits inside a \`${rule}\` <${hidden.tagName.toLowerCase()}> (a \`v-show="false"\` ancestor, for instance)`
  console.warn(
    `[v-select-text] <${self}> ${where}, so it renders nothing and the selection cannot be painted. The event still reports the text it resolved.`,
  )
}

/**
 * The binding supplied an option this code cannot act on. Nothing is selected.
 *
 * This is the fifth diagnostic and the one that replaces a crash: `match` used
 * to reach `match.flags.replace(...)` on whatever it was handed and throw a
 * `TypeError` out of `mounted` — or out of a raw click listener, where there is
 * no Vue error boundary at all. `start` / `end` were quieter and worse: an
 * unreadable offset fell through to "no range given", which means *select the
 * whole host*, and with `copy: true` means put the whole host on the clipboard.
 */
export function warnUnreadableOption(el: HTMLElement, option: SelectTextUnreadable): void {
  if (option === null || unreadableWarned.has(el)) return
  unreadableWarned.add(el)
  const advice =
    option === 'match'
      ? 'Pass a string or a RegExp — a number or a bigint is read as its string form, and `null` means "the needle has not arrived yet".'
      : 'Pass a number, or leave it off. `NaN` (from `Number(\'\')`) and `null` (from a `ref<number | null>`) are not offsets, and guessing at one would widen the selection rather than narrow it.'
  console.warn(
    `[v-select-text] <${el.tagName.toLowerCase()}> was given a \`${option}\` this directive cannot read, so nothing is selected. ${advice}`,
  )
}

/**
 * `setSelectionRange` threw for a *ranged* request. Real behaviour on
 * `type="number"` and `type="email"`: the engine refuses to place a partial
 * selection in a field whose value it does not treat as plain text.
 *
 * The old fallback selected the whole value instead, which is a different
 * request and a bigger one. Nothing is selected now, so this warning is the
 * only signal the consumer gets — never remove it without replacing it.
 */
export function warnNoRangeSupport(el: HTMLElement): void {
  if (noRangeWarned.has(el)) return
  noRangeWarned.add(el)
  const type = el instanceof HTMLInputElement ? el.type.toLowerCase() : el.tagName.toLowerCase()
  console.warn(
    `[v-select-text] <input type="${type}"> refuses \`setSelectionRange\`, so a \`start\`/\`end\`/\`match\` ` +
      `range cannot be placed in it and nothing was selected. Selecting the whole value instead ` +
      `would answer a different request — and with \`copy: true\` would put the whole value on the ` +
      `clipboard. Use \`type="text"\` with your own validation, or drop the range to select it all.`,
  )
}
