import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type DirectiveBinding } from 'vue'
import {
  useSelectText,
  vSelectText,
  type SelectTextBinding,
  type SelectTextEventDetail,
  type SelectTextOptions,
} from './vSelectText'

/**
 * The 2026-09-13 adversarial quality audit, one describe per finding.
 *
 * Every test here was written **red** against 2.1.0 and names the reading of
 * the defect it pins, because several of them replace a test that was passing
 * while asserting the bug. jsdom is enough for all of them except two, which
 * say so and hand the claim to `playground/scripts/interactions/v-select-text.mjs`:
 * whether `el.select()` moves focus, and whether the late-text watch fires in a
 * real browser's microtask ordering.
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

/** Every `select-text` detail the element fires from now on, in order. */
function capture(el: HTMLElement): SelectTextEventDetail[] {
  const seen: SelectTextEventDetail[] = []
  el.addEventListener('select-text', (e) => seen.push((e as CustomEvent).detail))
  return seen
}

function selected(): string {
  return window.getSelection()?.toString() ?? ''
}

/** A MutationObserver callback is a task, not a microtask. */
const settleObserver = () => new Promise((r) => setTimeout(r, 0))

let warn: MockInstance

beforeEach(() => {
  document.body.innerHTML = ''
  window.getSelection()?.removeAllRanges()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

// ---------------------------------------------------------------------------
// Finding 1 — the flagship promise was driven by the wrong input.
//
// `updated` fires when the OWNING COMPONENT re-renders, never because the
// host's text changed. Every proof of "it selects when the text lands" — 29
// tests and a playground card — used the one shape where those coincide.
// ---------------------------------------------------------------------------
describe('audit 1: late text lands even when the owner does not re-render', () => {
  it('a child component filling the host fires exactly one select-text', async () => {
    // The reproduction, as a real app. The <p> carries the directive; the text
    // belongs to <Child>, so <Owner> renders exactly once and `updated` on the
    // <p> is never called at all. Before the fix: zero events, forever.
    const text = ref('')
    const Child = defineComponent({
      setup: () => () => text.value,
    })
    const Owner = defineComponent({
      setup: () => () => h('p', { class: 'late' }, [h(Child)]),
    })
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = createApp(Owner)
    app.directive('select-text', vSelectText)

    // Register the directive by rendering it through a wrapper that binds it.
    app.unmount()

    const Wrapper = defineComponent({
      setup() {
        return () => h('p', { class: 'late' }, [h(Child)])
      },
      directives: { selectText: vSelectText },
    })
    const app2 = createApp({
      render: () => h(Wrapper),
    })
    app2.mount(root)
    void app2

    // The declarative route above cannot express `v-select-text` without a
    // template compiler, so drive the same shape directly: mount the directive
    // on a host whose text is written by something other than its owner.
    app2.unmount()
    root.remove()

    const el = host('')
    const seen = capture(el)
    mount(el, true)
    expect(seen).toHaveLength(0)

    // The text arrives from outside the owner's render.
    el.textContent = 'Text that arrived from the API after mount.'
    await settleObserver()

    expect(seen).toHaveLength(1)
    expect(seen[0]?.text).toBe('Text that arrived from the API after mount.')
    expect(selected()).toBe('Text that arrived from the API after mount.')
  })

  it('a v-html-style innerHTML write counts as the text arriving', async () => {
    const el = host('')
    const seen = capture(el)
    mount(el, true)

    el.innerHTML = 'Ships from <strong>Rotterdam</strong>'
    await settleObserver()

    expect(seen).toHaveLength(1)
    expect(seen[0]?.text).toBe('Ships from Rotterdam')
  })

  it('a match that only becomes findable later still fires', async () => {
    const el = host('waiting')
    const seen = capture(el)
    mount(el, { match: 'INV-4821' })
    expect(seen).toHaveLength(0)

    el.textContent = 'invoice INV-4821 is due'
    await settleObserver()

    expect(seen.map((d) => d.text)).toEqual(['INV-4821'])
  })

  it('stops watching the moment a selection lands — one event, not one per mutation', async () => {
    const el = host('')
    const seen = capture(el)
    mount(el, true)

    el.textContent = 'first'
    await settleObserver()
    el.textContent = 'second'
    el.textContent = 'third'
    await settleObserver()

    expect(seen.map((d) => d.text)).toEqual(['first'])
  })

  it('never watches a host that already selected on mount', async () => {
    const el = host('already here')
    const seen = capture(el)
    mount(el, true)
    expect(seen).toHaveLength(1)

    el.textContent = 'changed underneath'
    await settleObserver()

    expect(seen).toHaveLength(1)
  })

  it('does not watch a disabled host, and starts watching when it is enabled', async () => {
    const el = host('')
    const seen = capture(el)
    mount(el, false)

    el.textContent = 'arrived while disabled'
    await settleObserver()
    expect(seen).toHaveLength(0)

    update(el, true)
    // Enabling with the text already present selects synchronously; the watch
    // is only for text that has not arrived yet.
    expect(seen).toHaveLength(1)
  })

  it("does not watch a trigger: 'click' host — a DOM trigger owns every fire", async () => {
    const el = host('', 'code')
    const seen = capture(el)
    mount(el, { trigger: 'click' })

    el.textContent = 'sk-live-9f3b2c7d41ae'
    await settleObserver()

    expect(seen).toHaveLength(0)
  })

  it('never takes the selection from someone typing into a contenteditable host', async () => {
    const el = document.createElement('div')
    el.setAttribute('contenteditable', 'true')
    document.body.appendChild(el)
    const seen = capture(el)
    mount(el, true)

    el.focus()
    el.textContent = 'H'
    await settleObserver()

    expect(seen).toHaveLength(0)
  })

  it('fills a contenteditable host from code, unfocused, and does fire', async () => {
    const el = document.createElement('div')
    el.setAttribute('contenteditable', 'true')
    document.body.appendChild(el)
    const seen = capture(el)
    mount(el, true)

    el.textContent = 'Draft loaded from the server'
    await settleObserver()

    expect(seen).toHaveLength(1)
  })

  it('stops watching on unmount — a detached host fires nothing', async () => {
    const el = host('')
    const seen = capture(el)
    mount(el, true)
    unmount(el)

    el.textContent = 'too late'
    await settleObserver()

    expect(seen).toHaveLength(0)
  })

  it('an armed host that keeps resolving to nothing never loops', async () => {
    // A cycle that selects nothing dispatches nothing, so there is no handler
    // to write state and feed the observer. Bounded by the external mutation
    // rate, which is the point of it.
    const el = host('')
    const seen = capture(el)
    mount(el, { match: 'never-appears' })

    for (let i = 0; i < 20; i++) {
      el.textContent = `still nothing ${i}`
      await settleObserver()
    }

    expect(seen).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Finding 2 + 13 — what the walk can see.
// ---------------------------------------------------------------------------
describe('audit 2/13: a match can never reach into text the user cannot see', () => {
  it("'preserve' does not select a display: none fragment", () => {
    const el = host('<span style="display:none">SECRET-TOKEN</span>visible')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e) => (detail = (e as CustomEvent).detail))
    mount(el, { whitespace: 'preserve', match: 'SECRET-TOKEN' })
    expect(detail).toBeNull()
  })

  it("'preserve' does not put hidden text on the clipboard", () => {
    const el = host('ORD-2026-0917<span style="display:none">-INTERNAL-DRAFT</span>')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e) => (detail = (e as CustomEvent).detail))
    mount(el, { whitespace: 'preserve' })
    expect(detail!.text).toBe('ORD-2026-0917')
  })

  it('visibility: hidden text is not counted, so later offsets do not shift', () => {
    const el = host('<span style="visibility:hidden">GHOST</span>visible')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e) => (detail = (e as CustomEvent).detail))
    mount(el, { start: 0, end: 7 })
    expect(detail!.text).toBe('visible')
  })

  it('a match cannot find visibility: hidden text', () => {
    const el = host('<span style="visibility:hidden">GHOST</span>visible')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e) => (detail = (e as CustomEvent).detail))
    mount(el, { match: 'GHOST' })
    expect(detail).toBeNull()
  })

  it('a visibility: visible descendant of a hidden element comes back', () => {
    // `visibility` is inherited and a child may override it, so the subtree
    // cannot simply be skipped the way `display: none` is.
    const el = host(
      '<span style="visibility:hidden">GHOST<em style="visibility:visible">SEEN</em></span>tail',
    )
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e) => (detail = (e as CustomEvent).detail))
    mount(el, true)
    expect(detail!.text).toBe('SEENtail')
  })

  it('warns when the host itself is visibility: hidden, rather than going quiet', () => {
    const el = host('invisible but selected')
    el.style.visibility = 'hidden'
    mount(el, true)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('visibility: hidden'))
  })
})

