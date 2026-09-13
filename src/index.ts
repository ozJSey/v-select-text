/**
 * Public surface. Internal modules (state, resolve, find-range, text-map,
 * element-kind, selection, click-trigger) stay un-exported.
 */
export { vSelectText, default } from './directive'
export { DIRECTIVE_NAME, SelectTextPlugin } from './plugin'
export { useSelectText } from './use-select-text'
export type { UseSelectTextParams, UseSelectTextReturn } from './use-select-text'
export type {
  SelectTextBinding,
  SelectTextCopyDetail,
  SelectTextCopyReason,
  SelectTextCopyState,
  SelectTextEventDetail,
  SelectTextKind,
  SelectTextOptions,
  SelectTextTrigger,
  SelectTextWhitespace,
} from './types'
