import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  withDirectives,
  type DirectiveBinding,
} from 'vue'
import {
  useSelectText,
  vSelectText,
  type SelectTextBinding,
  type SelectTextCopyDetail,
  type SelectTextEventDetail,
} from './vSelectText'
// The one internal import in this file: see the `copy.ts` boundary describe below.
import { startCopy } from './src/copy'

/**
 * SEL-2 — `copy: true`.
 *
 * jsdom proves nothing about the clipboard itself: `navigator.clipboard`,
 * `navigator.userActivation`, `isSecureContext` and `document.execCommand` are
 * all `undefined` here, so every one of them is stubbed below. What these tests
 * DO own is everything the browser cannot be asked about cheaply:
 *
 *   - which string was offered to `writeText` (always `detail.text`, never
 *     `getSelection().toString()`)
 *   - that the write is *initiated synchronously* in the same turn as the
 *     selection, before `select-text` is dispatched — the difference between
 *     working in Safari and not
 *   - the event ordering, the sequence and unmount guards, the empty refusal,
 *     and the reason mapping given a synthetic rejection
 *   - the keyboard affordance `trigger: 'click'` now carries
 *
 * The real clipboard, real user activation and real refusals are measured in
 * the browser by `playground/scripts/interactions/v-select-text.mjs`.
 */

function makeBinding(value: SelectTextBinding): DirectiveBinding<SelectTextBinding> {
  return { value, oldValue: undefined, arg: undefined, modifiers: {}, instance: null, dir: {} }
}

function host(html: string, tag = 'p'): HTMLElement {
  const el = document.createElement(tag)
  el.innerHTML = html
  document.body.appendChild(el)
  return el
}

function mount(el: HTMLElement, value: SelectTextBinding): void {
  vSelectText.mounted!(el, makeBinding(value), null as never, null as never)
}

function update(el: HTMLElement, value: SelectTextBinding): void {
  vSelectText.updated!(el, makeBinding(value), null as never, null as never)
}

function unmount(el: HTMLElement): void {
  vSelectText.unmounted!(el, makeBinding(true), null as never, null as never)
}

/** Every `select-text-copy` detail the element fires from now on. */
function captureCopies(el: HTMLElement): SelectTextCopyDetail[] {
  const seen: SelectTextCopyDetail[] = []
  el.addEventListener('select-text-copy', (e) => seen.push((e as CustomEvent).detail))
  return seen
}

/** Drain the microtask queue so a fire-and-forget write settles. */
async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

const ATTR = 'data-select-text-copy'

let writeText: ReturnType<typeof vi.fn>
let warn: MockInstance

function stubClipboard(impl: (text: string) => Promise<void>) {
  writeText = vi.fn(impl)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    writable: true,
    configurable: true,
  })
}

