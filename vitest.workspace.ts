import { defineWorkspace } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Vitest projects:
 *
 *   - `vue-3.5` / `vue-floor-3.2.0` — `vSelectText.test.ts`,
 *     `vSelectText.text.test.ts`, `vSelectText.empty.test.ts`,
 *     `vSelectText.copy.test.ts` and `playground.smoke.test.ts` run against
 *     both ends of the declared peer range: the default `^3.5.0` and the
 *     aliased `vue_floor`, pinned to the exact floor `vue@3.2.0`. The alias is
 *     pinned, not a caret: `^3.2.0` resolves to 3.5.x on a fresh install, which
 *     would make the low rung a copy of the high one.
 *
 *     What this pair proves: the source RUNS on the floor. `useSelectText`
 *     calls `getCurrentScope()` / `onScopeDispose()`, so the rung reddens on
 *     anything older — measured, not assumed: aliased to 3.1.5 it fails 22 of
 *     its 325 tests (5/84 test, 2/29 empty, 10/67 copy, 5/127 text): 17 on
 *     `TypeError: getCurrentScope is not a function`, 4 on `effectScope` (the
 *     test files import it; 3.2.0 introduced that too), 1 on an assertion that
 *     expected no throw.
 *
 *     What it does NOT prove, and what PEER-1 corrected the range over: that a
 *     consumer can IMPORT the package on a given Vue. Vitest's SSR transform
 *     rewrites named imports to property reads, so an export the linked Vue
 *     lacks arrives as `undefined` instead of throwing at link time. Only
 *     installing the packed tarball against a floor-version Vue tests that, and
 *     no unit run here can stand in for it.
 *
 *   - `ssr-node` — runs `vSelectText.ssr.test.ts` in `environment: 'node'`
 *     (no jsdom, no `window`, no `document`) to prove the library imports
 *     cleanly server-side, the composable handles the no-DOM case without
 *     throwing, and the plugin's `install` requires no DOM.
 */
export default defineWorkspace([
  {
    test: {
      name: 'vue-3.5',
      environment: 'jsdom',
      include: [
        'vSelectText.test.ts',
        'vSelectText.text.test.ts',
        'vSelectText.empty.test.ts',
        'vSelectText.copy.test.ts',
        'playground.smoke.test.ts',
      ],
    },
  },
  {
    resolve: {
      alias: {
        vue: fileURLToPath(new URL('./node_modules/vue_floor/dist/vue.esm-bundler.js', import.meta.url)),
      },
    },
    test: {
      name: 'vue-floor-3.2.0',
      environment: 'jsdom',
      include: [
        'vSelectText.test.ts',
        'vSelectText.text.test.ts',
        'vSelectText.empty.test.ts',
        'vSelectText.copy.test.ts',
        'playground.smoke.test.ts',
      ],
    },
  },
  {
    test: {
      name: 'ssr-node',
      environment: 'node',
      include: ['vSelectText.ssr.test.ts'],
    },
  },
])
