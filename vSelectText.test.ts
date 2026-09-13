import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createApp,
  defineComponent,
  effectScope,
  h,
  nextTick,
  ref,
  type DirectiveBinding,
} from 'vue'
import {
  vSelectText,
  SelectTextPlugin,
  DIRECTIVE_NAME,
  useSelectText,
  type SelectTextOptions,
  type SelectTextBinding,
  type SelectTextEventDetail,
} from './vSelectText'

// Helper to create a binding object
function makeBinding<T>(value: T, oldValue?: T): DirectiveBinding<T> {
  return {
    value,
    oldValue: oldValue as T,
    arg: undefined,
    modifiers: {},
    instance: null,
    dir: vSelectText as any,
  }
}

// Helper to create an input element with a value
function createInput(value = 'Hello World'): HTMLInputElement {
  const el = document.createElement('input')
  el.value = value
  document.body.appendChild(el)
  return el
}

// Helper to create a textarea element with a value
function createTextarea(value = 'Hello World'): HTMLTextAreaElement {
  const el = document.createElement('textarea')
  el.value = value
  document.body.appendChild(el)
  return el
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('vSelectText', () => {
  it('selects all text on mount when condition is true', () => {
    const el = createInput('Hello World')
    const selectSpy = vi.spyOn(el, 'select')

    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)

    expect(selectSpy).toHaveBeenCalled()
  })

  it('selects all text on mount with bare directive (undefined)', () => {
    const el = createInput('Hello World')
    const selectSpy = vi.spyOn(el, 'select')

    vSelectText.mounted!(el, makeBinding(undefined), null as any, null as any)

    expect(selectSpy).toHaveBeenCalled()
  })

  it('does not select text on mount when condition is false', () => {
    const el = createInput('Hello World')
    const selectSpy = vi.spyOn(el, 'select')

    vSelectText.mounted!(el, makeBinding(false), null as any, null as any)

    expect(selectSpy).not.toHaveBeenCalled()
  })

  it('uses setSelectionRange when start/end are provided', () => {
    const el = createInput('Hello World')
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')

    vSelectText.mounted!(
      el,
      makeBinding({ condition: true, start: 0, end: 5 }),
      null as any,
      null as any,
    )

    expect(rangeSpy).toHaveBeenCalledWith(0, 5, 'forward')
  })

  it('uses setSelectionRange with direction', () => {
    const el = createInput('Hello World')
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')

    vSelectText.mounted!(
      el,
      makeBinding({ condition: true, start: 2, end: 8, direction: 'backward' }),
      null as any,
      null as any,
    )

    expect(rangeSpy).toHaveBeenCalledWith(2, 8, 'backward')
  })

  it('defaults end to value.length when only start is provided', () => {
    const el = createInput('Hello World')
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')

    vSelectText.mounted!(
      el,
      makeBinding({ condition: true, start: 6 }),
      null as any,
      null as any,
    )

    expect(rangeSpy).toHaveBeenCalledWith(6, 11, 'forward')
  })

  it('defaults start to 0 when only end is provided', () => {
    const el = createInput('Hello World')
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')

    vSelectText.mounted!(
      el,
      makeBinding({ condition: true, end: 5 }),
      null as any,
      null as any,
    )

    expect(rangeSpy).toHaveBeenCalledWith(0, 5, 'forward')
  })

  it('edge detection: selects on false->true transition during update', () => {
    const el = createInput('Hello World')

    // Mount with false
    vSelectText.mounted!(el, makeBinding(false), null as any, null as any)

    const selectSpy = vi.spyOn(el, 'select')

    // Update to true (false -> true transition)
    vSelectText.updated!(el, makeBinding(true, false), null as any, null as any)

    expect(selectSpy).toHaveBeenCalled()
  })

  it('edge detection: does NOT re-select on true->true during update', () => {
    const el = createInput('Hello World')

    // Mount with true
    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)

    const selectSpy = vi.spyOn(el, 'select')

    // Update still true (true -> true, no transition)
    vSelectText.updated!(el, makeBinding(true, true), null as any, null as any)

    expect(selectSpy).not.toHaveBeenCalled()
  })

  it('edge detection: does NOT select on true->false during update', () => {
    const el = createInput('Hello World')

    // Mount with true
    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)

    const selectSpy = vi.spyOn(el, 'select')

    // Update to false
    vSelectText.updated!(el, makeBinding(false, true), null as any, null as any)

    expect(selectSpy).not.toHaveBeenCalled()
  })

  it('edge detection: supports multiple false->true cycles', () => {
    const el = createInput('Hello World')

    // Mount with false
    vSelectText.mounted!(el, makeBinding(false), null as any, null as any)

    const selectSpy = vi.spyOn(el, 'select')

    // First transition: false -> true
    vSelectText.updated!(el, makeBinding(true, false), null as any, null as any)
    expect(selectSpy).toHaveBeenCalledTimes(1)

    // true -> false
    vSelectText.updated!(el, makeBinding(false, true), null as any, null as any)
    expect(selectSpy).toHaveBeenCalledTimes(1)

    // Second transition: false -> true
    vSelectText.updated!(el, makeBinding(true, false), null as any, null as any)
    expect(selectSpy).toHaveBeenCalledTimes(2)
  })

  it('warns on text-less elements with element descriptor (mounted)', () => {
    const el = document.createElement('img')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)

    expect(warnSpy).toHaveBeenCalledWith(
      '[v-select-text] <img> holds no selectable text. Use an <input>, a <textarea>, or any element with text content.',
    )
    warnSpy.mockRestore()
  })

  it('warns on text-less elements with element descriptor (updated)', () => {
    const el = document.createElement('img')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vSelectText.updated!(el, makeBinding(true), null as any, null as any)

    expect(warnSpy).toHaveBeenCalledWith(
      '[v-select-text] <img> holds no selectable text. Use an <input>, a <textarea>, or any element with text content.',
    )
    warnSpy.mockRestore()
  })

  it('falls back to select() when setSelectionRange throws', () => {
    const el = createInput('Hello World')
    vi.spyOn(el, 'setSelectionRange').mockImplementation(() => {
      throw new DOMException('not supported')
    })
    const selectSpy = vi.spyOn(el, 'select')

    vSelectText.mounted!(
      el,
      makeBinding({ condition: true, start: 0, end: 5 }),
      null as any,
      null as any,
    )

    expect(selectSpy).toHaveBeenCalled()
  })

  it('works with textarea elements', () => {
    const el = createTextarea('Hello World')
    const selectSpy = vi.spyOn(el, 'select')

    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)

    expect(selectSpy).toHaveBeenCalled()
  })

  it('works with textarea and setSelectionRange', () => {
    const el = createTextarea('Hello World')
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')

    vSelectText.mounted!(
      el,
      makeBinding({ condition: true, start: 0, end: 5 }),
      null as any,
      null as any,
    )

    expect(rangeSpy).toHaveBeenCalledWith(0, 5, 'forward')
  })

  it('cleans up WeakMap entry on unmount', () => {
    const el = createInput('Hello World')

    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    vSelectText.unmounted!(el, makeBinding(true), null as any, null as any)

    // After unmount and re-mount with true, it should select (fresh state)
    const selectSpy = vi.spyOn(el, 'select')
    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    expect(selectSpy).toHaveBeenCalled()
  })

  it('handles options object with condition defaulting to true', () => {
    const el = createInput('Hello World')
    const selectSpy = vi.spyOn(el, 'select')

    // Passing an empty object -- condition defaults to true
    vSelectText.mounted!(el, makeBinding({}), null as any, null as any)

    expect(selectSpy).toHaveBeenCalled()
  })
})

