/**
 * Binding normalization — every accepted binding shape (undefined, boolean,
 * options object, hostile junk) collapses to one `ResolvedBinding`, and
 * numeric offsets are clamped into range.
 */
import type { ResolvedBinding, SelectTextBinding } from './types'

const DEFAULTS: Omit<ResolvedBinding, 'enabled'> = {
  match: undefined,
  matchIndex: 0,
  start: undefined,
  end: undefined,
  direction: 'forward',
  whitespace: 'collapse',
  trigger: 'edge',
  copy: false,
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
    // Type-excluded, but reachable: a template is not typechecked at runtime,
    // and a stray string binding would arrive carrying `String.prototype.match`
    // as its `match` option — a function the RegExp path would crash on, inside
    // a Vue lifecycle hook. Cheaper to answer "do nothing" here.
    return { enabled: false, ...DEFAULTS }
  }
  // `enabled` wins over `condition` when both are provided. If neither is
  // provided, default to `true` (the bare-directive contract).
  const enabled = value.enabled ?? value.condition ?? true
  return {
    enabled,
    // `null` is a needle that has not arrived yet, not an absent one: an empty
    // string matches nothing, which is the safe reading. Mapping it to
    // `undefined` would select the entire host instead.
    match: value.match === null ? '' : value.match,
    // Truncate toward zero like the offsets do. `Infinity` deliberately
    // survives: it is out of range, and out of range means no selection.
    matchIndex: typeof value.matchIndex === 'number' && !Number.isNaN(value.matchIndex)
      ? Math.trunc(value.matchIndex)
      : 0,
    start: value.start,
    end: value.end,
    direction: value.direction ?? 'forward',
    whitespace: value.whitespace ?? 'collapse',
    trigger: value.trigger ?? 'edge',
    copy: value.copy === true,
  }
}

/**
 * Normalize a user-supplied numeric offset to an integer within
 * `[0, maxLen]`. `NaN` / non-finite / non-numeric returns `undefined` so the
 * caller can fall back to defaults.
 */
export function normalizeOffset(value: number | undefined, maxLen: number): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const truncated = Math.trunc(value)
  if (truncated < 0) return 0
  if (truncated > maxLen) return maxLen
  return truncated
}
