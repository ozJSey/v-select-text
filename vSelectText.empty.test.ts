import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { DirectiveBinding } from 'vue'
import {
  useSelectText,
  vSelectText,
  type SelectTextBinding,
  type SelectTextEventDetail,
} from './vSelectText'

/**
 * SEL-4 — an empty resolution is a no-op, not a phantom selection.
 *
 * The bug this file pins: `<p v-select-text>{{ fromApi }}</p>`. At mount the
 * host is empty, so the whole-host path resolved to `[0, 0)`, installed a
 * COLLAPSED range — wiping whatever the user (or another host) had selected —
 * and dispatched `select-text` with `text: ''`. The `'edge'` trigger was then
 * spent, so the text arriving later selected nothing, ever.
 *
 * The rule these tests hold: **a collapsed range is not a selection.** Nothing
 * is selected, nothing is dispatched, the document selection is left exactly as
 * it was, and the edge stays unspent so the selection happens when content
 * arrives.
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

/** Every `select-text` detail the element fires from now on, in order. */
function capture(el: HTMLElement): SelectTextEventDetail[] {
  const seen: SelectTextEventDetail[] = []
  el.addEventListener('select-text', (e) => seen.push((e as CustomEvent).detail))
  return seen
}

function selected(): string {
  return window.getSelection()?.toString() ?? ''
}

