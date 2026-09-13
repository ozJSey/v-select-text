import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { DirectiveBinding } from 'vue'
import {
  useSelectText,
  vSelectText,
  type SelectTextBinding,
  type SelectTextEventDetail,
} from './vSelectText'

/**
 * v2 surface: the `text` kind (ordinary elements selected through the Range
 * API), whitespace resolution, `match`, `trigger: 'click'`, `detail.text` and
 * the `user-select: none` diagnostic.
 *
 * Inputs, textareas, contenteditable shapes, edge detection, the
 * `enabled` / `condition` alias, `normalizeOffset`, plugin wiring and the
 * composable basics are owned by `vSelectText.test.ts` — this file only
 * touches them where the v2 behaviour differs (e.g. `match` against a value,
 * `detail.text` per kind).
 *
 * A note on jsdom that several tests below rely on: jsdom implements `Range`
 * and `Selection` faithfully enough that `window.getSelection().toString()` is
 * a real assertion about what got selected. It does *not* implement layout, so
 * that string is the raw text the Range covers — a browser would collapse the
 * whitespace when painting it. Wherever the point is the whitespace-resolved
 * view, the assertion is on the reported detail instead, and says so.
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

/** Mount with `value` and return the detail of the `select-text` it fired, if any. */
function fire(el: HTMLElement, value: SelectTextBinding): SelectTextEventDetail | null {
  let detail: SelectTextEventDetail | null = null
  el.addEventListener('select-text', (e) => (detail = (e as CustomEvent).detail), { once: true })
  mount(el, value)
  return detail
}

/** Every `select-text` detail the element fires from now on, in order. */
function capture(el: HTMLElement): SelectTextEventDetail[] {
  const seen: SelectTextEventDetail[] = []
  el.addEventListener('select-text', (e) => seen.push((e as CustomEvent).detail))
  return seen
}

/** What the document selection actually holds right now. */
function selected(): string {
  return window.getSelection()?.toString() ?? ''
}

function noSelectableText(descriptor: string): string {
  return `[v-select-text] <${descriptor}> holds no selectable text. Use an <input>, a <textarea>, or any element with text content.`
}

let warn: MockInstance

