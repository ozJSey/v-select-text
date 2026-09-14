/**
 * The one place this package calls `getComputedStyle`.
 *
 * Two reasons it is its own module rather than three inline calls:
 *
 * 1. **It is allowed to be absent.** A non-DOM host, an embedded webview that
 *    narrows the API, a unit test spying on one property — all real. The two
 *    diagnostics in `element-kind.ts` already guarded the call; the walk in
 *    `text-map.ts`, which runs *first* and is load-bearing, did not, so an
 *    absent `getComputedStyle` threw straight out of a Vue lifecycle hook while
 *    the warnings it would have printed were carefully no-opping.
 * 2. **A stub is a partial object.** `vi.spyOn(window, 'getComputedStyle')
 *    .mockReturnValue({ userSelect: 'none' })` is the ordinary way to test one
 *    diagnostic, and every other property then reads back `undefined`. Reading
 *    them through here means a missing value degrades to the CSS initial value
 *    — inline, visible, collapsing, selectable — instead of a `TypeError` from
 *    `undefined.startsWith`.
 *
 * Nothing here caches: `display`, `visibility` and `white-space` decide what the
 * text map contains, so a stale read would mean selecting text the user cannot
 * see. The two once-per-element diagnostics do their own memoizing.
 */

/** The four computed values this package reads, normalized to strings. */
export interface RenderedStyle {
  /** `''` when unavailable — the initial value is `inline`. */
  display: string
  /** `''` when unavailable — the initial value is `normal` (collapsing). */
  whiteSpace: string
  /** `''` when unavailable — the initial value is `visible`. */
  visibility: string
  /** `''` when unavailable — the initial value is `auto` (selectable). */
  userSelect: string
}

const INITIAL: RenderedStyle = { display: '', whiteSpace: '', visibility: '', userSelect: '' }

/**
 * Resolved style for `el`, or the CSS initial values where the engine cannot
 * answer. Never throws.
 */
export function styleOf(el: Element): RenderedStyle {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return INITIAL
  // Widened on assignment rather than cast: a stub returns a partial object,
  // and `getComputedStyle` on a disconnected/foreign node can hand back null.
  const style: Partial<CSSStyleDeclaration> | null = window.getComputedStyle(el)
  return {
    display: style?.display ?? '',
    whiteSpace: style?.whiteSpace ?? '',
    visibility: style?.visibility ?? '',
    userSelect: style?.userSelect ?? style?.webkitUserSelect ?? '',
  }
}
