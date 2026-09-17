/**
 * Flat text over a DOM subtree — the bridge between "character 7" and the
 * `(textNode, offset)` pair a `Range` actually wants.
 *
 * This is the module that makes ordinary elements work. `textContent` is not
 * what the user sees: it includes the contents of `<script>` and `<style>`,
 * the text of a `v-show="false"` subtree, no gap at all between two `<li>`s,
 * and every space of the source formatting. Walking the subtree once and
 * recording where every *rendered* character came from lets `start` / `end` /
 * `match` be expressed against the visible text while the Range still lands on
 * real nodes.
 *
 * **One walk, two whitespace modes.** `'collapse'` and `'preserve'` differ only
 * in how whitespace is counted and whether block edges insert a separator; they
 * do *not* differ in what is visible. Both skip `<script>` / `<style>` /
 * `<template>`, both skip a `display: none` subtree, and both skip the text of a
 * `visibility: hidden` element. `'preserve'` used to be a bare `TreeWalker` over
 * every text node, which meant a hidden fragment inside a `<code>` block — the
 * documented use for `'preserve'` — was searchable by `match`, selectable by
 * offset, and copyable to the clipboard, with no diagnostic. The invariant the
 * README states ("a match can never reach into text the user cannot see") is now
 * a property of the walk rather than of one of its two modes.
 */
import { styleOf } from './computed-style'
import type { SelectTextWhitespace } from './types'

/** Where a character in {@link TextMap.text} lives in the DOM. */
export interface TextAnchor {
  node: Node
  offset: number
}

export interface TextMap {
  /** The flat text, resolved per the requested mode. */
  text: string
  /**
   * Anchor for each index in `text`, plus one final entry for `text.length`
   * (the position just past the last character). Length is `text.length + 1`.
   */
  anchors: TextAnchor[]
}

// The whitespace the CSS "collapse" step folds. U+00A0 is deliberately absent:
// a non-breaking space is a rendered character, not collapsible whitespace.
const COLLAPSIBLE = /[\t\n\f\r ]/

// Elements whose text nodes are never painted. `<textarea>` and `<select>`
// hold their text in the DOM but render it through their own widget, so a
// Range over it selects nothing a user can see.
const NON_RENDERED_TAGS = new Set<string>([
  'script',
  'style',
  'noscript',
  'template',
  'textarea',
  'select',
  'option',
  'optgroup',
  'head',
  'title',
  'iframe',
  'object',
  'canvas',
  'audio',
  'video',
])

// `white-space` values that keep every space and newline as written.
const PRESERVING_WHITE_SPACE = new Set<string>(['pre', 'pre-wrap', 'break-spaces'])

/**
 * jsdom (and any engine that reports only what a stylesheet declared) leaves
 * `display` empty for an element that never had the property set. `inline` is
 * the initial value, so empty means inline — anything else that is not an
 * inline box opens and closes a line, which reads as a gap.
 */
function isInlineBox(display: string): boolean {
  return display === '' || display === 'contents' || display.startsWith('inline')
}

interface Walk {
  chars: string[]
  anchors: TextAnchor[]
  /** Anchor for a pending separator, when a source character supplied one. */
  pending: TextAnchor | null
  /** A separator with no source character — a block edge or a `<br>`. */
  pendingEdge: boolean
  last: TextAnchor
  /**
   * `whitespace: 'preserve'`. Every character is emitted as written and no
   * synthetic separator is ever inserted, so an index into the map is an index
   * into the visible text exactly as the DOM holds it.
   */
  verbatim: boolean
}

function emit(walk: Walk, char: string, node: Node, offset: number): void {
  // A separator only renders between two visible characters, never before the
  // first one — which is also how a leading whitespace run disappears.
  if (walk.chars.length > 0 && (walk.pending || walk.pendingEdge)) {
    walk.chars.push(' ')
    walk.anchors.push(walk.pending ?? { node, offset })
  }
  walk.pending = null
  walk.pendingEdge = false
  walk.chars.push(char)
  walk.anchors.push({ node, offset })
  walk.last = { node, offset: offset + 1 }
}