beforeEach(() => {
  document.body.innerHTML = ''
  window.getSelection()?.removeAllRanges()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

describe("kind 'text': ordinary elements are the default, not an error case", () => {
  for (const tag of ['p', 'span', 'div', 'code', 'blockquote', 'li', 'h2']) {
    it(`<${tag}> selects its text, reports kind 'text' and warns about nothing`, () => {
      const el = host('Hello World', tag)

      const detail = fire(el, true)

      expect(warn).not.toHaveBeenCalled()
      expect(detail?.kind).toBe('text')
      expect(detail?.text).toBe('Hello World')
      expect(selected()).toBe('Hello World')
    })
  }

  it('<td> inside a real table selects its cell text', () => {
    const table = document.createElement('table')
    table.innerHTML = '<tbody><tr><td>cell text</td><td>other cell</td></tr></tbody>'
    document.body.appendChild(table)
    const td = table.querySelector('td')!

    const detail = fire(td, true)

    expect(warn).not.toHaveBeenCalled()
    expect(detail?.kind).toBe('text')
    expect(selected()).toBe('cell text')
  })

  it('the whole-host path reports the same resolved view an explicit range does', () => {
    // A bare binding and `{ start: 0 }` request the identical selection, so
    // they have to report the identical payload — the resolved (rendered)
    // text, not raw textContent.
    const el = host('\n  Hello\n')

    const bare = fire(el, true)

    expect(bare).toEqual({
      start: 0,
      end: 5,
      text: 'Hello',
      direction: 'forward',
      kind: 'text',
    })
    expect(fire(host('\n  Hello\n'), { start: 0 })).toEqual(bare)
  })

  it("whitespace: 'preserve' makes the whole-host path report raw textContent", () => {
    const el = host('\n  Hello\n')

    expect(fire(el, { whitespace: 'preserve' })).toEqual({
      start: 0,
      end: 9,
      text: '\n  Hello\n',
      direction: 'forward',
      kind: 'text',
    })
  })

  it('selects across nested markup as one continuous selection', () => {
    const el = host('The <strong>quick <em>brown</em></strong> fox')

    const detail = fire(el, true)

    expect(detail?.text).toBe('The quick brown fox')
    expect(selected()).toBe('The quick brown fox')
  })

  it('reaches text that lives only in grandchildren', () => {
    const el = host('<span><em>deep text</em></span>')

    const detail = fire(el, { start: 5, end: 9 })

    expect(detail?.text).toBe('text')
    expect(selected()).toBe('text')
  })

  it('an element with no text node at all selects nothing instead of throwing', () => {
    // SEL-4: an empty host is "nothing to select yet", not a selection of the
    // empty string. It stays quiet, keeps the page's selection, and fires when
    // the text arrives — pinned in vSelectText.empty.test.ts.
    const el = host('')

    let detail: SelectTextEventDetail | null = null
    expect(() => {
      detail = fire(el, true)
    }).not.toThrow()

    expect(detail).toBeNull()
    expect(selected()).toBe('')
    expect(warn).not.toHaveBeenCalled()
  })

  it('an element holding only an empty child still resolves to kind text', () => {
    const el = host('<span></span>')

    // Nothing to select while the span is empty — but the host was classified
    // as text, not rejected as unsupported, so filling it in selects it.
    expect(fire(el, true)).toBeNull()
    el.querySelector('span')!.textContent = 'now there is text'
    update(el, true)

    expect(fire(el, true)?.kind).toBe('text')
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('text-less hosts still warn once and no-op', () => {
  const NON_TEXT_TAGS = [
    'img',
    'br',
    'hr',
    'canvas',
    'video',
    'audio',
    'iframe',
    'embed',
    'object',
    'select',
    'progress',
    'meter',
  ]

  for (const tag of NON_TEXT_TAGS) {
    it(`<${tag}> warns with the v2 message, fires no event and does not throw`, () => {
      const el = document.createElement(tag)
      document.body.appendChild(el)
      const seen = capture(el)

      expect(() => mount(el, true)).not.toThrow()

      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(noSelectableText(tag))
      expect(seen).toHaveLength(0)
      expect(selected()).toBe('')
    })
  }

  it('<svg> (created in the SVG namespace) warns and no-ops', () => {
    // Not an HTMLElement, but a template can bind the directive to one all the
    // same, so the classifier has to survive the cast.
    const svg = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    ) as unknown as HTMLElement
    document.body.appendChild(svg)
    const seen = capture(svg)

    expect(() => mount(svg, true)).not.toThrow()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(noSelectableText('svg'))
    expect(seen).toHaveLength(0)
  })

  const NON_SELECTABLE_INPUT_TYPES = [
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
  ]

  for (const type of NON_SELECTABLE_INPUT_TYPES) {
    it(`input[type="${type}"] warns with the v2 message and fires no event`, () => {
      const el = document.createElement('input')
      el.type = type
      // A file input rejects any value but '', so only the others get one —
      // the point is that holding text would not make them selectable either.
      if (type !== 'file') el.value = 'anything'
      document.body.appendChild(el)
      const seen = capture(el)

      expect(() => mount(el, true)).not.toThrow()

      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(noSelectableText(`input[type="${type}"]`))
      expect(seen).toHaveLength(0)
    })
  }
})

describe("whitespace: 'collapse' (the default) reads the text as rendered", () => {
  it('drops the leading and trailing runs so offset 0 lands on the first visible character', () => {
    const el = host('\n      The quick brown fox\n    ')

    const detail = fire(el, { start: 0, end: 3 })

    expect(detail?.text).toBe('The')
    expect(selected()).toBe('The')
  })

  it('counts an internal run of newlines and tabs as exactly one space', () => {
    const el = host('Hello\n\t\n  World')

    // 'Hello World' is 11 characters once the run collapses; asking for 0..11
    // therefore covers the whole rendered text.
    const detail = fire(el, { start: 0, end: 11 })

    expect(detail?.text).toBe('Hello World')
    expect(detail?.end).toBe(11)
  })

  it('offsets land where a reader counting the rendered text would put them', () => {
    const el = host('\n  The quick brown fox\n')

    const detail = fire(el, { start: 4, end: 9 })

    expect(detail?.text).toBe('quick')
    expect(selected()).toBe('quick')
  })

  it('a whitespace run spanning two text nodes still counts as one space', () => {
    // Text nodes: 'a' | ' ' | '\n\t' | 'b' — the run crosses an element
    // boundary, and must still render (and count) as a single space.
    const el = host('a<em> </em><em>\n\t</em>b')

    const detail = fire(el, { match: 'a b' })

    expect(detail).toMatchObject({ start: 0, end: 3, text: 'a b' })
    // jsdom reports the raw characters the Range covers; a browser paints 'a b'.
    expect(selected()).toBe('a \n\tb')
  })

  it('clamps an over-long end to the collapsed length, not the raw length', () => {
    const el = host('a  b')

    const detail = fire(el, { start: 0, end: 99 })

    expect(detail).toMatchObject({ start: 0, end: 3, text: 'a b' })
  })

  it('does not collapse a non-breaking space — it is a rendered character', () => {
    const nbsp = host('a  b')

    const detail = fire(nbsp, { start: 0, end: 99 })

    expect(detail).toMatchObject({ end: 4, text: 'a  b' })
  })

  it('reports start/end in collapsed space, not raw textContent space', () => {
    // Raw 'W' sits at textContent index 12; rendered it sits at index 6.
    const el = host('\n     Hello\n     World\n')

    const detail = fire(el, { start: 6, end: 11 })

    expect(detail).toMatchObject({ start: 6, end: 11, text: 'World' })
    expect(selected()).toBe('World')
  })
})

describe("whitespace: 'preserve' uses raw textContent indices", () => {
  it('offset 0 lands on the first raw character, indentation included', () => {
    const el = host('\n  abc')

    const detail = fire(el, { start: 0, end: 3, whitespace: 'preserve' })

    expect(detail?.text).toBe('\n  ')
    expect(selected()).toBe('\n  ')
  })

  it('reaches the visible text at its raw offset', () => {
    const el = host('\n  abc')

    const detail = fire(el, { start: 3, end: 6, whitespace: 'preserve' })

    expect(detail?.text).toBe('abc')
    expect(selected()).toBe('abc')
  })

  it('the two modes provably disagree on the same markup', () => {
    const collapsed = fire(host('\n  abc'), { start: 0, end: 3 })
    const preserved = fire(host('\n  abc'), { start: 0, end: 3, whitespace: 'preserve' })

    expect(collapsed?.text).toBe('abc')
    expect(preserved?.text).toBe('\n  ')
    expect(collapsed?.text).not.toBe(preserved?.text)
  })

  it('match searches the preserved text, so a doubled space is findable', () => {
    const preserved = fire(host('  x  y'), { match: 'x  y', whitespace: 'preserve' })
    const collapsed = fire(host('  x  y'), { match: 'x  y' })

    expect(preserved).toMatchObject({ start: 2, end: 6, text: 'x  y' })
    // Collapsed, the host renders 'x y' — the doubled-space pattern is absent.
    expect(collapsed).toBeNull()
  })
})

describe('match: select by pattern instead of by offset', () => {
  it('selects the first occurrence of a string by default', () => {
    const el = host('one two one two')

    const detail = fire(el, { match: 'one' })

    expect(detail).toMatchObject({ start: 0, end: 3, text: 'one' })
    expect(selected()).toBe('one')
  })

  it('matches across nested elements', () => {
    const el = host('The <strong>quick brown</strong> fox')

    const detail = fire(el, { match: 'quick brown fox' })

    expect(detail?.text).toBe('quick brown fox')
    expect(selected()).toBe('quick brown fox')
  })

  it('matchIndex picks the nth occurrence', () => {
    const el = host('one two one two')

    const detail = fire(el, { match: 'one', matchIndex: 1 })

    expect(detail).toMatchObject({ start: 8, end: 11, text: 'one' })
    expect(selected()).toBe('one')
  })

  it('a negative matchIndex counts from the end', () => {
    const el = host('a 2026-08-23 b 2027-01-02 c')

    const detail = fire(el, { match: /\d{4}-\d{2}-\d{2}/, matchIndex: -1 })

    expect(detail?.text).toBe('2027-01-02')
    expect(selected()).toBe('2027-01-02')
  })

  it('an out-of-range matchIndex selects nothing and fires no event', () => {
    const el = host('one two one two')

    expect(fire(el, { match: 'one', matchIndex: 5 })).toBeNull()
    expect(selected()).toBe('')
  })

  it('an out-of-range negative matchIndex selects nothing and fires no event', () => {
    const el = host('one two one two')

    expect(fire(el, { match: 'one', matchIndex: -5 })).toBeNull()
    expect(selected()).toBe('')
  })

  it('a match that is not in the text selects nothing and fires no event', () => {
    const el = host('nothing here')

    expect(fire(el, { match: 'zzz' })).toBeNull()
    expect(selected()).toBe('')
  })

  it('an empty-string match selects nothing rather than everything', () => {
    const el = host('some text')

    expect(fire(el, { match: '' })).toBeNull()
    expect(selected()).toBe('')
  })

  it('accepts a RegExp', () => {
    const el = host('order ref 12345 shipped')

    const detail = fire(el, { match: /\d+/ })

    expect(detail?.text).toBe('12345')
    expect(selected()).toBe('12345')
  })

  it('a /g RegExp does not leak lastIndex between two consecutive fires', () => {
    // The same literal is reused across renders in real templates; scanning
    // must not resume from where the previous fire stopped.
    const el = host('a1 b2 c3')
    const shared = /[a-z]\d/g

    const first = fire(el, { match: shared })
    const second = fire(el, { match: shared })

    expect(first).toMatchObject({ start: 0, end: 2, text: 'a1' })
    expect(second).toEqual(first)
  })

  it('a sticky /y RegExp still matches beyond index 0', () => {
    const el = host('abc')

    const detail = fire(el, { match: /b/y })

    expect(detail).toMatchObject({ start: 1, end: 2, text: 'b' })
    expect(selected()).toBe('b')
  })

  it('a zero-length RegExp match terminates and selects nothing', () => {
    const el = host('abc')

    // The scan terminates (that is what this pins — a zero-length match used to
    // be able to loop forever), and the empty hit selects nothing: SEL-4.
    const detail = fire(el, { match: /x*/ })

    expect(detail).toBeNull()
    expect(selected()).toBe('')
  })

  it('a zero-length RegExp match still advances between occurrences', () => {
    // `/b?/` matches empty at offset 0 (there is no `b` on the `a`), then `'b'`
    // at offset 1. Reaching the second occurrence at all is the assertion: a
    // zero-length hit that did not advance `lastIndex` would return offset 0
    // forever. The empty hit itself selects nothing (SEL-4), so the observable
    // proof is the non-empty one that follows it.
    expect(fire(host('abc'), { match: /b?/, matchIndex: 0 })).toBeNull()
    expect(fire(host('abc'), { match: /b?/, matchIndex: 1 })).toMatchObject({
      start: 1,
      end: 2,
      text: 'b',
    })
  })

  it('match takes precedence over start/end', () => {
    const el = host('The quick brown fox')

    const detail = fire(el, { match: 'brown', start: 0, end: 3 })

    expect(detail).toMatchObject({ start: 10, end: 15, text: 'brown' })
    expect(selected()).toBe('brown')
  })

  it("matches an <input>'s value and reports kind 'input'", () => {
    const el = document.createElement('input')
    el.value = 'order-12345'
    document.body.appendChild(el)

    const detail = fire(el, { match: /\d+/ })

    expect(detail).toMatchObject({ start: 6, end: 11, text: '12345', kind: 'input' })
    // The selection really landed on the field, not just in the report.
    expect(el.selectionStart).toBe(6)
    expect(el.selectionEnd).toBe(11)
  })

  it('a match miss on an <input> fires no event and leaves the value untouched', () => {
    const el = document.createElement('input')
    el.value = 'order-12345'
    document.body.appendChild(el)
    const selectSpy = vi.spyOn(el, 'select')

    expect(fire(el, { match: 'zzz' })).toBeNull()
    expect(selectSpy).not.toHaveBeenCalled()
  })
})

describe('direction on the Range path', () => {
  it("'forward' (the default) anchors at the start", () => {
    const el = host('Hello World')

    const detail = fire(el, { start: 0, end: 5 })

    expect(detail?.direction).toBe('forward')
    expect(selected()).toBe('Hello')
    const sel = window.getSelection()!
    expect(sel.anchorOffset).toBeLessThan(sel.focusOffset)
  })

  it("'backward' selects the same text but anchors at the end", () => {
    const el = host('Hello World')

    const detail = fire(el, { start: 0, end: 5, direction: 'backward' })

    expect(detail?.direction).toBe('backward')
    expect(selected()).toBe('Hello')
    // setBaseAndExtent(end, start) — so Shift+Arrow extends from the start.
    const sel = window.getSelection()!
    expect(sel.anchorOffset).toBe(5)
    expect(sel.focusOffset).toBe(0)
  })

  it("'backward' falls back to a forward Range when setBaseAndExtent throws", () => {
    const spy = vi
      .spyOn(Selection.prototype, 'setBaseAndExtent')
      .mockImplementation(() => {
        throw new DOMException('not supported')
      })
    const el = host('Hello World')

    const detail = fire(el, { start: 0, end: 5, direction: 'backward' })

    // A forward selection is still the right selection, just anchored at the
    // other end — losing the anchor must not lose the text.
    expect(selected()).toBe('Hello')
    expect(detail?.direction).toBe('backward')
    const sel = window.getSelection()!
    expect(sel.anchorOffset).toBe(0)
    expect(sel.focusOffset).toBe(5)
    spy.mockRestore()
  })

  it("'none' selects the text and reports 'none'", () => {
    const el = host('Hello World')

    const detail = fire(el, { start: 6, end: 11, direction: 'none' })

    expect(detail).toMatchObject({ text: 'World', direction: 'none' })
    expect(selected()).toBe('World')
  })

  it('direction rides along with a match', () => {
    const el = host('Hello World')

    const detail = fire(el, { match: 'World', direction: 'backward' })

    expect(detail).toMatchObject({ text: 'World', direction: 'backward' })
    const sel = window.getSelection()!
    expect(sel.anchorOffset).toBeGreaterThan(sel.focusOffset)
  })
})

describe("trigger: 'click'", () => {
  it('does not fire on mount', () => {
    const el = host('click me')
    const seen = capture(el)

    mount(el, { trigger: 'click' })

    expect(seen).toHaveLength(0)
    expect(selected()).toBe('')
  })

  it('does not fire on update', () => {
    const el = host('click me')
    const seen = capture(el)

    mount(el, { trigger: 'click' })
    update(el, { trigger: 'click' })

    expect(seen).toHaveLength(0)
  })

  it('fires on click, and on every click after that', () => {
    const el = host('click me')
    const seen = capture(el)

    mount(el, { trigger: 'click' })
    el.click()
    el.click()
    el.click()

    expect(seen).toHaveLength(3)
    expect(seen[0]).toMatchObject({ text: 'click me', kind: 'text' })
    expect(selected()).toBe('click me')
  })

  it('enabled:false detaches the listener', () => {
    const el = host('click me')
    const seen = capture(el)

    mount(el, { trigger: 'click' })
    el.click()
    update(el, { trigger: 'click', enabled: false })
    el.click()
    el.click()

    expect(seen).toHaveLength(1)
  })

  it('flipping enabled back to true re-attaches the listener', () => {
    const el = host('click me')
    const seen = capture(el)

    mount(el, { trigger: 'click', enabled: false })
    el.click()
    expect(seen).toHaveLength(0)

    update(el, { trigger: 'click', enabled: true })
    expect(seen).toHaveLength(0) // re-enabling is not itself a fire

    el.click()
    expect(seen).toHaveLength(1)
  })

  it("switching trigger from 'click' to 'edge' on update removes the listener", () => {
    const el = host('click me')
    const seen = capture(el)

    mount(el, { trigger: 'click' })
    update(el, { trigger: 'edge' })
    expect(seen).toHaveLength(0) // enabled was already true: no edge to fire on

    el.click()
    expect(seen).toHaveLength(0)
  })

  it('unmounted removes the listener', () => {
    const el = host('click me')
    const seen = capture(el)

    mount(el, { trigger: 'click' })
    el.click()
    unmount(el)
    el.click()

    expect(seen).toHaveLength(1)
  })

  it('the handler uses the options from the latest update, not from mount', () => {
    const el = host('a b')
    const seen = capture(el)

    mount(el, { trigger: 'click', match: 'a' })
    update(el, { trigger: 'click', match: 'b' })
    el.click()

    expect(seen).toHaveLength(1)
    expect(seen[0].text).toBe('b')
    expect(selected()).toBe('b')
  })

  it('an update does not stack a second listener on the same element', () => {
    const el = host('click me')
    const seen = capture(el)

    mount(el, { trigger: 'click' })
    update(el, { trigger: 'click' })
    update(el, { trigger: 'click' })
    el.click()

    expect(seen).toHaveLength(1)
  })

  it('two elements each get their own listener', () => {
    const first = host('alpha')
    const second = host('beta')
    const seenFirst = capture(first)
    const seenSecond = capture(second)

    mount(first, { trigger: 'click' })
    mount(second, { trigger: 'click' })

    first.click()
    expect(seenFirst).toHaveLength(1)
    expect(seenSecond).toHaveLength(0)
    expect(selected()).toBe('alpha')

    second.click()
    expect(seenFirst).toHaveLength(1)
    expect(seenSecond).toHaveLength(1)
    expect(selected()).toBe('beta')
  })

  it('a click that matches nothing fires no event', () => {
    const el = host('click me')
    const seen = capture(el)

    mount(el, { trigger: 'click', match: 'zzz' })
    el.click()

    expect(seen).toHaveLength(0)
  })
})

describe('detail.text reports what is now selected, for every kind', () => {
  it('whole-host text element: the raw textContent', () => {
    const el = host('The <strong>whole</strong> thing')

    expect(fire(el, true)?.text).toBe('The whole thing')
  })

  it('ranged text element: the whitespace-resolved slice', () => {
    const el = host('\n  The quick brown fox\n')

    expect(fire(el, { start: 4, end: 15 })?.text).toBe('quick brown')
  })

  it('matched text element: the matched substring', () => {
    const el = host('The quick brown fox')

    expect(fire(el, { match: /b\w+/ })?.text).toBe('brown')
  })

  it('contenteditable: the same Range path reports the same way', () => {
    const el = document.createElement('div')
    el.setAttribute('contenteditable', 'true')
    el.innerHTML = 'Draft <b>note</b> body'
    document.body.appendChild(el)

    const detail = fire(el, { match: 'note body' })

    expect(detail).toMatchObject({ text: 'note body', kind: 'contenteditable' })
    expect(selected()).toBe('note body')
  })

  it('input: the value slice that setSelectionRange received', () => {
    const el = document.createElement('input')
    el.value = 'Hello World'
    document.body.appendChild(el)

    expect(fire(el, { start: 6, end: 11 })).toMatchObject({ text: 'World', kind: 'input' })
  })

  it('textarea: the value slice', () => {
    const el = document.createElement('textarea')
    el.value = 'line one\nline two'
    document.body.appendChild(el)

    expect(fire(el, { start: 9, end: 17 })).toMatchObject({ text: 'line two', kind: 'textarea' })
  })

  it('input select-all: the whole value', () => {
    const el = document.createElement('input')
    el.value = 'Hello World'
    document.body.appendChild(el)

    expect(fire(el, true)).toMatchObject({ start: 0, end: 11, text: 'Hello World' })
  })

  it('select() fallback path: the whole value, because that is what got selected', () => {
    // jsdom rejects setSelectionRange on type="number" exactly as browsers do,
    // so this exercises the real fallback rather than a stub: the reported
    // text is what is actually selected, not what was requested.
    const el = document.createElement('input')
    el.type = 'number'
    el.value = '12345'
    document.body.appendChild(el)

    const detail = fire(el, { start: 0, end: 3 })

    expect(detail).toMatchObject({ start: 0, end: 5, text: '12345', kind: 'input' })
  })
})

describe('`user-select: none` diagnostic', () => {
  function stubUserSelect(value: string): MockInstance {
    return vi
      .spyOn(window, 'getComputedStyle')
      .mockReturnValue({ userSelect: value } as unknown as CSSStyleDeclaration)
  }

  it('warns once per element, even across repeated fires, and still selects', () => {
    const style = stubUserSelect('none')
    const el = host('Hello World')

    const first = fire(el, true)
    const second = fire(el, true)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      '[v-select-text] <p> resolves to `user-select: none`, so the selection is made but never painted. Remove that rule (or set `user-select: text`) to see it.',
    )
    // The Range is real — it is only the painting that is suppressed.
    expect(first?.text).toBe('Hello World')
    expect(second?.text).toBe('Hello World')
    expect(selected()).toBe('Hello World')
    style.mockRestore()
  })

  it('warns separately for a second element', () => {
    const style = stubUserSelect('none')

    fire(host('one'), true)
    fire(host('two'), true)

    expect(warn).toHaveBeenCalledTimes(2)
    style.mockRestore()
  })

  it('does not warn when user-select resolves to anything else', () => {
    for (const value of ['auto', 'text', 'all', '']) {
      const style = stubUserSelect(value)
      fire(host('Hello World'), true)
      expect(warn, `user-select: ${value}`).not.toHaveBeenCalled()
      style.mockRestore()
    }
  })

  it('does not warn for a contenteditable host (a caret is always painted there)', () => {
    const style = stubUserSelect('none')
    const el = document.createElement('div')
    el.setAttribute('contenteditable', 'true')
    el.textContent = 'Hello World'
    document.body.appendChild(el)

    fire(el, true)

    expect(warn).not.toHaveBeenCalled()
    style.mockRestore()
  })
})

describe('useSelectText over a static text host', () => {
  it('select() returns the detail of the whole-host selection', () => {
    const el = host('The quick brown fox')

    const api = useSelectText({ target: el })
    const detail = api.select()

    expect(detail).toMatchObject({ text: 'The quick brown fox', kind: 'text' })
    expect(api.state.value).toBe('selected')
    expect(selected()).toBe('The quick brown fox')
  })

  it('select() honours match and fires the event too', () => {
    const el = host('The quick brown fox')
    const seen = capture(el)

    const api = useSelectText({ target: () => el, options: { match: 'brown' } })
    const detail = api.select()

    expect(detail).toMatchObject({ start: 10, end: 15, text: 'brown' })
    expect(seen).toHaveLength(1)
    expect(seen[0].text).toBe('brown')
    expect(selected()).toBe('brown')
  })

  it('select() returns null on a match miss and leaves state idle', () => {
    const el = host('The quick brown fox')
    const seen = capture(el)

    const api = useSelectText({ target: el, options: { match: 'zzz' } })

    expect(api.select()).toBeNull()
    expect(api.state.value).toBe('idle')
    expect(seen).toHaveLength(0)
    expect(selected()).toBe('')
  })

  it('update() re-points the match without a re-render', () => {
    const el = host('The quick brown fox')

    const api = useSelectText({ target: el, options: { match: 'quick' } })
    expect(api.select()?.text).toBe('quick')

    api.update({ match: 'fox' })
    expect(api.select()?.text).toBe('fox')
    expect(selected()).toBe('fox')
  })

  it('clear() drops the document selection and returns state to idle', () => {
    const el = host('The quick brown fox')

    const api = useSelectText({ target: el })
    api.select()
    expect(selected()).toBe('The quick brown fox')

    api.clear()

    expect(selected()).toBe('')
    expect(api.state.value).toBe('idle')
  })
})

// ─── Regressions from the v2 adversarial review ───────────────────────────────

describe('regression: findOccurrences terminates on unicode-mode regexes', () => {
  // A zero-length match under /u never advances lastIndex by itself, and a
  // one-code-unit bump lands inside a surrogate pair, which the engine snaps
  // back — the scan used to return the same index forever and OOM the tab.
  for (const [label, pattern, text] of [
    ['/\\s*/u over an astral character', /\s*/u, 'Hi \u{1F600} yo'],
    ['/x?/u over a lone emoji', /x?/u, '\u{1F600}'],
    ['/a*/u around an astral character', /a*/u, 'a\u{1F600}b'],
    ['an empty /v pattern', new RegExp('', 'v'), 'a\u{1F600}b'],
  ] as Array<[string, RegExp, string]>) {
    it(`${label} completes instead of hanging`, () => {
      const el = host(text)
      const start = Date.now()
      expect(() => fire(el, { match: pattern })).not.toThrow()
      expect(Date.now() - start).toBeLessThan(2000)
    })
  }

  it('still finds every occurrence a unicode regex should', () => {
    // 'a' 0, emoji 1–2 (a surrogate pair is two code units), 'b' 3, emoji 4–5.
    const el = host('a\u{1F600}b\u{1F600}c')
    expect(fire(el, { match: /\u{1F600}/u, matchIndex: 1 })?.start).toBe(4)
  })
})

describe('regression: the map counts only text the browser paints', () => {
  it('skips a display:none subtree, so v-show="false" cannot steal the offsets', () => {
    const el = host('<span style="display:none">HIDDEN</span>Hello')

    const detail = fire(el, { start: 0, end: 5 })

    expect(detail?.text).toBe('Hello')
    expect(selected()).toBe('Hello')
  })

  for (const tag of ['style', 'script', 'noscript', 'textarea', 'select', 'template']) {
    it(`skips <${tag}> content`, () => {
      const el = host(`<${tag}>SECRET</${tag}>visible`)
      expect(fire(el, true)?.text).toBe('visible')
    })
  }

  it('a match cannot reach into a <style> block', () => {
    const el = host('<style>.token{color:red}</style>visible text')
    expect(fire(el, { match: 'token' })).toBeNull()
  })

  it('puts a separator between block-level children', () => {
    expect(fire(host('<p>alpha</p><p>beta</p>', 'div'), true)?.text).toBe('alpha beta')
    expect(fire(host('<li>a</li><li>b</li>', 'ul'), true)?.text).toBe('a b')
  })

  it('counts a <br> as one space', () => {
    expect(fire(host('alpha<br>beta'), true)?.text).toBe('alpha beta')
  })

  it('keeps inline children glued together', () => {
    expect(fire(host('<strong>Hel</strong><em>lo</em> World'), true)?.text).toBe('Hello World')
  })

  it('honours a nested white-space: pre element inside a collapsing host', () => {
    const el = host('<pre>a   b</pre>')
    expect(fire(el, true)?.text).toBe('a   b')
  })

  it("'preserve' stays raw textContent, hidden nodes included", () => {
    const el = host('<span style="display:none">HID</span>Hello')
    expect(fire(el, { whitespace: 'preserve' })?.text).toBe('HIDHello')
  })
})

describe('regression: a selection that did not happen fires no event', () => {
  it('a detached host reports nothing, because addRange silently aborts', () => {
    const el = host('hello')
    el.remove()
    expect(fire(el, true)).toBeNull()
  })
})

describe('regression: warnings and listeners survive re-renders correctly', () => {
  it('warns once for a text-less host no matter how often it updates', () => {
    const el = document.createElement('img')
    document.body.appendChild(el)

    vSelectText.mounted!(el, makeBinding(true), null as never, null as never)
    for (let i = 0; i < 5; i++) {
      vSelectText.updated!(el, makeBinding(true), null as never, null as never)
    }

    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('drops the click listener when the host stops being selectable', () => {
    const el = document.createElement('input')
    el.type = 'text'
    el.value = 'secret'
    document.body.appendChild(el)
    const seen: SelectTextEventDetail[] = []
    el.addEventListener('select-text', (e) => seen.push((e as CustomEvent).detail))

    const binding = { enabled: true, trigger: 'click' } as const
    vSelectText.mounted!(el, makeBinding(binding), null as never, null as never)
    el.click()
    expect(seen).toHaveLength(1)

    el.type = 'checkbox'
    vSelectText.updated!(el, makeBinding(binding), null as never, null as never)
    el.click()

    expect(seen).toHaveLength(1)
  })
})

describe('regression: matchIndex coercion matches its documentation', () => {
  const text = 'a a a'

  it('truncates a fractional index toward zero', () => {
    expect(fire(host(text), { match: 'a', matchIndex: 1.9 })?.start).toBe(2)
  })

  it('treats NaN and a non-number as 0', () => {
    expect(fire(host(text), { match: 'a', matchIndex: Number.NaN })?.start).toBe(0)
    expect(
      fire(host(text), { match: 'a', matchIndex: 'x' as unknown as number })?.start,
    ).toBe(0)
  })

  it('selects nothing for an out-of-range index in either direction', () => {
    expect(fire(host(text), { match: 'a', matchIndex: Number.POSITIVE_INFINITY })).toBeNull()
    expect(fire(host(text), { match: 'a', matchIndex: Number.NEGATIVE_INFINITY })).toBeNull()
    expect(fire(host(text), { match: 'a', matchIndex: 99 })).toBeNull()
    expect(fire(host(text), { match: 'a', matchIndex: -99 })).toBeNull()
  })
})

describe('regression: match: null is a needle that has not arrived', () => {
  it('selects nothing rather than everything', () => {
    const el = host('The quick brown fox')
    expect(() =>
      fire(el, { match: null as unknown as string }),
    ).not.toThrow()
    expect(fire(host('The quick brown fox'), { match: null as unknown as string })).toBeNull()
  })
})

describe('regression: an input select-all reports the direction it applied', () => {
  it("reports 'forward' because select() takes no direction", () => {
    const el = document.createElement('input')
    el.value = 'hello'
    document.body.appendChild(el)
    let detail: SelectTextEventDetail | null = null
    el.addEventListener('select-text', (e) => (detail = (e as CustomEvent).detail), { once: true })

    vSelectText.mounted!(
      el,
      makeBinding({ direction: 'backward' }),
      null as never,
      null as never,
    )

    expect(detail!.direction).toBe('forward')
  })
})