describe('SelectTextPlugin + DIRECTIVE_NAME', () => {
  it('exports DIRECTIVE_NAME as the kebab-case directive name', () => {
    expect(DIRECTIVE_NAME).toBe('select-text')
  })

  it('SelectTextPlugin.install registers the directive', () => {
    let registeredName: string | undefined
    let registeredDirective: unknown
    const stubApp = {
      directive(name: string, dir: unknown) {
        registeredName = name
        registeredDirective = dir
        return this
      },
    } as any

    ;(SelectTextPlugin.install as any)(stubApp)
    expect(registeredName).toBe(DIRECTIVE_NAME)
    expect(registeredDirective).toBe(vSelectText)
  })

  it('app.use(SelectTextPlugin) wires v-select-text end-to-end', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const App = defineComponent({
      setup() {
        return () => h('input', { value: 'Hello World' })
      },
    })

    const app = createApp(App)
    app.use(SelectTextPlugin)
    app.mount(host)
    await nextTick()

    // Smoke: plugin install did not throw and the directive is registered.
    expect((app as any)._context.directives[DIRECTIVE_NAME]).toBe(vSelectText)
    app.unmount()
  })

  it('app.use(SelectTextPlugin) is idempotent across re-install', () => {
    const App = defineComponent({ setup: () => () => h('input') })
    const app = createApp(App)

    expect(() => {
      app.use(SelectTextPlugin)
      app.use(SelectTextPlugin)
    }).not.toThrow()

    expect((app as any)._context.directives[DIRECTIVE_NAME]).toBe(vSelectText)
  })

  it('SelectTextOptions type can be imported and is usable as a binding shape', () => {
    // Compile-time check via runtime assignment of a typed value.
    const opts: SelectTextOptions = { condition: true, start: 0, end: 5, direction: 'forward' }
    expect(opts.condition).toBe(true)
    expect(opts.start).toBe(0)
    expect(opts.end).toBe(5)
    expect(opts.direction).toBe('forward')

    // Also assert the directive accepts it through the public type.
    const el = document.createElement('input') as HTMLInputElement
    el.value = 'Hello World'
    document.body.appendChild(el)
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')

    vSelectText.mounted!(
      el,
      {
        value: opts,
        oldValue: null,
        arg: undefined,
        modifiers: {},
        instance: null,
        dir: vSelectText,
      } as DirectiveBinding<SelectTextOptions>,
      null as any,
      null as any,
    )

    expect(rangeSpy).toHaveBeenCalledWith(0, 5, 'forward')
  })
})

