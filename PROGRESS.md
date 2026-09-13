# v-select-text — PROGRESS

Per-package run log. Newest at top.

---

## 2026-08-23 — Run 2: v2.0.0 — ordinary elements are the point, not the error case

**User report:** "The entire point was making normal textContent work with it, we literally don't
need a directive to select from an input (although we of course need to support it)."

Correct, and the source said the opposite. `getElementKind()` returned `null` for every element
that was not an `<input>`, a `<textarea>` or `contenteditable`, so a `<p>` got a console warning
and a no-op — and playground demo `08-unsupported.vue` documented a plain `<div>` as unsupported
*on purpose*. Selecting an input is `el.select()` and never needed a directive; selecting rendered
text across nested markup does.

**The kind that was missing.** `'text'` is now the default classification for any element. Only two
groups still warn: input types that hold no selectable text, and tags that hold no text node
(`img`, `br`, `svg`, `select`, …).

**Why "make textContent work" was not one line.** `textContent` is not what the reader sees. It
carries the formatting space around the markup, the contents of `<script>` and `<style>`, the text
of a `v-show="false"` subtree, and no gap at all between two `<li>`s. New `src/text-map.ts` walks
the subtree once and records where every *rendered* character came from: hidden and non-rendered
subtrees skipped, each element's own `white-space` honoured (a nested `<pre>` keeps its runs while
its siblings collapse), block edges and `<br>`s counted as one space. Offsets are expressed against
that view; the Range still lands on real nodes. `whitespace: 'preserve'` is the escape hatch — raw
`textContent` indices, verbatim.

**New surface**, because counting characters in prose is the wrong interface:
- `match: string | RegExp | null` (+ `matchIndex`, negative counts from the end) — select the part
  that says X, spanning child elements. `null` is a needle that has not arrived: it selects nothing.
- `trigger: 'click'` — click a token to select it. `user-select: all` with an event, a payload and
  an optional `match`.
- `detail.text` on the `select-text` event; `direction: 'backward'` honoured on the Range path via
  `Selection.setBaseAndExtent`.

**Fixes from the adversarial review** (three reviewers over the finished implementation):
- **P0, would hang the tab.** `{ match: /\s*/u }` over any astral character looped forever:
  a zero-length match does not advance `lastIndex`, and a one-code-unit bump lands inside a
  surrogate pair, which the engine snaps back to the start of the code point. Now steps over the
  whole code point, and a non-negative `matchIndex` stops the scan as soon as it has enough hits.
- The whole-host path reported raw `textContent` while `{ start: 0 }` — the identical request —
  reported the resolved view. Every path goes through the map now; `selectNodeContents` is gone.
  Verified in Chrome: `detail.text.length` 171 = `getSelection().toString().length` 171, against a
  raw `textContent` of 173.
- `updated` returned before re-syncing the click listener when a host stopped being selectable
  (`<input :type>` flipping to `checkbox`), so every later click fired an event claiming a
  selection that could not happen.
- `addRange` aborts silently for a host detached behind Vue's back; the directive reported success
  anyway. Now checks `rangeCount`.
- `useSelectText().state` never returned to `'idle'` after a cycle that selected nothing, and
  `clear()` was a no-op on an `<input>` (the document selection does not cover a field's own).
- `warnUnsupported` fired once per re-render; `matchIndex` coerced `Infinity` to occurrence 0;
  `el.select()` reported a `direction` it cannot apply.
- Deleted `src/testing.ts` — an empty exported function with no caller, justified in its own
  comment by "API parity with sibling packages" that grep shows does not exist.

**Verification:**
- 452 tests green (was 206) across `vue-3.5`, `vue-3.3` and the node SSR project
- `tsconfig.test.json` + `npm run typecheck` added — nothing typechecked the test files, which is
  how the SSR suite shipped a `SelectTextEventDetail` missing its new `text` field while claiming
  in its own docblock that "public types compile"
- Playground: 8 → 12 demos, `pnpm smoke`, `pnpm smoke:dist`, `pnpm typecheck` all clean
- Real browser, permanently: `playground/scripts/interactions/v-select-text.mjs` — **23 checks over
  all twelve cards, green on source and dist**. Mount selection paints; `match` crosses a
  `<strong>`; collapse vs preserve provably disagree at the same offsets; a click selects exactly
  the token; `match` narrows a click to `v-select-text`; `enabled: false` detaches the listener
  rather than ignoring the click; `detail.text` (171) equals the live selection (171) against a raw
  `textContent` of 173
- `dist/` rebuilt at 2.0.0 — ESM 7.2 KB, CJS 7.7 KB, `.d.ts` 8.8 KB; tarball 9 files, 45.7 kB

**What's next:**
- First publish (the name is unclaimed on npm)
- Mobile selection toolbar — untested on iOS Safari / Android Chrome
- `trigger` mixes two axes ('edge'/'always' are reactive, 'click' is a DOM event). Coherent enough
  to ship, worth revisiting if a third DOM trigger ever appears

---

## 2026-05-16 — Run 1: publishable-shape pass (plugin + dual-format build + types)

**Picked task:** Root `TASKS.md` P1 — publishable-shape pass.

**What changed:**
- `vSelectText.ts` now exports `DIRECTIVE_NAME = 'select-text' as const` and `SelectTextPlugin: Plugin`. Mirrors v-teleport-to / v-trap-focus pattern.
- `package.json` rewritten to dual-format build via tsup (`--format esm,cjs`). New `exports` with `import.types` + `import.default` + `require.types` + `require.default`. Added `"sideEffects": false`. `main` → CJS, `module` → ESM.
- `vSelectText.test.ts` gained 5 tests under `SelectTextPlugin + DIRECTIVE_NAME` — total 23 / 23 passing.
- `README.md` rewritten with `app.use(SelectTextPlugin)` as the recommended install path + typed `SelectTextOptions` recipe + Exports table.

**Bundle sizes (post-build):**
- ESM: `dist/vSelectText.min.js` 1.1 KB
- CJS: `dist/vSelectText.min.cjs` 1.7 KB
- Types: `dist/vSelectText.d.ts` 513 B + `dist/vSelectText.min.d.cts` 513 B
- Tarball: 9 files, 5.6 kB packed, 20.4 kB unpacked

**Verification:**
- `npx vitest run` → 23 / 23 green
- ESM + CJS exports both expose `['DIRECTIVE_NAME', 'SelectTextPlugin', 'default', 'vSelectText']`
- `.d.ts` exposes `DIRECTIVE_NAME`, `SelectTextPlugin`, `SelectTextOptions`, `vSelectText`, `default`

**What's next:**
- Contenteditable support (Range API) — flagged as optional follow-up
- Copy-on-select integration recipe
- Mobile selection toolbar verification
- First publish prep
