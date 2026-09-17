# Changelog

## 1.0.1

A one-line `package.json` fix, and the line was a false statement about which Vue versions this
package runs on (PEER-1). The runtime is untouched, and that is checked rather than asserted:
rebuilt from the 1.0.0 source and from this one, `dist/vSelectText.min.js` hashes `dc239f70…` both
times and `dist/vSelectText.min.cjs` hashes `cdf7b3de…` both times. The 660-test suite is unchanged
and green.

### Fixed

- **`peerDependencies.vue` said `^3.0.0`, and no 3.0.x or 3.1.x install of this package has ever
  worked.** It now says `^3.2.0`. This corrects a false claim — it withdraws no platform, because
  the platform it named was never reachable. `src/use-select-text.ts:5` imports `getCurrentScope`
  and `onScopeDispose`; both arrived in **Vue 3.2.0**. Measured against the published Vue packages
  rather than read out of a changelog:

  ```
  vue 3.0.11  getCurrentScope=undefined onScopeDispose=undefined effectScope=undefined
  vue 3.1.5   getCurrentScope=undefined onScopeDispose=undefined effectScope=undefined
  vue 3.2.0   getCurrentScope=function  onScopeDispose=function  effectScope=function
  ```

  What the old range bought a consumer, run against the 1.0.0 tarball npm serves today:

  ```
  $ npm install vue@3.1.5 @ozjsey/v-select-text@1.0.0
  added 15 packages in 1s                          ← npm raises nothing
  $ node -e "import('@ozjsey/v-select-text')"
  SyntaxError: Named export 'getCurrentScope' not found.
  ```

  With `^3.2.0` the same install is refused up front — `npm error ERESOLVE ... peer vue@"^3.2.0"
  from @ozjsey/v-select-text@1.0.1` — instead of failing later at the import. Forced past that
  refusal with `--legacy-peer-deps`, 1.0.1 throws the same `SyntaxError`, which is the negative
  control for the floor: the range is now exactly as wide as the package.

  On the CJS entry the break is quieter and later: `require()` succeeds on 3.1.5 and the first
  `useSelectText()` call throws `TypeError: (0 , g.getCurrentScope) is not a function`.

  Certified on the built tarball, not on the source tree: `vue@3.2.0` + `npm pack` output →
  `import` succeeds, exporting `DIRECTIVE_NAME, SelectTextPlugin, default, useSelectText,
  vSelectText`.

### Changed

- **The Vue test matrix now runs the floor instead of a version above it.** The low rung was
  `vue3_3@^3.3.13` while the API it was supposedly covering for landed in 3.2.0, so it could not
  have caught this — and the caret made it worse, since `^3.3.13` resolves to 3.5.x on a fresh
  install, leaving both rungs on the same Vue. It is now `vue_floor`, pinned to exactly `vue@3.2.0`.
  The rung can fail: pointed at 3.1.5 it reddens 22 of its 325 tests — 5 of 84 in
  `vSelectText.test.ts`, 2 of 29 in `vSelectText.empty.test.ts`, 10 of 67 in
  `vSelectText.copy.test.ts` and 5 of 127 in `vSelectText.text.test.ts`, the cases that reach
  `useSelectText`. 17 die on `TypeError: getCurrentScope is not a function`, 4 on
  `TypeError: effectScope is not a function` (the test files' own import — also a 3.2.0 export),
  and one on an assertion that expected no throw.
- **`vitest.workspace.ts` no longer claims that matrix proves the peer range.** It cannot: Vitest's
  SSR transform rewrites named imports to property reads, so an export the linked Vue lacks arrives
  as `undefined` rather than throwing at link time. Only installing the packed tarball against a
  floor-version Vue tests importability, and the comment now says so.
- `src/use-select-text.ts` records why the floor is 3.2.0, next to the two calls that set it.
- README states the floor in the Install section.

## 1.0.0

First release.

This package previously carried 2.0.0 and 2.1.0 version numbers describing changes
between local development states that were never published. No consumer ever saw a
1.x, so presenting a 2.x implied a breaking migration that does not exist.
Collapsed into one initial release.

### What it does

Selects text inside any element through the Range API, against the text **as
rendered** — hidden and non-rendered subtrees skipped, each element's own
`white-space` respected, block edges and `<br>`s counted as one space. So offsets do
not depend on how the markup reached the DOM.

- `kind: 'text'` by default — any element with text, not just inputs and textareas
- `match` — select by content, `string | RegExp`, with `matchIndex`
- `start` / `end` — explicit offsets into the rendered view, clamped and swappable
- `whitespace` — `collapse` (default) or `preserve`
- `trigger` — `edge` (default, on mount), `always`, or `click`
- `direction` — `forward` or `backward`, honoured on the Range path
- `copy` — write the selection to the clipboard; see the activation note below
- `useSelectText` composable, and a `select-text` event carrying `detail.text`

### Clipboard activation — read this before using `copy`

A clipboard write needs transient user activation, which lasts about **5 seconds**
after a real gesture. A timer does not lose it; the clock does. **`trigger: 'click'`
is the only reliable path** — the default `edge` trigger fires on mount with no
gesture, and the write is refused, in Chrome as well as Firefox and Safari. The
directive reports this rather than failing silently: `select-text-copy` fires with
`ok: false` and a `reason`, and `data-select-text-copy` reads `error`.

### Known at time of release

`trigger: 'always'` combined with `copy` and a handler that writes state was an
unbounded clipboard-write loop; that is fixed, and the fix skips a copy whose text
is unchanged — but only under `always`, and only on the render path. `edge`,
`click` and `useSelectText().copy()` are deliberately untouched, because silently
not copying is worse than the loop it prevents. That boundary has not yet been
independently re-audited.