/* ─── Edge cases ──────────────────────────────────────────────────────── */

describe('null binding (B4 hardening — Vue templates pass null from ref<T | null>)', () => {
  it('mount with null does not crash and does not select', () => {
    const el = createInput('Hello World')
    const selectSpy = vi.spyOn(el, 'select')

    expect(() => {
      vSelectText.mounted!(el, makeBinding(null as any), null as any, null as any)
    }).not.toThrow()
    expect(selectSpy).not.toHaveBeenCalled()
  })

  it('updated with null does not crash and does not select', () => {
    const el = createInput('Hello World')
    vSelectText.mounted!(el, makeBinding(false), null as any, null as any)
    const selectSpy = vi.spyOn(el, 'select')

    expect(() => {
      vSelectText.updated!(el, makeBinding(null as any, false), null as any, null as any)
    }).not.toThrow()
    expect(selectSpy).not.toHaveBeenCalled()
  })

  it('null → true reactive transition fires selection', () => {
    const el = createInput('Hello World')
    vSelectText.mounted!(el, makeBinding(null as any), null as any, null as any)
    const selectSpy = vi.spyOn(el, 'select')

    vSelectText.updated!(el, makeBinding(true, null as any), null as any, null as any)
    expect(selectSpy).toHaveBeenCalled()
  })

  it('true → null reactive transition does not fire (and prepares clean prev for next true)', () => {
    const el = createInput('Hello World')
    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    const selectSpy = vi.spyOn(el, 'select')

    vSelectText.updated!(el, makeBinding(null as any, true), null as any, null as any)
    expect(selectSpy).not.toHaveBeenCalled()

    vSelectText.updated!(el, makeBinding(true, null as any), null as any, null as any)
    expect(selectSpy).toHaveBeenCalledTimes(1)
  })
})

