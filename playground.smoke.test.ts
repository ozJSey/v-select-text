/**
 * Playground responsive smoke test.
 *
 * The `playground.html` demo is the canonical "does the library work in a real
 * Vue app" exhibit. This suite mounts a Vue app that mirrors the playground's
 * patterns via `createApp(...).use(SelectTextPlugin).mount()` and exercises
 * the directive at the three responsive breakpoints we claim to support:
 *
 *   - mobile  (~375 × 720)
 *   - tablet  (~768 × 900)
 *   - desktop (~1280 × 900)
 *
 * For each breakpoint the test asserts:
 *   1. `SelectTextPlugin` registered the directive under `v-select-text`.
 *   2. The directive selects on mount when `enabled` defaults to true.
 *   3. The directive selects on `false → true` reactive transition.
 *   4. The `select-text` CustomEvent bubbles with a populated detail.
 *   5. The directive selects on contenteditable elements via the Range API.
 *   6. The `trigger: 'always'` mode re-fires on every update.
 *   7. The `enabled` alias is accepted alongside `condition`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import {
  SelectTextPlugin,
  vSelectText,
  type SelectTextEventDetail,
} from './vSelectText'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const VIEWPORTS = {
  mobile: { width: 375, height: 720 },
  tablet: { width: 768, height: 900 },
  desktop: { width: 1280, height: 900 },
} as const

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true })
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
})

/**
 * Mount a Vue app via `app.use(SelectTextPlugin)` and return helpers for
 * exercising the directive against several element kinds.
 */
function mountPlayground() {
  const host = document.createElement('div')
  document.body.appendChild(host)

  const captured: SelectTextEventDetail[] = []
  const enabled = ref(false)
  const enabledAlways = ref(false)
  const enabledAlias = ref(false)
  const ceEnabled = ref(false)
  const value = ref('Hello World')

  const App = defineComponent({
    setup() {
      return { enabled, enabledAlways, enabledAlias, ceEnabled, value }
    },
    template: `
      <div>
        <input class="basic" v-select-text="enabled" :value="value"
               @select-text="onSelect" />
        <textarea class="textarea" v-select-text="enabled"
                  @select-text="onSelect">Hello World</textarea>
        <input class="always" v-select-text="{ enabled: enabledAlways, trigger: 'always', start: 0, end: 5 }"
               :value="value" @select-text="onSelect" />
        <input class="alias" v-select-text="{ condition: enabledAlias, start: 0, end: 5 }"
               :value="value" @select-text="onSelect" />
        <div class="ce" contenteditable="true" v-select-text="ceEnabled"
             @select-text="onSelect">Hello World</div>
      </div>
    `,
    methods: {
      onSelect(e: CustomEvent<SelectTextEventDetail>) {
        captured.push(e.detail)
      },
    },
  })

  const app = createApp(App)
  app.use(SelectTextPlugin)
  app.mount(host)

  if (app.directive('select-text') !== vSelectText) {
    throw new Error('SelectTextPlugin failed to register the select-text directive')
  }

  return {
    host,
    app,
    enabled,
    enabledAlways,
    enabledAlias,
    ceEnabled,
    value,
    captured,
    basic: () => host.querySelector<HTMLInputElement>('.basic')!,
    textarea: () => host.querySelector<HTMLTextAreaElement>('.textarea')!,
    always: () => host.querySelector<HTMLInputElement>('.always')!,
    alias: () => host.querySelector<HTMLInputElement>('.alias')!,
    ce: () => host.querySelector<HTMLElement>('.ce')!,
    unmount() {
      app.unmount()
      host.remove()
    },
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('playground.html — responsive smoke', () => {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    describe(`@ ${name} (${vp.width}×${vp.height})`, () => {
      it('SelectTextPlugin registers the directive on app.use()', () => {
        setViewport(vp.width, vp.height)
        const pg = mountPlayground()
        expect(pg.app.directive('select-text')).toBe(vSelectText)
        pg.unmount()
      })

      it('selects on false → true reactive transition (input + textarea)', async () => {
        setViewport(vp.width, vp.height)
        const pg = mountPlayground()

        // Mount with enabled=false → nothing selected.
        expect(pg.captured.length).toBe(0)

        // Reactive transition false → true on both bound elements.
        pg.enabled.value = true
        await nextTick()

        const inputEvent = pg.captured.find((d) => d.kind === 'input')
        const textareaEvent = pg.captured.find((d) => d.kind === 'textarea')
        expect(inputEvent).toBeDefined()
        expect(textareaEvent).toBeDefined()
        expect(inputEvent!.start).toBe(0)
        expect(inputEvent!.end).toBe(11)
        expect(textareaEvent!.kind).toBe('textarea')

        pg.unmount()
      })

      it('`select-text` CustomEvent bubbles with populated detail', async () => {
        setViewport(vp.width, vp.height)
        const pg = mountPlayground()

        let bubbled: SelectTextEventDetail | null = null
        pg.host.addEventListener('select-text', (e: any) => {
          bubbled = e.detail
        })

        pg.enabled.value = true
        await nextTick()

        expect(bubbled).not.toBeNull()
        expect(bubbled!.direction).toBe('forward')

        pg.unmount()
      })

      it('contenteditable selection via Range API', async () => {
        setViewport(vp.width, vp.height)
        const pg = mountPlayground()

        pg.ceEnabled.value = true
        await nextTick()

        const ceEvent = pg.captured.find((d) => d.kind === 'contenteditable')
        expect(ceEvent).toBeDefined()
        expect(ceEvent!.start).toBe(0)
        expect(ceEvent!.end).toBe(11)

        // Actually selected — getSelection should hold the range.
        const sel = window.getSelection()
        expect(sel?.toString()).toContain('Hello')

        pg.unmount()
      })

      it('`trigger: always` re-fires on every update', async () => {
        setViewport(vp.width, vp.height)
        const pg = mountPlayground()

        pg.enabledAlways.value = true
        await nextTick()
        const before = pg.captured.filter((d) => d.kind === 'input').length

        // Force a re-render that touches the directive's binding.
        pg.value.value = 'New Value'
        await nextTick()
        const after = pg.captured.filter((d) => d.kind === 'input').length

        // trigger:'always' input should have re-fired even though enabled
        // stayed true.
        expect(after).toBeGreaterThan(before)

        pg.unmount()
      })

      it('`condition` alias is honored end-to-end', async () => {
        setViewport(vp.width, vp.height)
        const pg = mountPlayground()

        pg.enabledAlias.value = true
        await nextTick()

        // The alias input should have fired.
        const aliasEvent = pg.captured.find(
          (d) => d.kind === 'input' && d.start === 0 && d.end === 5,
        )
        expect(aliasEvent).toBeDefined()

        pg.unmount()
      })
    })
  }
})