/** Put a real, non-collapsed selection on an unrelated element. */
function seedUserSelection(): HTMLElement {
  const other = host('the user already selected this', 'aside')
  const range = document.createRange()
  range.selectNodeContents(other)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
  return other
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

describe('SEL-4: an empty host is a no-op, not a phantom selection', () => {
  it('fires no event when the host holds no text yet', () => {
    const el = host('')
    const fired = capture(el)

    mount(el, true)

    expect(fired).toEqual([])
  })

  it('leaves an existing document selection untouched', () => {
    seedUserSelection()
    const before = selected()
    const el = host('')

    mount(el, true)

    expect(before).toBe('the user already selected this')
    expect(selected()).toBe(before)
  })

  it('does not install a collapsed range of its own', () => {
    const el = host('')

    mount(el, true)

    expect(window.getSelection()?.rangeCount ?? 0).toBe(0)
  })

  it('selects the text when it arrives — the edge is not spent by an empty mount', () => {
    const el = host('')
    const fired = capture(el)

    mount(el, true)
    el.textContent = 'Text that arrived from the API after mount.'
    update(el, true)

    expect(fired).toHaveLength(1)
    expect(fired[0].text).toBe('Text that arrived from the API after mount.')
    expect(selected()).toBe('Text that arrived from the API after mount.')
  })

  it('stays armed across any number of empty updates', () => {
    const el = host('')
    const fired = capture(el)

    mount(el, true)
    update(el, true)
    update(el, true)
    expect(fired).toEqual([])

    el.textContent = 'finally'
    update(el, true)

    expect(fired).toHaveLength(1)
    expect(fired[0].text).toBe('finally')
  })

  it('still fires only once once the text is there', () => {
    const el = host('')
    const fired = capture(el)

    mount(el, true)
    el.textContent = 'arrived'
    update(el, true)
    update(el, true)
    update(el, true)

    expect(fired).toHaveLength(1)
  })

  it('treats a whitespace-only host the same way under the collapse default', () => {
    seedUserSelection()
    const el = host('   \n   ')
    const fired = capture(el)

    mount(el, true)
    expect(fired).toEqual([])
    expect(selected()).toBe('the user already selected this')

    el.textContent = 'now it has words'
    update(el, true)
    expect(fired).toHaveLength(1)
    expect(fired[0].text).toBe('now it has words')
  })

  it("whitespace: 'preserve' still selects a whitespace-only host — those characters are real there", () => {
    const el = host('   ')
    const fired = capture(el)

    mount(el, { enabled: true, whitespace: 'preserve' })

    expect(fired).toHaveLength(1)
    expect(fired[0]).toMatchObject({ start: 0, end: 3, text: '   ' })
  })

  it('does not warn — an empty host is "nothing to select yet", not a misuse', () => {
    const el = host('')

    mount(el, true)

    expect(warn).not.toHaveBeenCalled()
  })

  it("trigger: 'always' also stays quiet until there is text", () => {
    const el = host('')
    const fired = capture(el)

    mount(el, { enabled: true, trigger: 'always' })
    update(el, { enabled: true, trigger: 'always' })
    expect(fired).toEqual([])

    el.textContent = 'here now'
    update(el, { enabled: true, trigger: 'always' })
    expect(fired).toHaveLength(1)
  })

  it('an empty contenteditable behaves identically', () => {
    seedUserSelection()
    const el = host('', 'div')
    el.setAttribute('contenteditable', 'true')
    const fired = capture(el)

    mount(el, true)

    expect(fired).toEqual([])
    expect(selected()).toBe('the user already selected this')
  })
})

describe('SEL-4: an explicitly collapsed range selects nothing and reports nothing', () => {
  it('{ start: 5, end: 5 } fires no event and keeps the existing selection', () => {
    seedUserSelection()
    const el = host('The quick brown fox')
    const fired = capture(el)

    mount(el, { start: 5, end: 5 })

    expect(fired).toEqual([])
    expect(selected()).toBe('the user already selected this')
  })

  it('a zero-length RegExp match fires no event', () => {
    const el = host('abc')
    const fired = capture(el)

    mount(el, { match: /x*/ })

    expect(fired).toEqual([])
    expect(selected()).toBe('')
  })

  it('a range covering exactly a synthetic block separator fires no event', () => {
    // `<li>abc</li><li>def</li>` resolves to "abc def": index 3 is a separator
    // the DOM has no character for, so a Range over it is collapsed. Reporting
    // `text: " "` there described a selection that was never painted.
    const el = host('<li>abc</li><li>def</li>', 'ul')
    const fired = capture(el)

    mount(el, { start: 3, end: 4 })

    expect(fired).toEqual([])
    expect(selected()).toBe('')
  })

  it('a range covering exactly a <br> separator fires no event', () => {
    const el = host('one<br>two')
    const fired = capture(el)

    mount(el, { start: 3, end: 4 })

    expect(fired).toEqual([])
  })

  it('a range that starts on a separator but ends on real text still selects', () => {
    const el = host('<li>abc</li><li>def</li>', 'ul')
    const fired = capture(el)

    mount(el, { start: 3, end: 6 })

    expect(fired).toHaveLength(1)
    expect(fired[0].text).toBe(' de')
  })
})

describe('SEL-4: inputs and textareas follow the same rule', () => {
  it('an empty input fires no event and is not focused by a phantom select()', () => {
    const el = document.createElement('input')
    document.body.appendChild(el)
    const fired = capture(el)
    const select = vi.spyOn(el, 'select')

    mount(el, true)

    expect(fired).toEqual([])
    expect(select).not.toHaveBeenCalled()
  })

  it('an empty input selects its value when one arrives', () => {
    const el = document.createElement('input')
    document.body.appendChild(el)
    const fired = capture(el)

    mount(el, true)
    el.value = 'now populated'
    update(el, true)

    expect(fired).toHaveLength(1)
    expect(fired[0].text).toBe('now populated')
  })

  it('a collapsed input range fires no event and leaves the field selection alone', () => {
    const el = document.createElement('input')
    el.value = 'order-12345'
    document.body.appendChild(el)
    el.setSelectionRange(0, 5)
    const fired = capture(el)

    mount(el, { start: 2, end: 2 })

    expect(fired).toEqual([])
    expect(el.value.slice(el.selectionStart!, el.selectionEnd!)).toBe('order')
  })

  it('an empty textarea fires no event', () => {
    const el = document.createElement('textarea')
    document.body.appendChild(el)
    const fired = capture(el)

    mount(el, true)

    expect(fired).toEqual([])
  })
})

describe('SEL-4: a selection that cannot be installed leaves the page selection alone', () => {
  it('a detached host reports nothing AND does not wipe the current selection', () => {
    seedUserSelection()
    const el = host('hello')
    el.remove()
    const fired = capture(el)

    mount(el, true)

    expect(fired).toEqual([])
    expect(selected()).toBe('the user already selected this')
  })
})

describe('SEL-4: a host that renders nothing warns rather than reporting silently', () => {
  const hiddenWarning = /renders nothing/

  it('warns once when the host itself is display: none, however many cycles run', () => {
    const el = host('Invisible but reported')
    el.style.display = 'none'

    // `trigger: 'always'` so every update really runs a selection cycle — with
    // the default `'edge'` the later updates never reach the diagnostic at all,
    // and "warns once" would pass for the wrong reason.
    mount(el, { enabled: true, trigger: 'always' })
    update(el, { enabled: true, trigger: 'always' })
    update(el, { enabled: true, trigger: 'always' })

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(hiddenWarning)
  })

  it('warns when an ancestor is hidden — the v-show="false" tab panel case', () => {
    const panel = document.createElement('div')
    panel.style.display = 'none'
    document.body.appendChild(panel)
    const el = document.createElement('p')
    el.textContent = 'inside a hidden panel'
    panel.appendChild(el)

    mount(el, true)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(hiddenWarning)
  })

  it('says nothing for a visible host', () => {
    const el = host('perfectly visible')

    mount(el, true)

    expect(warn).not.toHaveBeenCalled()
  })

  it('says nothing for an EMPTY hidden host — there is no selection to describe', () => {
    // The diagnostic ends "The event still reports the text it resolved." On a
    // host that is both hidden and still waiting on its text, no event fires at
    // all, so printing it would describe something that did not happen. This is
    // the `<p v-select-text>{{ fromApi }}</p>` inside a `v-show="false"` tab.
    const panel = document.createElement('div')
    panel.style.display = 'none'
    document.body.appendChild(panel)
    const el = document.createElement('p')
    panel.appendChild(el)

    mount(el, true)

    expect(warn).not.toHaveBeenCalled()
  })

  it('warns as soon as the text arrives in that same hidden host', () => {
    const panel = document.createElement('div')
    panel.style.display = 'none'
    document.body.appendChild(panel)
    const el = document.createElement('p')
    panel.appendChild(el)

    mount(el, true)
    el.textContent = 'the text finally arrived'
    update(el, true)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(hiddenWarning)
  })

  it('says nothing about user-select: none while the host is still empty', () => {
    const el = host('')
    el.style.userSelect = 'none'

    mount(el, true)

    expect(warn).not.toHaveBeenCalled()
  })
})

describe('SEL-4: useSelectText agrees with the directive', () => {
  it('select() on an empty host returns null and leaves state idle', () => {
    seedUserSelection()
    const el = host('')
    const api = useSelectText({ target: el })

    expect(api.select()).toBeNull()
    expect(api.state.value).toBe('idle')
    expect(selected()).toBe('the user already selected this')
  })

  it('select() succeeds once the host has text', () => {
    const el = host('')
    const api = useSelectText({ target: el })

    expect(api.select()).toBeNull()
    el.textContent = 'arrived'

    expect(api.select()?.text).toBe('arrived')
    expect(api.state.value).toBe('selected')
  })
})
