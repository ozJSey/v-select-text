/**
 * Composable form — drives the same selection logic from a `setup()` context
 * without binding the directive to a template.
 */
import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'
import { getElementKind, warnUnsupported } from './element-kind'
import { resolveBinding } from './resolve'
import { clearSelection, selectAndReport, type SelectTextCycle } from './selection'
import type {
  SelectTextCopyDetail,
  SelectTextCopyState,
  SelectTextEventDetail,
  SelectTextOptions,
} from './types'

/** Constructor arguments for {@link useSelectText}. */
export interface UseSelectTextParams {
  /**
   * Element to operate on. Required. Accepts the element directly, a getter
   * returning it (the usual pattern with `ref<HTMLElement | null>(null)`),
   * or `null` for a no-op API (useful as an SSR-safe placeholder).
   */
  target:
    | HTMLElement
    | (() => HTMLElement | null)
    | null
  /**
   * Options for every cycle this instance runs.
   *
   * Read **once**, at construction. Mutating the object you passed in has no
   * effect afterwards — {@link UseSelectTextReturn.update} is the only door, and
   * it shallow-merges, so `update({ end: 7 })` keeps the `start` you started
   * with.
   */
  options?: SelectTextOptions
}

export interface UseSelectTextReturn {
  /** Reactive state — `'selected'` after a successful selection cycle, else `'idle'`. */
  state: Ref<'idle' | 'selected'>
  /**
   * Reactive clipboard state, deliberately **separate** from
   * {@link UseSelectTextReturn.state}: widening that union would break every
   * consumer already branching on `'idle' | 'selected'`.
   */
  copyState: Ref<SelectTextCopyState>
  /**
   * Run a selection cycle right now, returning what was selected. `null` when
   * the target resolves to null, is disabled, or a `match` found nothing.
   *
   * Never writes to the clipboard, even with `copy: true` in the options —
   * {@link UseSelectTextReturn.copy} is the door, so the write is always
   * something you asked for from inside your own handler.
   */
  select: () => SelectTextEventDetail | null
  /**
   * Select **and** copy, in one turn. Call it directly from a click / keydown
   * handler: `navigator.clipboard.writeText` needs the transient activation
   * that handler is running under, and awaiting anything first spends it.
   *
   * Resolves with the attempt's detail, or `null` when nothing was selected —
   * so there was nothing to copy and the clipboard was left alone. It never
   * rejects.
   */
  copy: () => Promise<SelectTextCopyDetail | null>
  /**
   * Clear the selection **this target holds**, and reset `state` / `copyState`.
   *
   * A document selection that is not inside the target is left alone: a
   * modal-close or route-leave handler tidying up must not destroy whatever the
   * user had highlighted elsewhere on the page.
   */
  clear: () => void
  /** Re-read options without forcing a selection cycle. */
  update: (next: SelectTextOptions) => void
}

/**
 * Imperative companion to `v-select-text` — the same selection logic driven
 * from a `setup()` context instead of a template binding.
 *
 * SSR-safe: returns a no-op API on the server. `state` starts at `'idle'` and
 * stays there until a cycle actually selects something.
 *
 * @example
 *   const quoteRef = ref<HTMLElement | null>(null)
 *   const selection = useSelectText({
 *     target: () => quoteRef.value,
 *     options: { match: 'the important bit' },
 *   })
 *   onMounted(selection.select)
 *
 * @example copy from inside your own click handler
 *   const api = useSelectText({ target: () => tokenRef.value })
 *   async function onClick() {
 *     const result = await api.copy()   // never rejects; null if nothing was selected
 *     toast(result?.ok ? 'Copied' : 'Could not copy')
 *   }
 *
 * @see vSelectText for the directive form.
 */