function stubActivation(isActive: boolean | undefined) {
  Object.defineProperty(navigator, 'userActivation', {
    value: isActive === undefined ? undefined : { isActive, hasBeenActive: true },
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  window.getSelection()?.removeAllRanges()
  stubClipboard(() => Promise.resolve())
  stubActivation(undefined)
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
describe('copy: what lands on the clipboard', () => {
  it('a click copies the resolved detail.text', async () => {
    const el = host('sk-live-9f3b2c7d41ae', 'code')
    mount(el, { trigger: 'click', copy: true })

    el.click()
    await flush()

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('sk-live-9f3b2c7d41ae')
  })

  it('copies the RENDERED view, not raw textContent', async () => {
    // Source indentation is in `textContent` and not on screen. The clipboard
    // has to receive what the reader sees selected.
    const el = host('\n   spaced   out\n', 'code')
    mount(el, { trigger: 'click', copy: true })

    el.click()
    await flush()

    expect(el.textContent).toBe('\n   spaced   out\n')
    expect(writeText).toHaveBeenCalledWith('spaced out')
  })

  it('copies only the matched slice when `match` narrows the selection', async () => {
    const el = host('install <strong>v-select-text</strong> now')
    mount(el, { trigger: 'click', copy: true, match: 'v-select-text' })

    el.click()
    await flush()

    expect(writeText).toHaveBeenCalledWith('v-select-text')
  })

  it("copies an input's value slice, not the document selection", async () => {
    const el = document.createElement('input')
    el.value = 'order-12345'
    document.body.appendChild(el)
    mount(el, { trigger: 'click', copy: true, start: 6, end: 11 })

    el.click()
    await flush()

    expect(writeText).toHaveBeenCalledWith('12345')
    expect(window.getSelection()?.toString() ?? '').not.toBe('12345')
  })

  it('never writes without `copy`', async () => {
    const el = host('untouched', 'code')
    mount(el, { trigger: 'click' })

    el.click()
    await flush()

    expect(writeText).not.toHaveBeenCalled()
  })

  it('never writes when copy is explicitly false', async () => {
    const el = host('untouched', 'code')
    mount(el, { trigger: 'click', copy: false })

    el.click()
    await flush()

    expect(writeText).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
describe('copy: ordering — the invariant', () => {
  it('initiates the write synchronously, before select-text is dispatched', () => {
    const el = host('token-value', 'code')
    let writesAtDispatch = -1
    el.addEventListener('select-text', () => {
      writesAtDispatch = writeText.mock.calls.length
    })
    mount(el, { trigger: 'click', copy: true })

    el.click()

    // No `await`: by the time the consumer's `select-text` handler runs, the
    // write is already in flight. A handler cannot consume the activation
    // first, and the write cannot slip past the turn that authorised it.
    expect(writesAtDispatch).toBe(1)
  })

  it('select-text-copy never precedes its select-text', async () => {
    const el = host('token-value', 'code')
    const order: string[] = []
    el.addEventListener('select-text', () => order.push('select'))
    el.addEventListener('select-text-copy', () => order.push('copy'))
    mount(el, { trigger: 'click', copy: true })

    el.click()
    await flush()

    expect(order).toEqual(['select', 'copy'])
  })

  it('reports the exact detail.text of the select-text that preceded it', async () => {
    const el = host('The quick <strong>brown fox</strong> jumps')
    let selection: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e) => (selection = (e as CustomEvent).detail))
    const copies = captureCopies(el)
    mount(el, { trigger: 'click', copy: true, match: 'quick brown' })

    el.click()
    await flush()

    expect(copies).toHaveLength(1)
    expect(copies[0].text).toBe('quick brown')
    expect(copies[0].selection).toEqual(selection)
    expect(writeText).toHaveBeenCalledWith(copies[0].text)
  })

  it('a refusal decided before any write still lands after select-text', async () => {
    // 'no-clipboard' is known synchronously. Reporting it there would put
    // `select-text-copy` in front of the `select-text` it belongs to.
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    const el = host('token-value', 'code')
    const order: string[] = []
    el.addEventListener('select-text', () => order.push('select'))
    el.addEventListener('select-text-copy', () => order.push('copy'))
    mount(el, { trigger: 'click', copy: true })

    el.click()
    await flush()

    expect(order).toEqual(['select', 'copy'])
  })

  it('both events bubble', async () => {
    const wrap = host('<code>bubbled</code>', 'div')
    const el = wrap.querySelector('code')!
    const seen: string[] = []
    document.body.addEventListener('select-text', () => seen.push('select'))
    document.body.addEventListener('select-text-copy', () => seen.push('copy'))
    mount(el, { trigger: 'click', copy: true })

    el.click()
    await flush()

    expect(seen).toEqual(['select', 'copy'])
  })
})

// ---------------------------------------------------------------------------
describe('copy: the state attribute', () => {
  it('goes pending synchronously, then copied', async () => {
    const el = host('token', 'code')
    mount(el, { trigger: 'click', copy: true })

    el.click()
    expect(el.getAttribute(ATTR)).toBe('pending')

    await flush()
    expect(el.getAttribute(ATTR)).toBe('copied')
  })

  it('ends on error when the engine refuses', async () => {
    stubClipboard(() => Promise.reject(new Error('Write permission denied')))
    const el = host('token', 'code')
    mount(el, { trigger: 'click', copy: true })

    el.click()
    await flush()

    expect(el.getAttribute(ATTR)).toBe('error')
  })

  it('is dropped when copy is turned off', async () => {
    const el = host('token', 'code')
    mount(el, { trigger: 'click', copy: true })
    el.click()
    await flush()
    expect(el.getAttribute(ATTR)).toBe('copied')

    update(el, { trigger: 'click', copy: false })

    expect(el.hasAttribute(ATTR)).toBe(false)
  })

  it('is dropped on unmount', async () => {
    const el = host('token', 'code')
    mount(el, { trigger: 'click', copy: true })
    el.click()
    await flush()

    unmount(el)

    expect(el.hasAttribute(ATTR)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('copy: refusals are reported, never thrown', () => {
  it("maps a rejection with no active gesture to 'no-user-activation'", async () => {
    stubActivation(false)
    stubClipboard(() => Promise.reject(new DOMException('Write permission denied', 'NotAllowedError')))
    const el = host('token', 'code')
    const copies = captureCopies(el)
    mount(el, { trigger: 'click', copy: true })

    el.click()
    await flush()

    expect(copies).toHaveLength(1)
    expect(copies[0].ok).toBe(false)
    expect(copies[0].reason).toBe('no-user-activation')
    expect(copies[0].text).toBe('token')
  })

  it("maps a rejection while activation IS active to 'denied', carrying the engine error", async () => {
    stubActivation(true)
    const failure = new DOMException('Write permission denied', 'NotAllowedError')
    stubClipboard(() => Promise.reject(failure))
    const el = host('token', 'code')
    const copies = captureCopies(el)
    mount(el, { trigger: 'click', copy: true })

    el.click()
    await flush()

    expect(copies[0].reason).toBe('denied')
    expect(copies[0].error).toBe(failure)
  })

  it("maps a rejection on an engine with no userActivation API to 'denied'", async () => {
    stubActivation(undefined)
    stubClipboard(() => Promise.reject(new Error('nope')))
    const el = host('token', 'code')
    const copies = captureCopies(el)
    mount(el, { trigger: 'click', copy: true })

    el.click()
    await flush()

    // Safari exposes no `navigator.userActivation`. Guessing 'no-user-activation'
    // there would be a fabrication; 'denied' is what was actually observed.
    expect(copies[0].reason).toBe('denied')
  })

  it("reports 'no-clipboard' rather than throwing when the API is absent", async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    const el = host('token', 'code')
    const copies = captureCopies(el)
    mount(el, { trigger: 'click', copy: true })

    expect(() => el.click()).not.toThrow()
    await flush()

    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatchObject({ ok: false, reason: 'no-clipboard', text: 'token' })
    expect(el.getAttribute(ATTR)).toBe('error')
  })

  it('never throws out of the click handler, and never rejects', async () => {
    stubClipboard(() => Promise.reject(new Error('nope')))
    const el = host('token', 'code')
    const copies = captureCopies(el)
    mount(el, { trigger: 'click', copy: true })

    // Throwing would break the render from a lifecycle hook; rejecting on the
    // directive path would be unhandled-rejection noise in every consumer's
    // console, because nobody there holds the promise. The failure is reported
    // on the event instead.
    expect(() => el.click()).not.toThrow()
    await flush()

    expect(copies[0]).toMatchObject({ ok: false, reason: 'denied' })
  })

  it('the promise the composable DOES hold resolves rather than rejecting', async () => {
    stubClipboard(() => Promise.reject(new Error('nope')))
    const el = host('token')
    const api = useSelectText({ target: el })

    await expect(api.copy()).resolves.toMatchObject({ ok: false, reason: 'denied' })
  })
})

// ---------------------------------------------------------------------------
describe('copy: an empty selection cannot wipe the clipboard', () => {
  it('a collapsed range writes nothing and fires no copy event', async () => {
    const el = host('The quick brown fox')
    const copies = captureCopies(el)
    mount(el, { trigger: 'click', copy: true, start: 5, end: 5 })

    el.click()
    await flush()

    expect(writeText).not.toHaveBeenCalled()
    expect(copies).toEqual([])
    expect(el.hasAttribute(ATTR)).toBe(false)
  })

  it('a match that finds nothing writes nothing and fires no copy event', async () => {
    const el = host('The quick brown fox')
    const copies = captureCopies(el)
    mount(el, { trigger: 'click', copy: true, match: 'nowhere' })

    el.click()
    await flush()

    expect(writeText).not.toHaveBeenCalled()
    expect(copies).toEqual([])
  })

  it('a host with no text yet writes nothing, then copies when the text arrives', async () => {
    const el = host('', 'code')
    mount(el, { trigger: 'click', copy: true })

    el.click()
    await flush()
    expect(writeText).not.toHaveBeenCalled()

    el.textContent = 'arrived'
    update(el, { trigger: 'click', copy: true })
    el.click()
    await flush()

    expect(writeText).toHaveBeenCalledWith('arrived')
  })
})

// ---------------------------------------------------------------------------
describe('copy.ts: the module boundary refuses an empty string on its own', () => {
  // Since SEL-4 a selection cycle cannot produce an empty `detail.text`, so no
  // public binding reaches this branch — which is exactly why it is worth
  // holding directly: `copy.ts` is the only place in the package that writes to
  // the clipboard, and "it never writes an empty string" has to be true of the
  // module itself, not only of its current callers.
  const selection = {
    start: 5,
    end: 5,
    text: '',
    direction: 'forward',
    kind: 'text',
  } as const

  it("refuses with reason 'empty' and does not touch the clipboard", async () => {
    const el = host('The quick brown fox')
    const copies = captureCopies(el)

    const result = await startCopy(el, { ...selection }, { trigger: 'click', origin: 'request' })

    expect(writeText).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, reason: 'empty', text: '' })
    expect(copies).toHaveLength(1)
    expect(copies[0].reason).toBe('empty')
  })
})

// ---------------------------------------------------------------------------
describe('copy: one selection, one attempt, one event', () => {
  it('a single click produces exactly one write and one event', async () => {
    const el = host('token', 'code')
    const copies = captureCopies(el)
    mount(el, { trigger: 'click', copy: true })

    el.click()
    await flush()

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(copies).toHaveLength(1)
  })

  it('a superseded attempt still fires its own event but does not write the attribute', async () => {
    // The stale attempt FAILS and the current one SUCCEEDS, so "the attribute
    // is still 'copied'" can only be true if the sequence guard held. Two
    // attempts with the same outcome would pass either way.
    const gates: Array<{ resolve: () => void; reject: (e: unknown) => void }> = []
    stubClipboard(
      () => new Promise<void>((resolve, reject) => gates.push({ resolve, reject })),
    )
    const el = host('first', 'code')
    const copies = captureCopies(el)
    mount(el, { trigger: 'click', copy: true })

    el.click()
    el.textContent = 'second'
    update(el, { trigger: 'click', copy: true })
    el.click()

    expect(gates).toHaveLength(2)
    // Settle the SECOND attempt first, then the stale one — which fails.
    gates[1].resolve()
    await flush()
    expect(el.getAttribute(ATTR)).toBe('copied')

    gates[0].reject(new Error('too late'))
    await flush()

    // Nothing swallowed: both attempts reported, the stale one as a failure.
    expect(copies).toHaveLength(2)
    expect(copies.map((c) => c.ok)).toEqual([true, false])
    // …but the stale failure did not take the attribute back.
    expect(el.getAttribute(ATTR)).toBe('copied')
    expect(writeText.mock.calls.map((c) => c[0])).toEqual(['first', 'second'])
  })

  it('a host that is re-mounted after teardown reports again', async () => {
    const el = host('token', 'code')
    const copies = captureCopies(el)
    mount(el, { trigger: 'click', copy: true })
    unmount(el)

    mount(el, { trigger: 'click', copy: true })
    el.click()
    await flush()

    expect(copies).toHaveLength(1)
    expect(copies[0].ok).toBe(true)
    expect(el.getAttribute(ATTR)).toBe('copied')
  })

  it('an element unmounted mid-flight dispatches nothing — and the write still lands', async () => {
    let release!: () => void
    stubClipboard(() => new Promise<void>((resolve) => (release = resolve)))
    const el = host('token', 'code')
    const copies = captureCopies(el)
    mount(el, { trigger: 'click', copy: true })

    el.click()
    expect(writeText).toHaveBeenCalledWith('token')

    unmount(el)
    release()
    await flush()

    expect(copies).toEqual([])
    expect(el.hasAttribute(ATTR)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('copy: the activation warning', () => {
  const needsClick = /trigger: 'click'/

  it("warns once when copy is set on the default 'edge' trigger", () => {
    const el = host('token', 'code')

    mount(el, { copy: true })
    update(el, { copy: true })
    update(el, { copy: true })

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(needsClick)
    expect(warn.mock.calls[0][0]).toMatch(/edge/)
  })

  it("warns on trigger: 'always' too", () => {
    const el = host('token', 'code')

    mount(el, { copy: true, trigger: 'always' })

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(needsClick)
  })

  it("says nothing for trigger: 'click'", () => {
    const el = host('token', 'code')

    mount(el, { copy: true, trigger: 'click' })

    expect(warn).not.toHaveBeenCalled()
  })

  it('says nothing when copy is off', () => {
    const el = host('token', 'code')

    mount(el, { trigger: 'edge' })

    expect(warn).not.toHaveBeenCalled()
  })

  it('still attempts the write — the warning does not gate it', async () => {
    const el = host('token', 'code')

    mount(el, { copy: true })
    await flush()

    // The warning is a diagnostic, not a gate. Real engines refuse this without
    // a live gesture — but a flip moments after a real click is legal, and a
    // page granted `clipboard-write` can write with none at all, so
    // pre-blocking would make the package less capable than they permit.
    expect(writeText).toHaveBeenCalledWith('token')
  })
})

// ---------------------------------------------------------------------------
describe("keyboard: trigger 'click' is not mouse-only", () => {
  it('injects tabindex and role=button on a non-interactive host', () => {
    const el = host('token', 'code')

    mount(el, { trigger: 'click' })

    expect(el.getAttribute('tabindex')).toBe('0')
    expect(el.getAttribute('role')).toBe('button')
  })

  it('selects and copies on Enter', async () => {
    const el = host('token', 'code')
    mount(el, { trigger: 'click', copy: true })

    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()

    expect(writeText).toHaveBeenCalledWith('token')
    expect(window.getSelection()?.toString()).toBe('token')
  })

  it('selects and copies on Space, and prevents the page scrolling', async () => {
    const el = host('token', 'code')
    mount(el, { trigger: 'click', copy: true })

    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    el.dispatchEvent(e)
    await flush()

    expect(writeText).toHaveBeenCalledWith('token')
    expect(e.defaultPrevented).toBe(true)
  })

  it('ignores other keys', async () => {
    const el = host('token', 'code')
    mount(el, { trigger: 'click', copy: true })

    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    await flush()

    expect(writeText).not.toHaveBeenCalled()
  })

  it('leaves a native control alone — no injected role, no double fire', async () => {
    for (const tag of ['button', 'textarea']) {
      const el = document.createElement(tag) as HTMLElement
      if (el instanceof HTMLTextAreaElement) el.value = 'in a field'
      else el.textContent = 'press me'
      document.body.appendChild(el)

      mount(el, { trigger: 'click' })

      expect(el.hasAttribute('role')).toBe(false)
      expect(el.hasAttribute('tabindex')).toBe(false)
    }
  })

  it("leaves an <a href> alone — it is already Enter-operable", () => {
    const el = document.createElement('a')
    el.setAttribute('href', '#x')
    el.textContent = 'a link'
    document.body.appendChild(el)

    mount(el, { trigger: 'click' })

    expect(el.hasAttribute('role')).toBe(false)
    expect(el.hasAttribute('tabindex')).toBe(false)
  })

  it("does not clobber the author's own tabindex or role", () => {
    const el = host('token', 'code')
    el.setAttribute('tabindex', '-1')
    el.setAttribute('role', 'note')

    mount(el, { trigger: 'click' })
    unmount(el)

    expect(el.getAttribute('tabindex')).toBe('-1')
    expect(el.getAttribute('role')).toBe('note')
  })

  it('does not remove and re-add the affordance on an unrelated re-render', () => {
    // Removing `tabindex` from a focused host blurs it. A card that re-renders
    // for any other reason must not throw the user out of the token they just
    // tabbed to, so the attributes are diff-driven while the listeners are not.
    const el = host('token', 'code')
    mount(el, { trigger: 'click', copy: true })
    const removeAttribute = vi.spyOn(el, 'removeAttribute')
    const setAttribute = vi.spyOn(el, 'setAttribute')

    update(el, { trigger: 'click', copy: true })
    update(el, { trigger: 'click', copy: true })

    expect(removeAttribute).not.toHaveBeenCalledWith('tabindex')
    expect(removeAttribute).not.toHaveBeenCalledWith('role')
    expect(setAttribute).not.toHaveBeenCalledWith('tabindex', '0')
    expect(el.getAttribute('tabindex')).toBe('0')
    expect(el.getAttribute('role')).toBe('button')
  })

  it('restores the host on unmount', () => {
    const el = host('token', 'code')
    mount(el, { trigger: 'click' })

    unmount(el)

    expect(el.hasAttribute('tabindex')).toBe(false)
    expect(el.hasAttribute('role')).toBe(false)
  })

  it('restores the host when the trigger changes away from click', async () => {
    const el = host('token', 'code')
    mount(el, { trigger: 'click', copy: true })

    update(el, { trigger: 'edge', copy: false })

    expect(el.hasAttribute('tabindex')).toBe(false)
    expect(el.hasAttribute('role')).toBe(false)
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('restores the host when enabled turns false', () => {
    const el = host('token', 'code')
    mount(el, { trigger: 'click', enabled: true })

    update(el, { trigger: 'click', enabled: false })

    expect(el.hasAttribute('tabindex')).toBe(false)
    expect(el.hasAttribute('role')).toBe(false)
  })

  it('adds nothing for the non-click triggers', () => {
    const el = host('token', 'code')

    mount(el, { trigger: 'always' })

    expect(el.hasAttribute('tabindex')).toBe(false)
    expect(el.hasAttribute('role')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('useSelectText: copy() and copyState', () => {
  it('copy() selects, writes and returns the detail', async () => {
    const el = host('the important bit')
    const api = useSelectText({ target: el })

    const result = await api.copy()

    expect(writeText).toHaveBeenCalledWith('the important bit')
    expect(result).toMatchObject({ ok: true, text: 'the important bit' })
    expect(result!.selection.kind).toBe('text')
  })

  it('copyState walks idle → pending → copied', async () => {
    let release!: () => void
    stubClipboard(() => new Promise<void>((resolve) => (release = resolve)))
    const el = host('the important bit')
    const api = useSelectText({ target: el })

    expect(api.copyState.value).toBe('idle')
    const pending = api.copy()
    expect(api.copyState.value).toBe('pending')

    release()
    await pending

    expect(api.copyState.value).toBe('copied')
  })

  it('copyState ends at error on a refusal', async () => {
    stubClipboard(() => Promise.reject(new Error('nope')))
    const el = host('the important bit')
    const api = useSelectText({ target: el })

    const result = await api.copy()

    expect(result!.ok).toBe(false)
    expect(api.copyState.value).toBe('error')
  })

  it('state keeps its own two-value union — copyState is separate', async () => {
    const el = host('the important bit')
    const api = useSelectText({ target: el })

    await api.copy()

    expect(api.state.value).toBe('selected')
    expect(api.copyState.value).toBe('copied')
  })

  it('copy() returns null and writes nothing when the selection is empty', async () => {
    const el = host('')
    const api = useSelectText({ target: el })

    const result = await api.copy()

    expect(result).toBeNull()
    expect(writeText).not.toHaveBeenCalled()
    expect(api.copyState.value).toBe('idle')
  })

  it('copy() returns null for a null target', async () => {
    const api = useSelectText({ target: null })

    expect(await api.copy()).toBeNull()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('select() never writes — copy() is the door', async () => {
    const el = host('the important bit')
    const api = useSelectText({ target: el, options: { copy: true } })

    api.select()
    await flush()

    expect(writeText).not.toHaveBeenCalled()
    expect(api.copyState.value).toBe('idle')
  })

  it('clear() resets copyState alongside state', async () => {
    const el = host('the important bit')
    const api = useSelectText({ target: el })
    await api.copy()

    api.clear()

    expect(api.state.value).toBe('idle')
    expect(api.copyState.value).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
/**
 * SEL-5 — `trigger: 'always'` + `copy: true` + a `select-text-copy` handler
 * that writes state was an **unbounded clipboard loop**: the copy settles in a
 * promise, the handler re-renders, `'always'` selects again and starts another
 * write. Vue's recursive-update guard only sees synchronous re-entry, so it
 * never fired — measured in Chrome at ~8,600 real `writeText` calls per second,
 * indefinitely, on a page that still looked responsive. The same handler on
 * `@select-text` with no `copy` stops at 100.
 *
 * These are the jsdom half: they count the writes. The browser half is
 * `playground/scripts/interactions/v-select-text.mjs` against playground card
 * `16-always-copy-loop.vue`, which counts real `navigator.clipboard.writeText`
 * calls made by a real render loop.
 */
describe("SEL-5: trigger 'always' + copy + a handler that writes state", () => {
  /**
   * A real Vue app, because the loop *is* the render cycle — driving the hooks
   * by hand cannot reproduce it. `budget` is what makes a regression fail the
   * test instead of hanging the runner: the handler stops writing state after
   * that many attempts, so the pre-fix count is finite and provably wrong
   * rather than infinite.
   */
  function mountAlwaysCopy(initial: string, budget = 30) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const text = ref(initial)
    const tick = ref(0)
    let renders = 0

    const App = defineComponent({
      setup() {
        return () =>
          withDirectives(h('p', { 'data-tick': tick.value }, text.value), [
            [vSelectText, { trigger: 'always', copy: true }],
          ])
      },
    })
    const app = createApp(App)
    // Count renders from the outside: `onUpdated` on the host component is the
    // honest measure of "the handler did re-render", and it must keep counting
    // even when nothing copies.
    app.mixin({ updated: () => { renders++ } })
    app.mount(container)

    const el = container.querySelector('p')!
    const copies: SelectTextCopyDetail[] = []
    // Attached synchronously after mount — the first write is already in
    // flight, but nothing has settled yet, so no event is missed.
    el.addEventListener('select-text-copy', (e) => {
      copies.push((e as CustomEvent).detail)
      // The README's own `select-text-copy` example is `toast(…)`. This is that
      // shape: a state write, from the handler, on every attempt.
      if (copies.length <= budget) tick.value++
    })

    return { app, container, el, text, tick, copies, renders: () => renders }
  }

  /** Let the promise/render cycle run itself out — or run away, if it can. */
  async function settle(rounds = 60) {
    for (let i = 0; i < rounds; i++) {
      await nextTick()
      await Promise.resolve()
    }
  }

  it('one unchanged text = one write, however many times the handler re-renders', async () => {
    const rig = mountAlwaysCopy('AAPL 241.18 +0.94%')

    await settle()

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(rig.copies).toHaveLength(1)
    // The loop's driver is genuinely live: the handler DID write state and the
    // component DID re-render. What stopped is the clipboard, not the render.
    expect(rig.renders()).toBeGreaterThan(0)
    rig.app.unmount()
  })

  it('20 forced re-renders with the text unchanged still write once', async () => {
    const rig = mountAlwaysCopy('AAPL 241.18 +0.94%')
    await settle()

    for (let i = 0; i < 20; i++) {
      rig.tick.value++
      await nextTick()
      await flush()
    }

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(rig.copies).toHaveLength(1)
    expect(rig.renders()).toBeGreaterThanOrEqual(20)
    rig.app.unmount()
  })

  it('the write follows the TEXT: changing it copies again, exactly once', async () => {
    const rig = mountAlwaysCopy('AAPL 241.18 +0.94%')
    await settle()

    rig.text.value = 'MSFT 508.02 -0.31%'
    await settle()

    expect(writeText).toHaveBeenCalledTimes(2)
    expect(writeText).toHaveBeenNthCalledWith(1, 'AAPL 241.18 +0.94%')
    expect(writeText).toHaveBeenNthCalledWith(2, 'MSFT 508.02 -0.31%')
    expect(rig.copies.map((c) => c.text)).toEqual(['AAPL 241.18 +0.94%', 'MSFT 508.02 -0.31%'])
    rig.app.unmount()
  })

  it('a suppressed attempt leaves data-select-text-copy alone — no MutationObserver churn', async () => {
    // The second loop source the re-audit flagged: `setAttribute` queues a
    // MutationRecord even for an identical value, so a consumer observing the
    // host gets a callback per attempt. Two records for one attempt
    // (pending → copied) is the floor; anything more is the churn.
    const rig = mountAlwaysCopy('AAPL 241.18 +0.94%')
    let records = 0
    const observer = new MutationObserver((list) => { records += list.length })
    observer.observe(rig.el, { attributes: true, attributeFilter: [ATTR] })

    await settle()
    for (let i = 0; i < 20; i++) {
      rig.tick.value++
      await nextTick()
      await flush()
    }
    records += observer.takeRecords().length
    observer.disconnect()

    expect(records).toBeLessThanOrEqual(2)
    expect(rig.el.getAttribute(ATTR)).toBe('copied')
    rig.app.unmount()
  })

  it('a REFUSED attempt does not retry on the next render either', async () => {
    // Keyed on the last attempt, not the last success, because the README's
    // example toasts failures too — `toast('could not copy')` re-renders just
    // as well as `toast('copied')`.
    stubClipboard(() => Promise.reject(new DOMException('nope', 'NotAllowedError')))
    const rig = mountAlwaysCopy('AAPL 241.18 +0.94%')

    await settle()

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(rig.copies).toHaveLength(1)
    expect(rig.copies[0].ok).toBe(false)
    expect(rig.el.getAttribute(ATTR)).toBe('error')
    rig.app.unmount()
  })

  it('the warning names the once-per-text rule for `always`, and not for `edge`', () => {
    const always = host('token', 'code')
    mount(always, { trigger: 'always', copy: true })
    expect(warn.mock.calls[0][0]).toMatch(/at most once per distinct text/)

    warn.mockClear()
    const edge = host('token', 'code')
    mount(edge, { trigger: 'edge', copy: true })
    expect(warn.mock.calls[0][0]).not.toMatch(/at most once per distinct text/)
  })
})

// ---------------------------------------------------------------------------
describe('SEL-5: what the guard must NOT take away', () => {
  it("trigger: 'edge' re-copies the same text on every re-arm", async () => {
    // Playground card 15 is exactly this: one unchanged token, flipped false →
    // true over and over, and every press has to reach the clipboard. An
    // explicit re-arm is an act; a re-render is not.
    const el = host('TOKEN-ACTIVATION-DEMO-4821')
    mount(el, { enabled: false, copy: true })

    for (let i = 0; i < 3; i++) {
      update(el, { enabled: true, copy: true })
      await flush()
      update(el, { enabled: false, copy: true })
      await flush()
    }

    expect(writeText).toHaveBeenCalledTimes(3)
    expect(writeText).toHaveBeenLastCalledWith('TOKEN-ACTIVATION-DEMO-4821')
  })

  it("trigger: 'click' copies the same token on every click", async () => {
    const el = host('sk-live-9f3b2c7d41ae', 'code')
    const copies = captureCopies(el)
    mount(el, { trigger: 'click', copy: true })

    el.click()
    await flush()
    el.click()
    await flush()
    el.click()
    await flush()

    expect(writeText).toHaveBeenCalledTimes(3)
    expect(copies).toHaveLength(3)
  })

  it("useSelectText().copy() writes every time, even with trigger: 'always' in its options", async () => {
    const el = host('the important bit')
    const api = useSelectText({ target: el, options: { trigger: 'always' } })

    await api.copy()
    await api.copy()

    expect(writeText).toHaveBeenCalledTimes(2)
    expect(api.copyState.value).toBe('copied')
  })

  it('turning `copy` off and on again re-arms the write for the same text', async () => {
    const el = host('AAPL 241.18 +0.94%')
    mount(el, { trigger: 'always', copy: true })
    await flush()
    expect(writeText).toHaveBeenCalledTimes(1)

    update(el, { trigger: 'always', copy: true })
    await flush()
    expect(writeText).toHaveBeenCalledTimes(1)

    update(el, { trigger: 'always', copy: false })
    await flush()
    update(el, { trigger: 'always', copy: true })
    await flush()

    expect(writeText).toHaveBeenCalledTimes(2)
  })

  it('a remounted host is a fresh one — the WeakMap does not outlive it', async () => {
    const el = host('AAPL 241.18 +0.94%')
    mount(el, { trigger: 'always', copy: true })
    await flush()
    unmount(el)

    mount(el, { trigger: 'always', copy: true })
    await flush()

    expect(writeText).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
describe('SEL-5: the non-click warning waits until the write can happen', () => {
  it('mounting `enabled: false` with copy does NOT warn', () => {
    const el = host('TOKEN-ACTIVATION-DEMO-4821')
    mount(el, { enabled: false, copy: true })

    expect(warn).not.toHaveBeenCalled()
  })

  it('the warning arrives on the render that enables it, once', async () => {
    const el = host('TOKEN-ACTIVATION-DEMO-4821')
    mount(el, { enabled: false, copy: true })

    update(el, { enabled: true, copy: true })
    await flush()
    update(el, { enabled: false, copy: true })
    update(el, { enabled: true, copy: true })
    await flush()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/has no user gesture to write under/)
  })
})
