# v-select-text — TASKS

Package backlog. Cross-package priorities live in the root [`TASKS.md`](../TASKS.md).

## Status

v2.0.0 local, unpublished. 452 tests green across `vue-3.5` / `vue-3.3` / node-SSR.
Playground tab: 12 demos; `smoke`, `smoke:dist`, `interactions` (23/23), `interactions:dist` and
`typecheck` all clean. `dist/` rebuilt 2026-08-23.

## Open

- [ ] **First publish.** The name is free on npm (verified 2026-08-02, re-verify before claiming).
      Acceptance: `npm publish` under the account that owns `v-fit-children`, README rendered
      correctly on the package page, install-and-import smoke from a scratch project.
- [x] **Browser interaction spec** — DONE 2026-08-23. `playground/scripts/interactions/v-select-text.mjs`,
      23 checks across all twelve cards, green on `pnpm interactions` and `pnpm interactions:dist`.
      jsdom has no layout, so "did the selection paint" is only answerable in a browser; each check
      reads `window.getSelection().toString()` back. Two of them pin facts the unit suite cannot
      reach: a `user-select: none` host makes a Range that stringifies to `""`, and Chrome mirrors a
      focused field's own selection into the document selection.
- [ ] **Mobile selection toolbar.** Untested. iOS Safari and Android Chrome show a native
      selection toolbar over a programmatic Range; whether it appears, and whether it appears where
      the user expects, is unknown. Acceptance: a note in the README saying what actually happens.
- [ ] **`trigger` mixes two axes.** `'edge'` and `'always'` describe a point in the reactive
      lifecycle; `'click'` describes a DOM event. One name, two axes — coherent enough to ship
      (the option answers "when does a selection fire"), but if a second DOM trigger is ever wanted
      the split is `trigger` + `on`. Do not churn the API before then.

## Considered and rejected

- **`trigger: 'focus'`.** Select-on-focus for inputs is the single most-requested behaviour, and it
  does not work reliably: mousedown → focus → mouseup, and the mouseup places a caret that clobbers
  whatever focus selected. The robust fix needs `preventDefault` on mousedown plus manual focus
  management, which is more machinery than the rest of the package. `trigger: 'click'` fires after
  caret placement and works, so it ships instead. Half a feature is worse than none.
- **Selecting every `match` at once.** A `Selection` holds one range everywhere except Firefox.
