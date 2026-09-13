/**
 * Selection primitives — the two strategies (`setSelectionRange` for inputs
 * and textareas, the Range API for every other element) plus the `select-text`
 * CustomEvent they both report through.
 *
 * This is the only file where a selection actually happens.
 */
import { startCopy } from './copy'
import { warnIfNotRendered, warnIfUnselectable, type SelectableInput } from './element-kind'
import { findRange } from './find-range'
import { anchorAt, buildTextMap } from './text-map'
import type {
  ResolvedBinding,
  SelectTextCopyDetail,
  SelectTextEventDetail,
  SelectTextKind,
  SelectTextOrigin,
} from './types'

function dispatchSelectTextEvent(el: HTMLElement, detail: SelectTextEventDetail): void {
  try {
    el.dispatchEvent(
      new CustomEvent<SelectTextEventDetail>('select-text', {
        detail,
        bubbles: true,
        cancelable: false,
      }),
    )
  } catch {
    // Some old jsdom versions / non-DOM hosts throw on CustomEvent — swallow.
  }
}

function selectInputOrTextarea(
  el: SelectableInput,
  kind: 'input' | 'textarea',
  resolved: ResolvedBinding,
): SelectTextEventDetail | null {
  const value = el.value
  const requested = findRange(value, resolved)
  if (requested.mode === 'none') return null

  const selectAll = (): SelectTextEventDetail | null => {
    // An empty field has nothing to select. `el.select()` would still focus it
    // and the cycle would report `text: ''` — a selection that does not exist.
    if (value.length === 0) return null
    try {
      el.select()
      // `HTMLInputElement.select()` takes no direction, so reporting the
      // requested one would be a lie — it always anchors forward.
      return { start: 0, end: value.length, text: value, direction: 'forward', kind }
    } catch {
      return null
    }
  }

  if (requested.mode === 'all') return selectAll()

  const { start, end } = requested
  // A collapsed request is a caret, not a selection: leave the field's own
  // selection where the user left it. SEL-4.
  if (start === end) return null
  try {
    el.setSelectionRange(start, end, resolved.direction)
    return { start, end, text: value.slice(start, end), direction: resolved.direction, kind }
  } catch {
    // `type="number"` / `type="email"` reject setSelectionRange in real
    // browsers. Selecting everything beats selecting nothing.
    return selectAll()
  }
}

/**
 * Put `range` on the document selection. `direction: 'backward'` anchors the
 * caret at the start instead of the end, so Shift+Arrow extends the other way
 * — the Range-path equivalent of `setSelectionRange`'s third argument.
 */
function applyRange(range: Range, direction: ResolvedBinding['direction']): boolean {
  const sel = window.getSelection()
  if (!sel) return false
  try {
    sel.removeAllRanges()
    if (direction === 'backward') {
      try {
        sel.setBaseAndExtent(
          range.endContainer,
          range.endOffset,
          range.startContainer,
          range.startOffset,
        )
        return sel.rangeCount > 0
      } catch {
        // Older engines expose no setBaseAndExtent — a forward selection is
        // still the right selection, just anchored at the other end.
      }
    }
    sel.addRange(range)
    // `addRange` aborts silently when the range's root is not the document —
    // a host detached behind Vue's back, for instance. Without this the
    // directive would report a selection that never happened.
    return sel.rangeCount > 0
  } catch {
    return false
  }
}

function selectTextHost(
  el: HTMLElement,
  kind: 'contenteditable' | 'text',
  resolved: ResolvedBinding,
): SelectTextEventDetail | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  // A host Vue has already detached cannot hold a selection: `addRange` aborts
  // on it silently. Bail before `applyRange` so the attempt cannot take the
  // user's existing selection down with it. SEL-4.
  if (!el.isConnected) return null

  const map = buildTextMap(el, resolved.whitespace)
  const requested = findRange(map.text, resolved)
  if (requested.mode === 'none') return null

  // Every path goes through the map, including "select everything". The
  // alternative — `selectNodeContents` for the whole-host case — reported raw
  // `textContent` while an explicit `{ start: 0 }` asking for the identical
  // selection reported the resolved view: two payloads for one intent.
  const start = requested.mode === 'all' ? 0 : requested.start
  const end = requested.mode === 'all' ? map.text.length : requested.end

  let range: Range
  try {
    range = document.createRange()
    const from = anchorAt(map, start)
    const to = anchorAt(map, end)
    range.setStart(from.node, from.offset)
    range.setEnd(to.node, to.offset)
  } catch {
    return null
  }

  // A collapsed Range selects nothing. That covers three cases that used to
  // report a selection nobody could see: a host whose text has not arrived yet
  // (`mode: 'all'` over an empty map), an explicitly collapsed `{ start: n,
  // end: n }`, and a range that covers only a synthetic separator — the space
  // the map inserts between two `<li>`s exists in the text, but not in the DOM,
  // so both anchors land on the same point. Checked *before* `applyRange`,
  // because the fix is not only "fire nothing": `removeAllRanges` would already
  // have wiped whatever the user had selected. SEL-4.
  if (range.collapsed) return null

  // Both diagnostics describe a selection that will not be *painted*, so they
  // belong after the decision to make one. Warning earlier meant an empty host
  // inside a `v-show="false"` panel printed "the event still reports the text
  // it resolved" — about an event that never fired. SEL-4.
  if (kind === 'text') warnIfUnselectable(el)
  warnIfNotRendered(el)

  if (!applyRange(range, resolved.direction)) return null
  return {
    start,
    end,
    text: map.text.slice(start, end),
    direction: resolved.direction,
    kind,
  }
}

/**
 * Run a selection cycle for the given element. Returns the detail of the
 * fired selection (for the CustomEvent) or `null` if no selection occurred.
 */
function performSelection(
  el: HTMLElement,
  kind: SelectTextKind,
  resolved: ResolvedBinding,
): SelectTextEventDetail | null {
  if (kind === 'contenteditable' || kind === 'text') {
    return selectTextHost(el, kind, resolved)
  }
  return selectInputOrTextarea(el as SelectableInput, kind, resolved)
}

/** What one selection cycle produced. */
export interface SelectTextCycle {
  detail: SelectTextEventDetail
  /**
   * The clipboard write this cycle started, when `copy` asked for one. Already
   * in flight by the time the caller sees it — `copy.ts` requires that.
   *
   * `null` when `copy` was off, and also when `copy.ts` suppressed the attempt
   * as a render-driven repeat of the text this host last offered (SEL-5).
   */
  copying: Promise<SelectTextCopyDetail> | null
}

/**
 * Select, then tell the world. The one entry point every caller (directive,
 * click trigger, composable) uses, so a selection can never happen without its
 * `select-text` event.
 *
 * Order inside is load-bearing: the clipboard write is *started* before the
 * event is dispatched, so a consumer's `select-text` handler cannot spend the
 * user activation the write needs. See `copy.ts`.
 *
 * `origin` says whether a render or a deliberate act asked for this cycle. The
 * selection does not care — `'always'` re-selects on every render, which is the
 * whole point of it — but the clipboard does: only `copy.ts` reads it, and only
 * to refuse a render-driven repeat. SEL-5.
 */
export function selectAndReport(
  el: HTMLElement,
  kind: SelectTextKind,
  resolved: ResolvedBinding,
  origin: SelectTextOrigin,
): SelectTextCycle | null {
  const detail = performSelection(el, kind, resolved)
  if (!detail) return null
  const copying = resolved.copy
    ? startCopy(el, detail, { trigger: resolved.trigger, origin })
    : null
  dispatchSelectTextEvent(el, detail)
  return { detail, copying }
}