/**
 * @param preserve  this element's own `white-space` keeps its runs as written.
 *                  Always true in verbatim mode.
 * @param painted   whether text nodes at this level are painted. False under a
 *                  `visibility: hidden` element — the text exists, occupies
 *                  space, and shows nothing.
 */
function walkRendered(el: Element, preserve: boolean, walk: Walk, painted: boolean): void {
  for (const child of el.childNodes) {
    if (child.nodeType === 3 /* Node.TEXT_NODE */) {
      if (!painted) continue
      const data = (child as Text).data
      for (let i = 0; i < data.length; i++) {
        if (!preserve && COLLAPSIBLE.test(data[i])) {
          walk.pending ??= { node: child, offset: i }
          continue
        }
        emit(walk, data[i], child, i)
      }
      continue
    }
    if (child.nodeType !== 1 /* Node.ELEMENT_NODE */) continue

    const childEl = child as Element
    const tag = childEl.tagName.toLowerCase()
    if (NON_RENDERED_TAGS.has(tag)) continue
    if (tag === 'br') {
      if (!walk.verbatim && painted) walk.pendingEdge = true
      continue
    }

    const style = styleOf(childEl)
    if (style.display === 'none') continue

    // `visibility` is inherited, but a descendant is free to set it back to
    // `visible` and be painted again — so a hidden element loses its own text
    // while the walk keeps descending into its children.
    //
    // The computed value already carries the inheritance, so it is read fresh
    // per element rather than ANDed with the parent's. ANDing made `hidden`
    // sticky: `<span hidden><em visible>SEEN</em></span>tail` painted "SEEN" on
    // screen while the map held only "tail", so every offset after it was short
    // by four and `{ start: 0 }` copied text that did not match the highlight.
    // `''` is `computed-style.ts` reporting that the engine would not answer;
    // the inherited state is the only thing left to go on.
    const childPainted = style.visibility === '' ? painted : style.visibility !== 'hidden'

    const block = !walk.verbatim && !isInlineBox(style.display)
    if (block) walk.pendingEdge = true
    walkRendered(
      childEl,
      walk.verbatim || PRESERVING_WHITE_SPACE.has(style.whiteSpace),
      walk,
      childPainted,
    )
    if (block) walk.pendingEdge = true
  }
}

/**
 * Build the flat text of `el` plus its per-character anchors.
 *
 * `'collapse'` reproduces what the browser paints: each element's own
 * `white-space` decides whether its runs fold, block edges and `<br>`s count as
 * one space, and leading/trailing runs disappear. `'preserve'` keeps every
 * character as written and inserts no separators, so an index into the text of
 * a `white-space: pre` host is the index the directive uses.
 *
 * Both modes skip the same things: non-rendered tags, `display: none`
 * subtrees, and the text of a `visibility: hidden` element.
 *
 * The **host's own** visibility is deliberately not consulted. Pointing the
 * directive at a hidden element is a request about that element, and it gets a
 * diagnostic (`warnIfNotRendered`) rather than silence — the same treatment
 * `display: none` on the host has always had. It is only *incidental* content
 * inside the host that is excluded from the text.
 */
export function buildTextMap(el: HTMLElement, whitespace: SelectTextWhitespace): TextMap {
  const verbatim = whitespace === 'preserve'
  const walk: Walk = {
    chars: [],
    anchors: [],
    pending: null,
    pendingEdge: false,
    last: { node: el, offset: 0 },
    verbatim,
  }

  walkRendered(el, verbatim || PRESERVING_WHITE_SPACE.has(styleOf(el).whiteSpace), walk, true)

  // A trailing separator renders as nothing, so `last` is already the right end.
  walk.anchors.push(walk.last)
  return { text: walk.chars.join(''), anchors: walk.anchors }
}

/**
 * Anchor for a flat index. Indices are produced by the map itself and clamped
 * by the caller, so this only guards the empty-subtree case.
 */
export function anchorAt(map: TextMap, index: number): TextAnchor {
  return map.anchors[index] ?? map.anchors[map.anchors.length - 1]
}
