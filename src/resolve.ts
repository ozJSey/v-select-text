/**
 * Binding normalization — every accepted binding shape (undefined, boolean,
 * options object, hostile junk) collapses to one `ResolvedBinding`.
 *
 * A template is not typechecked at runtime. `{ match: orderId }` where the API
 * returned a number, `{ start: Number(field.value) }` on an empty field,
 * `{ start: someRef }` where the ref holds `null` — all compile, all arrive
 * here. This module answers exactly one question about each of them: *can the
 * rest of the package act on this value?* It never guesses. A value that cannot
 * be read is recorded in `unreadable`, and `find-range.ts` turns that into "no
 * selection" while the caller prints one diagnostic naming the option.
 *
 * Clamping is **not** here: it needs the text length, so it lives in
 * `find-range.ts` next to the code that has one.
 */
import type { ResolvedBinding, SelectTextBinding, SelectTextUnreadable } from './types'

const DEFAULTS: Omit<ResolvedBinding, 'enabled'> = {
  match: undefined,
  matchIndex: 0,
  start: undefined,
  end: undefined,
  direction: 'forward',
  whitespace: 'collapse',
  trigger: 'edge',
  copy: false,
  unreadable: null,
}

/** What `find-range.ts` can search with, or `unreadable`. */
type MatchRead = { ok: true; match: string | RegExp | undefined } | { ok: false }

/**
 * Read a `match` binding.
 *
 * - `undefined` is no needle at all, which is what selects the whole host.
 * - `null` — what `ref<string | null>(null)` hands a template before the needle
 *   exists — is a needle that has not arrived. `''` matches nothing, which is
 *   the safe reading; mapping it to `undefined` would select everything.
 * - A number or a bigint is read as its string form. `{ match: orderId }` with
 *   an `orderId` of `4821` is an unambiguous request, and the alternative used
 *   to be `TypeError: Cannot read properties of undefined (reading 'replace')`
 *   thrown out of `mounted` — or out of a raw click listener, where there is no
 *   Vue error boundary at all.
 * - Anything else (a boolean, an object, a `Date`, a function) is not a needle
 *   in any reading, so it is reported rather than interpreted.
 */
function readMatch(raw: unknown): MatchRead {
  if (raw === undefined) return { ok: true, match: undefined }
  if (raw === null) return { ok: true, match: '' }
  if (typeof raw === 'string') return { ok: true, match: raw }
  if (raw instanceof RegExp) return { ok: true, match: raw }
  if (typeof raw === 'bigint') return { ok: true, match: String(raw) }
  if (typeof raw === 'number' && Number.isFinite(raw)) return { ok: true, match: String(raw) }
  return { ok: false }
}

/**
 * Can `find-range.ts` act on this `start` / `end` / `matchIndex`?
 *
 * `undefined` is "not supplied". Any other number is readable — **including
 * ±Infinity**, which is out of range rather than unreadable and is clamped like
 * any other out-of-range value, exactly as `SelectTextOptions.start` has always
 * documented. `NaN`, `null` and non-numbers are not readable, and the important
 * part is what that must *not* mean: falling back to "not supplied" would make
 * `{ start: total / count }` with `count === 0` select the entire host, and with
 * `copy: true` put the entire host on the clipboard.
 */
function isReadableOffset(raw: unknown): boolean {
  return raw === undefined || (typeof raw === 'number' && !Number.isNaN(raw))
}

export function resolveBinding(value: SelectTextBinding | null): ResolvedBinding {
  if (value === undefined || value === true) {
    return { enabled: true, ...DEFAULTS }
  }
  // `null` (common when a template binds `ref<T | null>(null)`) and `false`
  // both mean "do not select". Keeping them as a single branch avoids a
  // `Cannot read properties of null` crash from the object-form branch below.
  if (value === false || value === null) {
    return { enabled: false, ...DEFAULTS }
  }
  if (typeof value !== 'object') {
    // Type-excluded, but reachable: a stray string binding would arrive
    // carrying `String.prototype.match` as its `match` option. Cheaper to
    // answer "do nothing" here.
    return { enabled: false, ...DEFAULTS }
  }
  // `enabled` wins over `condition` when both are provided. If neither is
  // provided, default to `true` (the bare-directive contract).
  const enabled = value.enabled ?? value.condition ?? true

  const match = readMatch(value.match)
  // First offender wins the diagnostic — one line per element, naming the
  // option to look at, is more useful than a list nobody reads.
  const unreadable: SelectTextUnreadable =
    (!match.ok && 'match') ||
    (!isReadableOffset(value.matchIndex) && 'matchIndex') ||
    (!isReadableOffset(value.start) && 'start') ||
    (!isReadableOffset(value.end) && 'end') ||
    null

  return {
    enabled,
    match: match.ok ? match.match : '',
    // Truncate toward zero like the offsets do. `Infinity` deliberately
    // survives: it is out of range, and out of range means no selection.
    matchIndex: typeof value.matchIndex === 'number' ? Math.trunc(value.matchIndex) : 0,
    start: value.start,
    end: value.end,
    direction: value.direction ?? 'forward',
    whitespace: value.whitespace ?? 'collapse',
    trigger: value.trigger ?? 'edge',
    copy: value.copy === true,
    unreadable,
  }
}
