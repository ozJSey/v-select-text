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
 */
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

function walkRendered(el: Element, preserve: boolean, walk: Walk): void {
  for (const child of el.childNodes) {
    if (child.nodeType === 3 /* Node.TEXT_NODE */) {
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
      walk.pendingEdge = true
      continue
    }

    const style = window.getComputedStyle(childEl)
    if (style.display === 'none') continue

    const block = !isInlineBox(style.display)
    if (block) walk.pendingEdge = true
    walkRendered(childEl, PRESERVING_WHITE_SPACE.has(style.whiteSpace), walk)
    if (block) walk.pendingEdge = true
  }
}

/**
 * Build the flat text of `el` plus its per-character anchors.
 *
 * `'collapse'` reproduces what the browser paints: subtrees that render no
 * text are skipped, each element's own `white-space` decides whether its runs
 * fold, block edges and `<br>`s count as one space, and leading/trailing runs
 * disappear. `'preserve'` is the escape hatch — raw `textContent`, verbatim,
 * so an index into the string `el.textContent` hands you is the index the
 * directive uses.
 */
export function buildTextMap(el: HTMLElement, whitespace: SelectTextWhitespace): TextMap {
  const walk: Walk = {
    chars: [],
    anchors: [],
    pending: null,
    pendingEdge: false,
    last: { node: el, offset: 0 },
  }

  if (whitespace === 'preserve') {
    const treeWalker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null)
    let node = treeWalker.nextNode() as Text | null
    while (node) {
      for (let i = 0; i < node.data.length; i++) emit(walk, node.data[i], node, i)
      node = treeWalker.nextNode() as Text | null
    }
  } else {
    walkRendered(el, PRESERVING_WHITE_SPACE.has(window.getComputedStyle(el).whiteSpace), walk)
  }

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