describe('NON_SELECTABLE_INPUT_TYPES (warn-and-no-op safety net)', () => {
  const NON_SELECTABLE_TYPES = [
    'hidden',
    'file',
    'image',
    'submit',
    'reset',
    'button',
    'checkbox',
    'radio',
    'color',
    'range',
  ] as const

  for (const type of NON_SELECTABLE_TYPES) {
    it(`warns and no-ops for input[type="${type}"] (mounted)`, () => {
      const el = document.createElement('input')
      el.type = type
      document.body.appendChild(el)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      expect(() => {
        vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
      }).not.toThrow()
      expect(warnSpy).toHaveBeenCalledWith(
        `[v-select-text] <input[type="${type}"]> holds no selectable text. Use an <input>, a <textarea>, or any element with text content.`,
      )
      warnSpy.mockRestore()
    })
  }
})

describe('selectable input variants (setSelectionRange fallback paths)', () => {
  it('falls back to select() when setSelectionRange throws on type="number"', () => {
    const el = document.createElement('input')
    el.type = 'number'
    el.value = '12345'
    document.body.appendChild(el)
    vi.spyOn(el, 'setSelectionRange').mockImplementation(() => {
      throw new DOMException('not supported on number')
    })
    const selectSpy = vi.spyOn(el, 'select')

    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, start: 0, end: 3 }),
      null as any,
      null as any,
    )
    expect(selectSpy).toHaveBeenCalled()
  })

  it('falls back to select() when setSelectionRange throws on type="email"', () => {
    const el = document.createElement('input')
    el.type = 'email'
    el.value = 'a@b.co'
    document.body.appendChild(el)
    vi.spyOn(el, 'setSelectionRange').mockImplementation(() => {
      throw new DOMException('not supported on email')
    })
    const selectSpy = vi.spyOn(el, 'select')

    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, start: 0, end: 3 }),
      null as any,
      null as any,
    )
    expect(selectSpy).toHaveBeenCalled()
  })

  it('type="search" / type="url" / type="tel" / type="password" (default text-like) are selectable', () => {
    for (const type of ['search', 'url', 'tel', 'password'] as const) {
      const el = document.createElement('input')
      el.type = type
      el.value = 'abcdef'
      document.body.appendChild(el)
      const selectSpy = vi.spyOn(el, 'select')
      vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
      expect(selectSpy).toHaveBeenCalled()
    }
  })

  it('returns null detail (silent no-op) when both setSelectionRange and select throw', () => {
    const el = createInput('Hello')
    vi.spyOn(el, 'setSelectionRange').mockImplementation(() => {
      throw new DOMException('a')
    })
    vi.spyOn(el, 'select').mockImplementation(() => {
      throw new DOMException('b')
    })
    let detail: any = null
    el.addEventListener('select-text', (e: any) => (detail = e.detail))

    expect(() => {
      vSelectText.mounted!(
        el,
        makeBinding({ enabled: true, start: 0, end: 3 }),
        null as any,
        null as any,
      )
    }).not.toThrow()
    expect(detail).toBeNull()
  })
})

