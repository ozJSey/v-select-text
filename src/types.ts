/**
 * Public types + the internal resolved-binding shape.
 *
 * Leaf module: imports nothing.
 */

/** Which selection strategy an element gets — also reported on the event. */
export type SelectTextKind = 'input' | 'textarea' | 'contenteditable' | 'text'

/**
 * How character offsets (`start` / `end`) and `match` searches read the text of
 * a `text` / `contenteditable` host.
 *
 * - `'collapse'` (default): runs of ASCII whitespace count as one space and
 *   leading/trailing whitespace is dropped — i.e. offsets are against the text
 *   **as rendered**. This is what makes hand-written markup work: a template
 *   `<p>\n  Hello\n</p>` has a `textContent` of `" Hello "`, so raw offset `0`
 *   would land on indentation rather than on `H`.
 * - `'preserve'`: offsets are raw `textContent` indices. Correct for hosts with
 *   `white-space: pre` (code blocks, plain-text editors).
 *
 * Ignored for `<input>` / `<textarea>`, whose `value` is already exact.
 */
export type SelectTextWhitespace = 'collapse' | 'preserve'

/**
 * When a selection fires.
 *
 * - `'edge'` (default): on each `false → true` transition of `enabled`.
 * - `'always'`: on every update while `enabled` is true — use when the range
 *   or the text moves and the selection should follow.
 * - `'click'`: never on mount or update; on every click of the host instead,
 *   while `enabled` is true. The click-to-select-a-token behaviour, with an
 *   event and an optional `match` that `user-select: all` cannot give you.
 */
export type SelectTextTrigger = 'edge' | 'always' | 'click'

/**
 * Options for `v-select-text` / `useSelectText`.
 *
 * @example
 *   <p v-select-text="{ enabled: isCopying, match: /\d{4}-\d{2}-\d{2}/ }">Due 2026-08-23</p>
 */
export type SelectTextOptions = {
  /**
   * Whether selection is enabled. Selection fires on each `false → true`
   * transition (unless `trigger` says otherwise).
   *
   * @default true
   */
  enabled?: boolean
  /**
   * Back-compat alias for {@link SelectTextOptions.enabled}. Prefer `enabled`
   * in new code. If both are provided, `enabled` wins.
   *
   * @default true
   * @deprecated Use `enabled` instead. Kept for back-compat.
   */
  condition?: boolean
  /**
   * Select the first occurrence of this string / pattern instead of a numeric
   * range. Takes precedence over `start` / `end`.
   *
   * Searched against `value` for inputs and against the (whitespace-resolved)
   * text of the subtree for everything else, so a match may span nested
   * elements. No match → no selection and no event.
   *
   * `null` — what `ref<string | null>(null)` hands a template before the
   * needle exists — means "no needle yet", so nothing is selected. Leaving
   * `match` off entirely is what selects the whole host.
   *
   * A number or a bigint is read as its string form, so `{ match: orderId }`
   * works when the API returned `4821` rather than `'4821'`. Any other type is
   * not a needle in any reading: nothing is selected and the host warns once.
   *
   * @example { match: 'brown fox' }
   * @example { match: /\bv-[a-z-]+\b/ }
   */
  match?: string | RegExp | null
  /**
   * Which occurrence of {@link SelectTextOptions.match} to select, 0-based.
   * Out of range → no selection. Negative counts from the end, so `-1` is the
   * last occurrence.
   *
   * @default 0
   */
  matchIndex?: number
  /**
   * Selection start offset (UTF-16 code units, like `String#length`).
   * Defaults to `0` when only `end` is provided. Ignored when `match` is set.
   *
   * @remarks
   * - `< 0` is clamped to `0`
   * - `>` the text length is clamped to the text length, `Infinity` included —
   *   so `{ start: Infinity }` collapses to the end of the text and selects
   *   **nothing**
   * - If `start > end`, the two are swapped silently to match the spec.
   * - A value that is not a number and not `undefined` — `NaN` from
   *   `Number('')`, `null` from a `ref<number | null>`, an unparsed string —
   *   cannot be read, so **nothing is selected** and the host warns once. It is
   *   deliberately *not* treated as "not supplied": that would turn
   *   `{ start: total / count }` with `count === 0` into "select the whole
   *   host", and with `copy: true` put the whole host on the clipboard.
   */
  start?: number
  /**
   * Selection end offset. Defaults to the text length when only `start` is
   * provided. Same clamping rules as {@link SelectTextOptions.start}.
   */
  end?: number
  /**
   * Which end of the selection the caret sits at. Forwarded to
   * `setSelectionRange` for inputs; applied via `Selection.setBaseAndExtent`
   * for `text` / `contenteditable` hosts, so Shift+Arrow extends from the
   * other end there too.
   *
   * @default 'forward'
   */
  direction?: 'forward' | 'backward' | 'none'
  /**
   * How `start` / `end` / `match` read the text of a `text` / `contenteditable`
   * host. See {@link SelectTextWhitespace}.
   *
   * @default 'collapse'
   */
  whitespace?: SelectTextWhitespace
  /**
   * When to fire the selection. See {@link SelectTextTrigger}.
   *
   * @default 'edge'
   */
  trigger?: SelectTextTrigger
  /**
   * Also write the selected text to the clipboard.
   *
   * Writes exactly {@link SelectTextEventDetail.text} — the same string the
   * `select-text` event reports, never `getSelection().toString()`. An empty
   * resolution writes nothing, so this cannot clear a clipboard.
   *
   * **Needs `trigger: 'click'`.** `navigator.clipboard.writeText` requires
   * transient user activation; the default `'edge'` trigger fires on mount,
   * with no gesture. Chrome tolerates that in a focused top-level document,
   * Firefox and Safari refuse — so `copy` on any other trigger warns once and
   * still attempts the write, reporting the refusal on `select-text-copy`
   * rather than throwing.
   *
   * @default false
   * @example
   *   <code v-select-text="{ trigger: 'click', copy: true }">npm i v-select-text</code>
   */
  copy?: boolean
}

