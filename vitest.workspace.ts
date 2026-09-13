import { defineWorkspace } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Vitest projects:
 *
 *   - `vue-3.5` / `vue-3.3` — `vSelectText.test.ts`, `vSelectText.text.test.ts`
 *     and `playground.smoke.test.ts` run against two Vue minor versions to prove
 *     the directive's public API surface is portable across the supported
 *     peer-dependency range (`vue: ^3.0.0`). Both run in jsdom.
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
        vue: fileURLToPath(new URL('./node_modules/vue3_3/dist/vue.esm-bundler.js', import.meta.url)),
      },
    },
    test: {
      name: 'vue-3.3',
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