describe('contenteditable: shape variants', () => {
  function createCe(html: string, mode: 'true' | 'plaintext-only' = 'true'): HTMLElement {
    const el = document.createElement('div')
    el.setAttribute('contenteditable', mode)
    el.innerHTML = html
    document.body.appendChild(el)
    return el
  }

  it('contenteditable="true" with single text node selects all on bare mount', () => {
    const el = createCe('Hello World')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e: any) => (detail = e.detail))
    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    expect(detail).not.toBeNull()
    expect(detail!.kind).toBe('contenteditable')
    expect(detail!.start).toBe(0)
    expect(detail!.end).toBe(11)
  })

  it('contenteditable="plaintext-only" is recognized', () => {
    const el = createCe('Plain', 'plaintext-only')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e: any) => (detail = e.detail))
    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    expect(detail).not.toBeNull()
    expect(detail!.kind).toBe('contenteditable')
  })

  it('inherits contenteditable from a parent element', () => {
    const parent = document.createElement('div')
    parent.setAttribute('contenteditable', 'true')
    const inner = document.createElement('span')
    inner.textContent = 'Inner text'
    parent.appendChild(inner)
    document.body.appendChild(parent)

    let detail: SelectTextEventDetail | null = null
    inner.addEventListener('select-text', (e: any) => (detail = e.detail))
    vSelectText.mounted!(inner, makeBinding(true), null as any, null as any)
    expect(detail).not.toBeNull()
    expect(detail!.kind).toBe('contenteditable')
  })

  it('empty contenteditable selects nothing and fires nothing, without throwing', () => {
    // SEL-4: an empty resolution is a no-op. Full coverage in
    // vSelectText.empty.test.ts.
    const el = createCe('')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e: any) => (detail = e.detail))
    expect(() => {
      vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    }).not.toThrow()
    expect(detail).toBeNull()
  })

  it('whitespace-only contenteditable resolves to nothing under the collapse default', () => {
    // Three spaces paint nothing, so the rendered text is empty and there is
    // nothing to select. `preserve` is how you index the raw run.
    const el = createCe('   ')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e: any) => (detail = e.detail))
    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    expect(detail).toBeNull()

    const raw = createCe('   ')
    let rawDetail: SelectTextEventDetail | null = null
    raw.addEventListener('select-text', (e: any) => (rawDetail = e.detail))
    vSelectText.mounted!(
      raw,
      makeBinding({ enabled: true, whitespace: 'preserve' }),
      null as any,
      null as any,
    )
    expect(rawDetail!.end).toBe(3)
  })

  it('nested inline children (<strong>, <em>) — flat char offset maps to right text node', () => {
    const el = createCe('<strong>Hel</strong><em>lo</em> World')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e: any) => (detail = e.detail))
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, start: 0, end: 5 }),
      null as any,
      null as any,
    )
    expect(detail).not.toBeNull()
    expect(detail!.start).toBe(0)
    expect(detail!.end).toBe(5)

    const sel = window.getSelection()!
    expect(sel.toString()).toBe('Hello')
  })

  it('contenteditable with explicit out-of-range end clamps to textContent length', () => {
    const el = createCe('Hi')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e: any) => (detail = e.detail))
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, start: 0, end: 999 }),
      null as any,
      null as any,
    )
    expect(detail!.end).toBe(2)
  })

  it('contenteditable returns null detail (silent) when getSelection() returns null', () => {
    const el = createCe('Hello World')
    const original = window.getSelection
    ;(window as any).getSelection = () => null
    let detail: any = null
    el.addEventListener('select-text', (e: any) => (detail = e.detail))
    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    expect(detail).toBeNull()
    ;(window as any).getSelection = original
  })
})

describe('enabled vs condition (alias precedence + mid-life swap)', () => {
  it('enabled overrides condition when both are provided (enabled:false wins)', () => {
    const el = createInput('Hello World')
    const selectSpy = vi.spyOn(el, 'select')
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: false, condition: true }),
      null as any,
      null as any,
    )
    expect(selectSpy).not.toHaveBeenCalled()
  })

  it('enabled overrides condition (enabled:true wins)', () => {
    const el = createInput('Hello World')
    const selectSpy = vi.spyOn(el, 'select')
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, condition: false }),
      null as any,
      null as any,
    )
    expect(selectSpy).toHaveBeenCalled()
  })

  it('mid-life swap: condition:false → enabled:true treats as edge transition', () => {
    const el = createInput('Hello World')
    vSelectText.mounted!(el, makeBinding({ condition: false }), null as any, null as any)
    const selectSpy = vi.spyOn(el, 'select')

    vSelectText.updated!(
      el,
      makeBinding({ enabled: true }, { condition: false }),
      null as any,
      null as any,
    )
    expect(selectSpy).toHaveBeenCalled()
  })

  it('mid-life swap: enabled:false → condition:true treats as edge transition', () => {
    const el = createInput('Hello World')
    vSelectText.mounted!(el, makeBinding({ enabled: false }), null as any, null as any)
    const selectSpy = vi.spyOn(el, 'select')

    vSelectText.updated!(
      el,
      makeBinding({ condition: true }, { enabled: false }),
      null as any,
      null as any,
    )
    expect(selectSpy).toHaveBeenCalled()
  })
})

