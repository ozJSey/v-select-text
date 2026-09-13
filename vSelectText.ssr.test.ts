/**
 * SSR safety smoke suite.
 *
 * Runs in vitest's `environment: 'node'` (no jsdom, no `window`, no
 * `document`) to prove the library:
 *   - imports cleanly with no top-level DOM access,
 *   - the composable runs inside an `effectScope` without throwing when
 *     the target resolves to `null` server-side,
 *   - the plugin's `install` registers the directive without touching
 *     the DOM,
 *   - the directive object exposes the lifecycle hooks (Vue 3's SSR
 *     renderer never invokes them server-side, but consumers may import
 *     the symbol from a universal module).
 *
 * No jsdom: any accidental top-level `window.foo` would throw at import
 * time and fail every test in this project.
 */

import { describe, it, expect } from 'vitest'
import { effectScope } from 'vue'
import {
  vSelectText,
  SelectTextPlugin,
  DIRECTIVE_NAME,
  useSelectText,
  default as defaultExport,
  type SelectTextOptions,
  type SelectTextBinding,
  type SelectTextEventDetail,
} from './vSelectText'

describe('SSR safety — node environment', () => {
  it('imports cleanly with no DOM globals', () => {
    expect(typeof (globalThis as any).window).toBe('undefined')
    expect(typeof (globalThis as any).document).toBe('undefined')
    expect(vSelectText).toBeDefined()
    expect(useSelectText).toBeDefined()
    expect(SelectTextPlugin).toBeDefined()
    expect(DIRECTIVE_NAME).toBe('select-text')
    expect(defaultExport).toBe(vSelectText)
  })

  it('exposes directive lifecycle hooks without invoking them', () => {
    expect(typeof (vSelectText as any).mounted).toBe('function')
    expect(typeof (vSelectText as any).updated).toBe('function')
    expect(typeof (vSelectText as any).unmounted).toBe('function')
    // No getSSRProps — directive has no SSR markup contribution (it imperatively
    // calls .select() / Range API which are client-only side effects).
    expect((vSelectText as any).getSSRProps).toBeUndefined()
  })

  it('useSelectText does not throw with `target: null`', () => {
    const scope = effectScope()
    let api: ReturnType<typeof useSelectText> | undefined
    expect(() => {
      scope.run(() => {
        api = useSelectText({ target: null })
      })
    }).not.toThrow()

    expect(api).toBeDefined()
    expect(api!.state.value).toBe('idle')

    expect(() => api!.select()).not.toThrow()
    expect(api!.state.value).toBe('idle')

    expect(() => api!.clear()).not.toThrow()
    expect(() => api!.update({ enabled: true, start: 0, end: 3 })).not.toThrow()

    scope.stop()
  })

  it('useSelectText with a getter resolving to null does not throw', () => {
    const scope = effectScope()
    let api: ReturnType<typeof useSelectText> | undefined
    expect(() => {
      scope.run(() => {
        api = useSelectText({ target: () => null })
      })
    }).not.toThrow()
    expect(api!.state.value).toBe('idle')
    api!.select()
    expect(api!.state.value).toBe('idle')
    scope.stop()
  })

  it('useSelectText with a throwing getter does not throw', () => {
    const scope = effectScope()
    let api: ReturnType<typeof useSelectText> | undefined
    expect(() => {
      scope.run(() => {
        api = useSelectText({
          target: () => {
            throw new Error('boom')
          },
        })
      })
    }).not.toThrow()
    expect(() => api!.select()).not.toThrow()
    expect(api!.state.value).toBe('idle')
    scope.stop()
  })

  it('useSelectText disposes cleanly on scope stop', () => {
    const scope = effectScope()
    let api: ReturnType<typeof useSelectText> | undefined
    scope.run(() => {
      api = useSelectText({ target: null, options: { enabled: true } })
    })
    expect(() => scope.stop()).not.toThrow()
    expect(api!.state.value).toBe('idle')
  })

  it('SelectTextPlugin.install registers the directive without DOM access', () => {
    let registeredName: string | undefined
    let registeredDirective: unknown
    const stubApp = {
      directive(name: string, dir: unknown) {
        registeredName = name
        registeredDirective = dir
        return this
      },
    }

    expect(() => (SelectTextPlugin as any).install(stubApp as any)).not.toThrow()
    expect(registeredName).toBe(DIRECTIVE_NAME)
    expect(registeredDirective).toBe(vSelectText)
  })

  it('SelectTextPlugin.install is idempotent across two stub apps', () => {
    const calls: Array<{ name: string; dir: unknown }> = []
    const stubApp = {
      directive(name: string, dir: unknown) {
        calls.push({ name, dir })
        return this
      },
    }
    ;(SelectTextPlugin as any).install(stubApp as any)
    ;(SelectTextPlugin as any).install(stubApp as any)
    expect(calls).toHaveLength(2)
    expect(calls[0].name).toBe(DIRECTIVE_NAME)
    expect(calls[1].name).toBe(DIRECTIVE_NAME)
    expect(calls[0].dir).toBe(vSelectText)
    expect(calls[1].dir).toBe(vSelectText)
  })

  it('public type-shape exports are functions/objects (no top-level evaluation crash)', () => {
    expect(typeof useSelectText).toBe('function')
    expect(typeof SelectTextPlugin).toBe('object')
    expect(typeof (SelectTextPlugin as any).install).toBe('function')
    expect(typeof vSelectText).toBe('object')
  })

  it('public types compile and are usable', () => {
    // Compile-time check via runtime assignment — if these types weren't
    // exported, this file wouldn't even tsc / vitest-transform.
    const opts: SelectTextOptions = {
      enabled: true,
      condition: true,
      start: 0,
      end: 5,
      direction: 'forward',
      trigger: 'edge',
    }
    const binding: SelectTextBinding = opts
    const detail: SelectTextEventDetail = {
      start: 0,
      end: 5,
      text: 'Hello',
      direction: 'forward',
      kind: 'input',
    }
    expect(opts.enabled).toBe(true)
    expect(binding).toBeDefined()
    expect(detail.kind).toBe('input')
  })
})
