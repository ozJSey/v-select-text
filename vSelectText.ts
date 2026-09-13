/**
 * Build entry point — re-exports the public surface from `src/`.
 *
 * The split keeps each concern in a single-purpose module (types / state /
 * resolve / element-kind / selection / directive / plugin / composable)
 * without changing the bundle: tsup follows this entry and emits the same
 * minified files. See ARCHITECTURE.md for the module map.
 */
export {
  vSelectText,
  default,
  DIRECTIVE_NAME,
  SelectTextPlugin,
  useSelectText,
} from './src'
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
  UseSelectTextParams,
  UseSelectTextReturn,
} from './src'