export function useSelectText(params: UseSelectTextParams): UseSelectTextReturn {
  const state = ref<'idle' | 'selected'>('idle')
  const copyState = ref<SelectTextCopyState>('idle')
  let lastOpts: SelectTextOptions = { ...(params.options ?? {}) }

  /**
   * Monotonic attempt counter, the composable's mirror of `copySeqMap`.
   *
   * `copyState` is a second view of the state `data-select-text-copy` already
   * holds, and the attribute has been sequence-guarded since SEL-2: a slow
   * earlier write cannot take back what a later one already settled. Without
   * the same guard here the two views disagreed — the attribute reading
   * `'copied'` while a UI bound to `copyState` painted a red cross for the copy
   * that succeeded. `clear()` bumps it too, so a write already in flight can no
   * longer un-reset the `'idle'` the user just asked for.
   */
  let copySeq = 0

  function resolveTargetEl(): HTMLElement | null {
    if (!params.target) return null
    if (typeof params.target === 'function') {
      try {
        return params.target() ?? null
      } catch {
        return null
      }
    }
    return params.target
  }

  /**
   * One selection cycle. `copy` is decided here rather than read from the
   * options, so `select()` can never write and `copy()` always does.
   */
  function runCycle(copy: boolean): SelectTextCycle | null {
    if (typeof document === 'undefined') return null
    const el = resolveTargetEl()
    if (!el) return null
    const kind = getElementKind(el)
    if (!kind) {
      warnUnsupported(el)
      return null
    }
    const resolved = { ...resolveBinding({ ...lastOpts }), copy }
    if (!resolved.enabled) return null
    // Every cycle here is an explicit call — `'request'`, never `'render'`, so
    // `copy()` writes the same text as often as it is asked to.
    const cycle = selectAndReport(el, kind, resolved, 'request')
    // A cycle that selected nothing leaves `state` at 'idle' — the documented
    // contract, and what a badge bound to it has to show.
    state.value = cycle ? 'selected' : 'idle'
    return cycle
  }

  function selectApi(): SelectTextEventDetail | null {
    return runCycle(false)?.detail ?? null
  }

  function copyApi(): Promise<SelectTextCopyDetail | null> {
    // Synchronous up to here on purpose: the write has to start inside the
    // gesture that called us, not after an await. See src/copy.ts.
    const cycle = runCycle(true)
    if (!cycle?.copying) return Promise.resolve(null)
    const seq = ++copySeq
    copyState.value = 'pending'
    return cycle.copying.then((result) => {
      // Report every attempt to the caller — a swallowed failure is worse than
      // a stale ref — but only the newest one owns the shared state.
      if (seq === copySeq) copyState.value = result.ok ? 'copied' : 'error'
      return result
    })
  }

  function clearApi() {
    if (typeof window === 'undefined') return
    const el = resolveTargetEl()
    // `selection.ts` owns every mutation of the document selection, including
    // this one — and it is what checks that the selection being dropped is
    // actually this host's, rather than the one the user made somewhere else.
    if (el) clearSelection(el)
    // Retire any write still in flight: its `.then` would otherwise write
    // 'copied' a tick after the user pressed Clear.
    copySeq++
    state.value = 'idle'
    copyState.value = 'idle'
  }

  function update(next: SelectTextOptions) {
    // Shallow merge with previous opts so callers can pass partial patches
    // (e.g. `api.update({ end: 7 })` keeps `start` / `direction` from init).
    // Matches the `update` contract used by sibling packages like
    // `v-scroll-into-view`'s composable.
    lastOpts = { ...lastOpts, ...next }
  }

  /** Same reason as `clear()`: nothing in flight may write to a dead scope. */
  function retireInFlight() {
    copySeq++
  }

  // Composable plays nicely with auto-cleanup: when the scope dies, drop the
  // selected state so dependents (e.g. badge UIs) reset.
  // `onScopeDispose` warns when there's no active scope (eg. plain script
  // contexts, SSR boot). Gate via `getCurrentScope()` so the composable is
  // usable outside `setup()` / `effectScope.run()` without spam.
  // Both landed in Vue 3.2.0 — checked against the published packages, not the
  // docs: 3.1.5 exports neither — and that is what sets this package's peer
  // floor at `^3.2.0`.
  if (getCurrentScope()) {
    onScopeDispose(() => {
      retireInFlight()
      state.value = 'idle'
      copyState.value = 'idle'
    })
  }

  return { state, copyState, select: selectApi, copy: copyApi, clear: clearApi, update }
}
