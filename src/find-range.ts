/**
 * "Which characters does this binding ask for?" — answered against a plain
 * string, so both selection strategies share one implementation: the input
 * path passes `el.value`, the Range path passes the flat subtree text.
 */
import { normalizeOffset } from './resolve'
import type { ResolvedBinding } from './types'

export type RequestedRange =
  /** No `match`, no `start`/`end` — select the whole thing. */
  | { mode: 'all' }
  /** An explicit or matched slice. */
  | { mode: 'range'; start: number; end: number }
  /** A `match` that is not in the text. Nothing to select, nothing to report. */
  | { mode: 'none' }

/**
 * Occurrences of `match` in `text`, in document order, non-overlapping.
 *
 * Stops as soon as `wanted` hits are in hand. A negative `matchIndex` counts
 * from the end and therefore needs all of them, which the caller signals by
 * asking for `Infinity`.
 */
function findOccurrences(
  text: string,
  match: string | RegExp,
  wanted: number,
): Array<[number, number]> {
  const found: Array<[number, number]> = []
  if (wanted <= 0) return found

  if (typeof match === 'string') {
    if (match === '') return found
    let from = 0
    while (found.length < wanted) {
      const at = text.indexOf(match, from)
      if (at === -1) return found
      found.push([at, at + match.length])
      from = at + match.length
    }
    return found
  }

  // Re-flag rather than mutate the caller's RegExp: `lastIndex` on a shared
  // literal would leak between renders, and `y` would stop at index 0.
  const flags = `${match.flags.replace(/[gy]/g, '')}g`
  const scanner = new RegExp(match.source, flags)
  let hit = scanner.exec(text)
  while (hit && found.length < wanted) {
    found.push([hit.index, hit.index + hit[0].length])
    if (hit[0].length === 0) {
      // A zero-length match never advances `lastIndex` on its own — and under
      // `u` / `v` a one-unit bump lands inside a surrogate pair, which the
      // engine snaps back to the start of the code point, so the scan would
      // return the same index forever. Step over the whole code point.
      const codePoint = text.codePointAt(scanner.lastIndex)
      scanner.lastIndex += codePoint !== undefined && codePoint > 0xffff ? 2 : 1
    }
    hit = scanner.exec(text)
  }
  return found
}

export function findRange(text: string, resolved: ResolvedBinding): RequestedRange {
  if (resolved.match !== undefined) {
    const from = resolved.matchIndex
    const found = findOccurrences(text, resolved.match, from < 0 ? Infinity : from + 1)
    const hit = found[from < 0 ? found.length + from : from]
    if (!hit) return { mode: 'none' }
    return { mode: 'range', start: hit[0], end: hit[1] }
  }

  const rawStart = normalizeOffset(resolved.start, text.length)
  const rawEnd = normalizeOffset(resolved.end, text.length)
  if (rawStart === undefined && rawEnd === undefined) return { mode: 'all' }

  const start = rawStart ?? 0
  const end = rawEnd ?? text.length
  // Swap silently — matches Range semantics and removes a footgun.
  return start > end ? { mode: 'range', start: end, end: start } : { mode: 'range', start, end }
}