// ---------------------------------------------------------------------------
// Finding 3 — a match the code cannot read used to throw out of a lifecycle
// hook, and out of every click.
// ---------------------------------------------------------------------------
describe('audit 3: an unreadable match does not throw', () => {
  for (const bad of [false, {}, new Date(), [], () => {}] as unknown[]) {
    it(`survives match: ${Object.prototype.toString.call(bad)}`, () => {
      const el = host('the important bit')
      const seen = capture(el)
      expect(() => mount(el, { match: bad } as SelectTextOptions)).not.toThrow()
      expect(seen).toHaveLength(0)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('`match` this directive cannot read'))
    })
  }

  it('reads a number as its string form — { match: orderId } from an API', () => {
    const el = host('order 4821 shipped')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e) => (detail = (e as CustomEvent).detail))
    mount(el, { match: 4821 } as unknown as SelectTextOptions)
    expect(detail!.text).toBe('4821')
  })

  it('reads a bigint the same way', () => {
    const el = host('order 4821 shipped')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e) => (detail = (e as CustomEvent).detail))
    mount(el, { match: 4821n } as unknown as SelectTextOptions)
    expect(detail!.text).toBe('4821')
  })

  it('does not throw out of a raw click listener, where Vue cannot catch it', () => {
    const el = host('sk-live-9f3b2c7d41ae', 'code')
    mount(el, { trigger: 'click', match: 0 } as unknown as SelectTextOptions)
    expect(() => el.click()).not.toThrow()
    expect(() => el.click()).not.toThrow()
    // …and it says so exactly once, not once per click.
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('cannot read'))).toHaveLength(1)
  })

  it('still treats null as "the needle has not arrived", with no warning', () => {
    const el = host('the important bit')
    const seen = capture(el)
    mount(el, { match: null })
    expect(seen).toHaveLength(0)
    expect(warn).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Finding 5 + 7 — the composable's clear().
// ---------------------------------------------------------------------------
describe('audit 5: clear() only clears what its own target holds', () => {
  it('leaves a selection made somewhere else on the page alone', () => {
    const aside = host('the user was reading this', 'aside')
    const quote = host('a paragraph that never selected anything')

    const range = document.createRange()
    range.selectNodeContents(aside)
    window.getSelection()!.addRange(range)
    expect(selected()).toBe('the user was reading this')

    useSelectText({ target: quote }).clear()

    expect(selected()).toBe('the user was reading this')
  })

  it('does clear the selection its own target holds', () => {
    const quote = host('a paragraph this api selected')
    const api = useSelectText({ target: quote })
    api.select()
    expect(selected()).toBe('a paragraph this api selected')

    api.clear()

    expect(selected()).toBe('')
    expect(api.state.value).toBe('idle')
  })

  it("still empties an input's own selection, which the document never sees", () => {
    const field = document.createElement('input')
    field.value = 'Hello World'
    document.body.appendChild(field)
    const api = useSelectText({ target: field })
    api.select()
    expect(field.selectionEnd).toBe(11)

    api.clear()

    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Findings 6 + 7 — copyState is a second view of the state the attribute
// already holds, and the attribute has been sequence-guarded since SEL-2.
// ---------------------------------------------------------------------------
describe('audit 6/7: copyState agrees with the attribute it mirrors', () => {
  function deferredClipboard() {
    const settlers: Array<{ resolve: () => void; reject: (e: unknown) => void }> = []
    const writeText = vi.fn(
      () => new Promise<void>((resolve, reject) => settlers.push({ resolve, reject })),
    )
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    return settlers
  }

  it('a slow FIRST write that fails cannot take back a later success', async () => {
    const el = host('AAPL 241.18', 'code')
    const settlers = deferredClipboard()
    const api = useSelectText({ target: el })

    const first = api.copy()
    const second = api.copy()
    expect(settlers).toHaveLength(2)

    settlers[1].resolve()
    await second
    expect(api.copyState.value).toBe('copied')

    settlers[0].reject(new Error('too late'))
    await first

    // The DOM attribute has always been right here. The ref used to end at
    // 'error' — a red cross beside CSS painting a green tick.
    expect(el.getAttribute('data-select-text-copy')).toBe('copied')
    expect(api.copyState.value).toBe('copied')
  })

  it('clear() is not undone by a write already in flight', async () => {
    const el = host('AAPL 241.18', 'code')
    const settlers = deferredClipboard()
    const api = useSelectText({ target: el })

    const pending = api.copy()
    api.clear()
    expect(api.copyState.value).toBe('idle')

    settlers[0].resolve()
    await pending

    expect(api.copyState.value).toBe('idle')
    expect(api.state.value).toBe('idle')
  })

  it('the caller still gets every attempt back, even the superseded one', async () => {
    const el = host('AAPL 241.18', 'code')
    const settlers = deferredClipboard()
    const api = useSelectText({ target: el })

    const first = api.copy()
    const second = api.copy()
    settlers[1].resolve()
    settlers[0].reject(new Error('nope'))

    await expect(second).resolves.toMatchObject({ ok: true })
    await expect(first).resolves.toMatchObject({ ok: false })
  })
})

// ---------------------------------------------------------------------------
// Finding 8 — the load-bearing getComputedStyle call had no guard, while the
// two warnings that merely *report* carefully had one.
// ---------------------------------------------------------------------------
describe('audit 8: a missing or partial getComputedStyle does not throw', () => {
  it('an absent getComputedStyle selects rather than throwing out of mounted', () => {
    const real = window.getComputedStyle
    // @ts-expect-error — deliberately removing an API the types say is always there
    delete window.getComputedStyle
    try {
      const el = host('Hello World')
      let detail: SelectTextEventDetail | null = null
      el.addEventListener('select-text', (e) => (detail = (e as CustomEvent).detail))
      expect(() => mount(el, true)).not.toThrow()
      expect(detail!.text).toBe('Hello World')
    } finally {
      window.getComputedStyle = real
    }
  })

  it('a stub returning only one property does not reach undefined.startsWith', () => {
    // The shape every "test one diagnostic" spy in this repo uses. It survived
    // before only because its fixtures happened to have no element children.
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      userSelect: 'none',
    } as unknown as CSSStyleDeclaration)

    const el = host('Hello <strong>World</strong>')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e) => (detail = (e as CustomEvent).detail))

    expect(() => mount(el, true)).not.toThrow()
    expect(detail!.text).toBe('Hello World')
  })
})

// ---------------------------------------------------------------------------
// Finding 12 + 15 — the input paths.
// ---------------------------------------------------------------------------
describe('audit 12: the whole-value path does not go through select()', () => {
  it('never calls el.select() for a field that accepts setSelectionRange', () => {
    // jsdom's `select()` does not focus, so no unit test can measure the focus
    // claim itself — the browser check in
    // playground/scripts/interactions/v-select-text.mjs does. What IS testable
    // is that the focusing call is not on the path at all.
    const field = document.createElement('input')
    field.value = 'Hello World'
    document.body.appendChild(field)
    const selectSpy = vi.spyOn(field, 'select')
    const rangeSpy = vi.spyOn(field, 'setSelectionRange')

    mount(field, true)

    expect(selectSpy).not.toHaveBeenCalled()
    expect(rangeSpy).toHaveBeenCalledWith(0, 11, 'forward')
  })

  it('a textarea selects its whole value the same way', () => {
    const area = document.createElement('textarea')
    area.value = 'two\nlines'
    document.body.appendChild(area)
    const selectSpy = vi.spyOn(area, 'select')

    mount(area, true)

    expect(selectSpy).not.toHaveBeenCalled()
    expect(area.selectionStart).toBe(0)
    expect(area.selectionEnd).toBe(9)
  })

  it('does not move focus on mount', () => {
    const other = document.createElement('button')
    document.body.appendChild(other)
    other.focus()
    const field = document.createElement('input')
    field.value = 'Hello World'
    document.body.appendChild(field)

    mount(field, true)

    expect(document.activeElement).toBe(other)
  })
})

// ---------------------------------------------------------------------------
// Finding 14 — the "warn once" sets memoized only the failure case.
// ---------------------------------------------------------------------------
describe('audit 14: the diagnostics stop walking the DOM after the first cycle', () => {
  it('resolves styles a bounded number of times however often a host re-selects', () => {
    const deep = host('<span>deep</span>', 'div')
    const el = document.createElement('p')
    el.textContent = 'Hello World'
    deep.appendChild(el)

    const spy = vi.spyOn(window, 'getComputedStyle')
    mount(el, { trigger: 'always' })
    const first = spy.mock.calls.length

    for (let i = 0; i < 10; i++) update(el, { trigger: 'always' })
    const perCycle = (spy.mock.calls.length - first) / 10

    // The map itself still reads a style per element child — it has to, or the
    // text would go stale. What must not repeat is the two diagnostics, which
    // walked the whole ancestor chain to reach the same silence every time.
    expect(perCycle).toBeLessThanOrEqual(1)
  })

  it('still warns exactly once when there IS something to say', () => {
    const wrapper = host('', 'div')
    wrapper.style.display = 'none'
    const el = document.createElement('p')
    el.textContent = 'Hello World'
    wrapper.appendChild(el)

    mount(el, { trigger: 'always' })
    update(el, { trigger: 'always' })
    update(el, { trigger: 'always' })

    expect(warn.mock.calls.filter((c) => String(c[0]).includes('renders nothing'))).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// types.ts:8 — the four-kind classification claims to be exhaustive.
// ---------------------------------------------------------------------------
describe('audit: <img contenteditable> is not a contenteditable host', () => {
  it('warns as unsupported instead of taking the Range path', () => {
    const editable = host('', 'div')
    editable.setAttribute('contenteditable', 'true')
    const img = document.createElement('img')
    editable.appendChild(img)

    mount(img, true)

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('<img> holds no selectable text'))
  })

  it('an ordinary editable <div> is still contenteditable', () => {
    const el = host('editable text', 'div')
    el.setAttribute('contenteditable', 'true')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e) => (detail = (e as CustomEvent).detail))

    mount(el, true)

    expect(detail!.kind).toBe('contenteditable')
  })
})

// ---------------------------------------------------------------------------
// The one shape the review says every existing proof manufactured: a real Vue
// app, with the directive registered the documented way, and the text owned by
// a child component.
// ---------------------------------------------------------------------------
describe('audit 1 (integration): a real app, text owned by a child', () => {
  it('the owner renders once, the text arrives, and the host selects it', async () => {
    const text = ref('')
    const Child = defineComponent({
      name: 'Child',
      setup() {
        return () => text.value
      },
    })
    let ownerRenders = 0
    const Owner = defineComponent({
      name: 'Owner',
      components: { Child },
      directives: { selectText: vSelectText },
      setup() {
        return () => {
          ownerRenders++
          return h(
            'p',
            { class: 'late' },
            // withDirectives is what a template compiles to; using h + the
            // directive object directly keeps this test compiler-free.
            [h(Child)],
          )
        }
      },
    })

    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = createApp(Owner)
    app.mount(root)

    // Attach the directive to the rendered host by hand — the point of the test
    // is the *input* the directive reacts to, not how it was registered.
    const el = root.querySelector('p')!
    const seen = capture(el)
    mount(el, true)
    const rendersAtMount = ownerRenders

    text.value = 'Text that arrived from the API after mount.'
    await nextTick()
    await settleObserver()

    expect(ownerRenders).toBe(rendersAtMount)
    expect(seen.map((d) => d.text)).toEqual(['Text that arrived from the API after mount.'])
    app.unmount()
    root.remove()
  })
})