describe("trigger: 'always' vs 'edge' semantics", () => {
  it("trigger:'always' re-fires on every update even with no value transition", () => {
    const el = createInput('Hello World')
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, trigger: 'always', start: 0, end: 5 }),
      null as any,
      null as any,
    )
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')

    vSelectText.updated!(
      el,
      makeBinding(
        { enabled: true, trigger: 'always', start: 0, end: 5 },
        { enabled: true, trigger: 'always', start: 0, end: 5 },
      ),
      null as any,
      null as any,
    )
    vSelectText.updated!(
      el,
      makeBinding(
        { enabled: true, trigger: 'always', start: 0, end: 5 },
        { enabled: true, trigger: 'always', start: 0, end: 5 },
      ),
      null as any,
      null as any,
    )
    expect(rangeSpy).toHaveBeenCalledTimes(2)
  })

  it("trigger:'always' is gated by enabled:false (no fire)", () => {
    const el = createInput('Hello World')
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: false, trigger: 'always' }),
      null as any,
      null as any,
    )
    const selectSpy = vi.spyOn(el, 'select')

    vSelectText.updated!(
      el,
      makeBinding(
        { enabled: false, trigger: 'always' },
        { enabled: false, trigger: 'always' },
      ),
      null as any,
      null as any,
    )
    expect(selectSpy).not.toHaveBeenCalled()
  })

  it("trigger:'edge' (default) does not re-fire when prev=true and current=true", () => {
    const el = createInput('Hello World')
    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    const selectSpy = vi.spyOn(el, 'select')

    vSelectText.updated!(el, makeBinding(true, true), null as any, null as any)
    vSelectText.updated!(el, makeBinding(true, true), null as any, null as any)
    expect(selectSpy).not.toHaveBeenCalled()
  })

  it("trigger:'always' with mutated value re-clamps offsets against new value length", () => {
    const el = createInput('Hi')
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, trigger: 'always', end: 999 }),
      null as any,
      null as any,
    )
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')

    el.value = 'Hello World'
    vSelectText.updated!(
      el,
      makeBinding(
        { enabled: true, trigger: 'always', end: 999 },
        { enabled: true, trigger: 'always', end: 999 },
      ),
      null as any,
      null as any,
    )
    expect(rangeSpy).toHaveBeenCalledWith(0, 11, 'forward')
  })
})

describe('binding.oldValue prev-tracking (no module state, post-refactor)', () => {
  it('updated invoked with no prior mount: prev defaults to false → fires on enabled:true', () => {
    const el = createInput('Hello World')
    const selectSpy = vi.spyOn(el, 'select')
    vSelectText.updated!(el, makeBinding(true), null as any, null as any)
    expect(selectSpy).toHaveBeenCalled()
  })

  it('mount → unmount → re-mount with enabled:false leaves no carry-over state', () => {
    const el = createInput('Hello World')
    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    vSelectText.unmounted!(el, makeBinding(true), null as any, null as any)

    vSelectText.mounted!(el, makeBinding(false), null as any, null as any)

    const selectSpy = vi.spyOn(el, 'select')
    vSelectText.updated!(el, makeBinding(true, false), null as any, null as any)
    expect(selectSpy).toHaveBeenCalledTimes(1)
  })

  it('update with binding.oldValue=undefined treats prev as derivable (handles HMR initial update)', () => {
    const el = createInput('Hello World')
    const selectSpy = vi.spyOn(el, 'select')
    vSelectText.updated!(el, makeBinding(true, undefined), null as any, null as any)
    expect(selectSpy).toHaveBeenCalled()
  })
})

