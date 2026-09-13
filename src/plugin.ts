/**
 * Plugin install path — `app.use(SelectTextPlugin)` registers the directive
 * under the kebab-case name `select-text`.
 */
import type { App, Plugin } from 'vue'
import { vSelectText } from './directive'

export const DIRECTIVE_NAME = 'select-text' as const

export const SelectTextPlugin: Plugin = {
  install(app: App) {
    app.directive(DIRECTIVE_NAME, vSelectText)
  },
}