/**
 * The full union the directive accepts as a binding value.
 *
 *   v-select-text                      // undefined → select all on mount
 *   v-select-text="true"               // select all on mount
 *   v-select-text="false"              // do nothing
 *   v-select-text="someRef"            // reactive boolean
 *   v-select-text="{ enabled, ... }"   // typed options
 */
export type SelectTextBinding = boolean | SelectTextOptions | undefined

/**
 * Detail payload of the `select-text` CustomEvent dispatched after a
 * successful selection.
 *
 * To put `detail.text` on the clipboard, use `copy: true` rather than calling
 * `navigator.clipboard.writeText` from this handler: the write needs transient
 * user activation, which the default `trigger: 'edge'` (it fires on mount) does
 * not have — it is refused in Chrome as well as Firefox and Safari. Measured
 * with trusted input against Chrome 152: see README → *The crux: user
 * activation*.
 *
 * @example
 *   <p v-select-text="enabled" @select-text="onSelectText">…</p>
 *   function onSelectText(e: CustomEvent<SelectTextEventDetail>) {
 *     console.log(e.detail.start, e.detail.end, e.detail.text)
 *   }
 *
 * @example clipboard — needs the click trigger
 *   <code v-select-text="{ trigger: 'click', copy: true }"
 *         @select-text-copy="onCopy">sk-live-…</code>
 */
export type SelectTextEventDetail = {
  /** Resolved start offset that was actually requested. */
  start: number
  /** Resolved end offset that was actually requested. */
  end: number
  /** The text between those offsets — what the user now has selected. */
  text: string
  /** Direction the selection was anchored in. */
  direction: 'forward' | 'backward' | 'none'
  /** Element kind that received the selection. */
  kind: SelectTextKind
}

/**
 * Why a copy did not happen.
 *
 * - `'empty'` — the resolved text was empty, so nothing was written. This is
 *   the guard that makes "`v-select-text` never clears your clipboard" true
 *   whatever asks it to copy; since 2.1.0 a selection cycle cannot produce an
 *   empty `detail.text` at all (see README → *The empty host*), so an empty
 *   resolution ends before a copy is even attempted.
 * - `'no-clipboard'` — the engine exposes no `navigator.clipboard.writeText`
 *   (an insecure context, or an old browser).
 * - `'no-user-activation'` — the write was refused **and**
 *   `navigator.userActivation.isActive` was `false` at the moment it was made.
 *   The usual cause is `copy` on a non-click trigger.
 * - `'denied'` — the write was refused for any other reason, or the engine
 *   exposes no `navigator.userActivation` (Safari) so the cause cannot be
 *   distinguished. `error` carries what the engine threw.
 */
export type SelectTextCopyReason = 'empty' | 'no-clipboard' | 'no-user-activation' | 'denied'

/**
 * Detail payload of the `select-text-copy` CustomEvent, dispatched after every
 * copy attempt — successful or not. Always preceded by the `select-text` whose
 * `detail` it carries as {@link SelectTextCopyDetail.selection}.
 */
export type SelectTextCopyDetail = {
  /** Whether the text reached the clipboard. */
  ok: boolean
  /** The string that was offered — always the selection's `detail.text`. */
  text: string
  /** Why it did not land. Absent when `ok` is `true`. */
  reason?: SelectTextCopyReason
  /** What the engine threw, when it threw something. */
  error?: unknown
  /** The selection this copy belongs to. */
  selection: SelectTextEventDetail
}

/**
 * Copy progress — the value of the `data-select-text-copy` attribute, and of
 * `useSelectText`'s `copyState` ref (which adds `'idle'` for "no attempt yet").
 */
export type SelectTextCopyState = 'idle' | 'pending' | 'copied' | 'error'

/**
 * What asked for a selection cycle.
 *
 * - `'render'` — Vue's lifecycle, `mounted` / `updated`. Nobody asked for this
 *   cycle in particular; the component simply rendered again.
 * - `'request'` — a click, a key, or a `useSelectText` call. One deliberate act,
 *   one cycle.
 *
 * Only the copy path reads it, and only to answer *may this attempt repeat?*
 * See `copy.ts` → `isRenderRepeat`. SEL-5.
 */
export type SelectTextOrigin = 'render' | 'request'

/**
 * Which option the binding supplied that could not be read, or `null`.
 *
 * Internal. Carried on {@link ResolvedBinding} so `find-range.ts` can refuse the
 * request and the caller can print one diagnostic naming the option — rather
 * than the two things the code used to do, which were throw a `TypeError` out
 * of a lifecycle hook (`match`) and silently widen the request to the whole
 * host (`start` / `end`).
 */
export type SelectTextUnreadable = 'match' | 'matchIndex' | 'start' | 'end' | null

/** What a binding value normalizes to before any DOM work happens. */
export interface ResolvedBinding {
  enabled: boolean
  match: string | RegExp | undefined
  matchIndex: number
  start: number | undefined
  end: number | undefined
  direction: 'forward' | 'backward' | 'none'
  whitespace: SelectTextWhitespace
  trigger: SelectTextTrigger
  copy: boolean
  unreadable: SelectTextUnreadable
}