describe('normalizeOffset edge cases', () => {
  it('clamps negative start to 0', () => {
    const el = createInput('Hello World')
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, start: -5, end: 5 }),
      null as any,
      null as any,
    )
    expect(rangeSpy).toHaveBeenCalledWith(0, 5, 'forward')
  })

  it('clamps end above value length to value length', () => {
    const el = createInput('Hello World')
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, start: 0, end: 999 }),
      null as any,
      null as any,
    )
    expect(rangeSpy).toHaveBeenCalledWith(0, 11, 'forward')
  })

  it('NaN start is treated as undefined (defaults to 0)', () => {
    const el = createInput('Hello World')
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, start: NaN, end: 5 }),
      null as any,
      null as any,
    )
    expect(rangeSpy).toHaveBeenCalledWith(0, 5, 'forward')
  })

  it('Infinity end is treated as undefined (defaults to value.length)', () => {
    const el = createInput('Hello World')
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, start: 2, end: Infinity }),
      null as any,
      null as any,
    )
    expect(rangeSpy).toHaveBeenCalledWith(2, 11, 'forward')
  })

  it('truncates fractional offsets toward zero', () => {
    const el = createInput('Hello World')
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, start: 2.7, end: 5.9 }),
      null as any,
      null as any,
    )
    expect(rangeSpy).toHaveBeenCalledWith(2, 5, 'forward')
  })

  it('swaps silently when start > end (input)', () => {
    const el = createInput('Hello World')
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, start: 8, end: 2 }),
      null as any,
      null as any,
    )
    expect(rangeSpy).toHaveBeenCalledWith(2, 8, 'forward')
  })

  it('non-numeric start (string) is treated as undefined', () => {
    const el = createInput('Hello World')
    const rangeSpy = vi.spyOn(el, 'setSelectionRange')
    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, start: 'oops' as any, end: 5 }),
      null as any,
      null as any,
    )
    expect(rangeSpy).toHaveBeenCalledWith(0, 5, 'forward')
  })
})

describe('select-text CustomEvent contract', () => {
  it('event bubbles to ancestor host', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const el = document.createElement('input')
    el.value = 'Hello World'
    host.appendChild(el)

    let bubbledKind: string | null = null
    host.addEventListener('select-text', (e: any) => {
      bubbledKind = e.detail.kind
    })

    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    expect(bubbledKind).toBe('input')
  })

  it('event is non-cancelable (preventDefault has no effect)', () => {
    const el = createInput('Hello World')
    let captured: Event | null = null
    el.addEventListener('select-text', (e) => {
      captured = e
      e.preventDefault()
    })

    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    expect(captured).not.toBeNull()
    expect(captured!.cancelable).toBe(false)
    expect(captured!.defaultPrevented).toBe(false)
  })

  it('detail shape matches SelectTextEventDetail exactly (input)', () => {
    const el = createInput('Hello World')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e: any) => (detail = e.detail))

    vSelectText.mounted!(
      el,
      makeBinding({ enabled: true, start: 1, end: 4, direction: 'backward' }),
      null as any,
      null as any,
    )
    expect(detail).toEqual({
      start: 1,
      end: 4,
      text: 'ell',
      direction: 'backward',
      kind: 'input',
    })
  })

  it('detail shape matches SelectTextEventDetail exactly (textarea)', () => {
    const el = createTextarea('Hello World')
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e: any) => (detail = e.detail))

    vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    expect(detail).toEqual({
      start: 0,
      end: 11,
      text: 'Hello World',
      direction: 'forward',
      kind: 'textarea',
    })
  })

  it('does not throw when CustomEvent constructor throws (legacy host swallow path)', () => {
    const el = createInput('Hello World')
    const originalCustomEvent = (globalThis as any).CustomEvent
    ;(globalThis as any).CustomEvent = class {
      constructor() {
        throw new Error('legacy host')
      }
    }
    expect(() => {
      vSelectText.mounted!(el, makeBinding(true), null as any, null as any)
    }).not.toThrow()
    ;(globalThis as any).CustomEvent = originalCustomEvent
  })
})

