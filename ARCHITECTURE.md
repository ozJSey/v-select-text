# Architecture

`vSelectText.ts` is the build entry; it re-exports `src/index.ts`. Each module has one purpose;
dependencies point strictly downward — no cycles.

```
vSelectText.ts             entry — re-exports src/index
└── src/
    ├── index.ts           public surface: directive, plugin, composable, types
    ├── directive.ts       lifecycle wiring: classify → resolve → edge-detect → select
    ├── click-trigger.ts   trigger:'click' — the only addEventListener, + its keyboard affordance
    ├── plugin.ts          SelectTextPlugin + DIRECTIVE_NAME
    ├── use-select-text.ts useSelectText — imperative select()/copy()/clear()/update()
    ├── selection.ts       the two strategies: setSelectionRange and Range API, + event
    ├── copy.ts            the only clipboard write in the package, + its event and attribute
    ├── text-map.ts        DOM subtree → flat text + per-character (node, offset) anchors
    ├── find-range.ts      "which characters does this binding ask for", over a plain string
    ├── element-kind.ts    which strategy an element gets; the two warnings
    ├── resolve.ts         binding normalization + offset clamping
    ├── state.ts           every per-element WeakMap/WeakSet the package keeps
    └── types.ts           public types + the internal ResolvedBinding
```

## The invariants the split protects

- **`selection.ts` is the only place a selection happens**, and `selectAndReport` is its only
  export that selects — so a selection can never fire without its `select-text` event. The two
  halves (`performSelection`, `dispatchSelectTextEvent`) are module-private precisely so no future
  module can take one without the other.
- **Every Range goes through the text map**, including "select the whole host". Reaching for
  `selectNodeContents` instead would be shorter, but then a bare `v-select-text` and an explicit
  `{ start: 0 }` — the same request — would report two different payloads: raw `textContent` from
  one, the resolved view from the other.
- **`text-map.ts` is the only place that walks text nodes.** Offsets are expressed against the
  text *as rendered* — `display: none` and non-rendered subtrees skipped, a `visibility: hidden`
  element's **own** text skipped while the walk keeps descending, each element's own `white-space`
  respected, block edges and `<br>`s counted as one space — and mapped back to `(textNode, offset)`
  pairs there and nowhere else. "Hidden" is read per element from the computed value, never carried
  down as a flag: `visibility` is inherited *and* overridable, so a `visible` descendant of a hidden
  element is painted, and dropping it shifted every offset after it (fixed in 1.0.2). This is what makes an ordinary `<p>` work: `textContent` is not
  what the user sees, and the walk is what reconciles the two.
- **`find-range.ts` never touches the DOM.** It answers `start`/`end`/`match` over a plain string,
  which is why the input path (`el.value`) and the Range path (flat subtree text) share one
  implementation of clamping, swapping and occurrence-finding.
- **`copy.ts` is the only place a clipboard write happens, and the write is always initiated in
  the same synchronous turn as the selection it copies.** `writeText` needs transient user
  activation. Chrome's activation window is about five seconds (measured), so a `setTimeout` or a
  `rAF` often gets away with it — but the window is UA-defined and a consumer's `select-text`
  handler is free to `await` a network round trip inside it. The only duration the package can
  rely on is *this turn*, so that is the one it takes. `selection.ts` therefore calls
  `startCopy` *before* it dispatches `select-text`, so a consumer's handler cannot spend the
  activation first, and `useSelectText.copy()` starts the write before its first `await`.
  What is written is always `detail.text`, never `getSelection().toString()` — otherwise the package
  would report one string while the clipboard received another. SEL-2.
- **A write nobody asked for never repeats itself.** `selectAndReport` carries an `origin`
  (`'render'` from the directive's lifecycle hooks, `'request'` from a click, a key or a
  `useSelectText` call). `copy.ts` is the only module that reads it, and only to refuse one case:
  `trigger: 'always'` re-offering the text this host last attempted. That pairing plus a
  `select-text-copy` handler that writes state was an unbounded loop — the write settles in a
  promise, so Vue's recursive-update guard, which only sees synchronous re-entry, never fired
  (~8,600 real clipboard writes a second, measured). The narrowness is the design: `'edge'` needs an
  explicit `false → true` re-arm and `'click'` needs a gesture, both of which are acts, so both
  still copy identical text on demand. Same reasoning behind `setCopyState`, which skips a
  `setAttribute` of the value already there: an identical write still queues a `MutationRecord`, and
  that is the mechanism that hung the tab in `v-dropzone`. SEL-5.
- **`click-trigger.ts` owns every listener.** Nothing else in the package calls
  `addEventListener`, so "can this leak" has one file's worth of answer. It also owns the
  `tabindex` / `role` / Enter / Space affordance that makes `trigger: 'click'` keyboard-operable,
  because that affordance has exactly the same lifetime as the click listener — install and
  teardown are one list of undo functions, so the host cannot be left carrying an injected
  attribute.
- **A collapsed Range is not a selection.** `selection.ts` checks `range.collapsed` *before* it
  touches `window.getSelection()`, and the input path refuses a `start === end` request the same
  way. The ordering is the invariant, not the check: `applyRange` opens with `removeAllRanges()`, so
  a host that resolved to nothing — `{{ fromApi }}` before the fetch lands — would otherwise wipe
  whatever the user had selected and install a caret in its place. Same reason `el.isConnected` is
  tested first: `addRange` aborts silently on a detached host, after the damage. The two
  "this will not be painted" diagnostics sit on the same side of that line — they run *after* the
  collapsed check, because a warning about an unpaintable selection is noise when there is no
  selection. SEL-4.
- **`state.ts` owns every per-element map.** "What do we remember about an element" has exactly
  one place to look: the edge-spent flag, the click teardown, and the warned-once sets.
  `edgeSpentMap` deliberately does not record "the previous `enabled` value" — it records
  "`enabled`, *and* a selection landed", which is what lets a host that mounted empty select its
  text on the render that brings the text in.

Both the directive and the composable are thin: classify (`element-kind`) → normalize (`resolve`)
→ select (`selection`). Only the directive touches the edge-detection map — the composable is
imperative and needs none.

Copy-paste consumers: every file under `src/` plus the entry is self-contained TypeScript with no
dependencies beyond the `vue` peer — take the folder as-is.