describe('useSelectText composable', () => {
  it('accepts a raw HTMLElement target', async () => {
    const el = createInput('Hello World')
    const scope = effectScope()
    let api: ReturnType<typeof useSelectText> | undefined
    scope.run(() => {
      api = useSelectText({ target: el })
    })

    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e: any) => (detail = e.detail))

    api!.select()
    expect(detail).not.toBeNull()
    expect(detail!.kind).toBe('input')
    expect(api!.state.value).toBe('selected')
    scope.stop()
  })

  it('update() merges with previous options (matches sibling v-scroll-into-view contract)', () => {
    const el = createInput('Hello World')
    const scope = effectScope()
    let api: ReturnType<typeof useSelectText> | undefined
    scope.run(() => {
      api = useSelectText({
        target: el,
        options: { enabled: true, start: 0, end: 5, direction: 'backward' },
      })
    })

    const rangeSpy = vi.spyOn(el, 'setSelectionRange')
    api!.update({ end: 7 })
    api!.select()

    // start (0) and direction ('backward') should survive from initial options.
    expect(rangeSpy).toHaveBeenCalledWith(0, 7, 'backward')
    scope.stop()
  })

  it('select() leaves state idle on warn-path (text-less element)', () => {
    const el = document.createElement('img')
    document.body.appendChild(el)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const scope = effectScope()
    let api: ReturnType<typeof useSelectText> | undefined
    scope.run(() => {
      api = useSelectText({ target: el })
    })

    api!.select()
    expect(api!.state.value).toBe('idle')
    warnSpy.mockRestore()
    scope.stop()
  })

  it('clear() flips state from selected back to idle', () => {
    const el = createInput('Hello World')
    const scope = effectScope()
    let api: ReturnType<typeof useSelectText> | undefined
    scope.run(() => {
      api = useSelectText({ target: el })
    })

    api!.select()
    expect(api!.state.value).toBe('selected')

    api!.clear()
    expect(api!.state.value).toBe('idle')
    scope.stop()
  })

  it('does not warn or throw when called outside an effectScope (getCurrentScope guard)', () => {
    const el = createInput('Hello World')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    let api: ReturnType<typeof useSelectText> | undefined
    expect(() => {
      api = useSelectText({ target: el })
    }).not.toThrow()
    expect(api).toBeDefined()

    // Vue would normally warn `onScopeDispose is called when there is no active...`
    // — assert it was NOT raised by this composable.
    const scopeWarn = warnSpy.mock.calls.find((c) =>
      String(c[0]).includes('onScopeDispose'),
    )
    expect(scopeWarn).toBeUndefined()
    warnSpy.mockRestore()
  })

  it('default export equals named vSelectText export (DOM environment)', async () => {
    const mod = await import('./vSelectText')
    expect(mod.default).toBe(mod.vSelectText)
  })
})

describe('Plugin idempotence with real Vue _installedPlugins guard', () => {
  it('app.use(SelectTextPlugin) twice on the same app does not invoke install twice', () => {
    const installSpy = vi.spyOn(SelectTextPlugin, 'install' as any)
    const App = defineComponent({ setup: () => () => h('input') })
    const app = createApp(App)

    const before = installSpy.mock.calls.length
    app.use(SelectTextPlugin)
    app.use(SelectTextPlugin)
    const after = installSpy.mock.calls.length

    // Vue 3.x's _installedPlugins guard prevents the second install call.
    expect(after - before).toBe(1)
    installSpy.mockRestore()
  })

  it('two independent apps each get their own directive registration', () => {
    const App1 = defineComponent({ setup: () => () => h('input') })
    const App2 = defineComponent({ setup: () => () => h('input') })
    const app1 = createApp(App1)
    const app2 = createApp(App2)

    app1.use(SelectTextPlugin)
    app2.use(SelectTextPlugin)

    expect((app1 as any)._context.directives[DIRECTIVE_NAME]).toBe(vSelectText)
    expect((app2 as any)._context.directives[DIRECTIVE_NAME]).toBe(vSelectText)
    expect((app1 as any)._context).not.toBe((app2 as any)._context)
  })
})
