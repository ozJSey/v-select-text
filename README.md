# @ozjsey/v-select-text

See in action: [npm portfolio playground](https://ozjsey.github.io/npm-portfolio-playground/#v-select-text).

## Playground

Try the live examples in the [npm portfolio playground](https://github.com/ozJSey/npm-portfolio-playground).

## Select the rendered text of any element — whole, by range, or by pattern

Selecting an `<input>` is one line of vanilla JS (`el.select()`) and needs no directive. Selecting the *rendered text* of a `<p>`, a `<blockquote>`, a `<td>` or a `<code>` block — across nested markup, at offsets that survive template indentation, or by a pattern you only know at runtime — is the thing that actually needs one.

`v-select-text` does that with the Range API, and supports inputs, textareas and contenteditable hosts on the same options bag.

## Features

- Works on **any element that holds text** — `<p>`, `<blockquote>`, `<code>`, `<td>`, `<span>`, nested markup included
- **`match`** — select the first (or *n*th, or last) occurrence of a string or `RegExp`, even when it spans child elements
- **Offsets against the text as rendered** — whitespace is collapsed by default, so `start: 0` lands on the first visible character, not on your template's indentation
- **`trigger`** — fire on a reactive `false → true` edge, on every update, or on click
- `<input>` / `<textarea>` via `setSelectionRange`, with a `.select()` fallback for types that reject it
- Fires a bubbling **`select-text`** CustomEvent carrying `start`, `end`, `text`, `direction` and `kind`
- **`copy: true`** — put exactly the selected text on the clipboard, with every refusal reported instead of swallowed
- **`useSelectText`** composable for imperative use outside templates
- Four diagnostics that catch the usual false bug reports: a text-less host, a `user-select: none` host, a host that renders nothing, and `copy` on a trigger with no user gesture
- Written in TypeScript — dual ESM + CJS build, full declarations, zero runtime dependencies

## Install

```bash
npm install @ozjsey/v-select-text
```

Vue 3 is a peer dependency — it won't be bundled.

## Usage

### Register globally via plugin (recommended)

```ts
import { createApp } from 'vue'
import { SelectTextPlugin } from '@ozjsey/v-select-text'
import App from './App.vue'

createApp(App).use(SelectTextPlugin).mount('#app')
```

This registers the directive under the kebab-case name `select-text`, so templates use it as `v-select-text="..."`.

### Register globally (manual)

```ts
import { createApp } from 'vue'
import { vSelectText } from '@ozjsey/v-select-text'
import App from './App.vue'

createApp(App).directive('select-text', vSelectText).mount('#app')
```

### Register locally

```vue
<script setup lang="ts">
import { vSelectText } from '@ozjsey/v-select-text'
</script>

<template>
  <blockquote v-select-text>
    The quick brown fox jumps over the lazy dog.
  </blockquote>
</template>
```

Vue auto-registers the variable as `v-select-text` because the name starts with `v`.

### Basic — select a paragraph on mount

```vue
<blockquote v-select-text>
  The quick brown fox jumps over the lazy dog.
</blockquote>
```

The whole subtree is selected, and — unlike an input's highlight — the selection stays painted whether or not anything is focused.

### Select a pattern, across nested markup

```vue
<script setup lang="ts">
import { ref } from 'vue'

const isQuoting = ref(false)
</script>

<template>
  <p v-select-text="{ enabled: isQuoting, match: 'quick brown' }">
    The quick <strong>brown fox</strong> jumps over the lazy dog.
  </p>
  <button @click="isQuoting = !isQuoting">Quote it</button>
</template>
```

`"quick brown"` straddles the boundary between a text node and the `<strong>`; the match is found against the flattened subtree text, so the Range crosses the boundary with it. If the pattern is not in the text, nothing is selected and no event fires.

### A `RegExp`, and which occurrence

```vue
<script setup lang="ts">
import { ref } from 'vue'

const DATE = /\d{4}-\d{2}-\d{2}/
const enabled = ref(true)
</script>

<template>
  <p v-select-text="{ enabled, match: DATE, matchIndex: -1 }">
    Opened <em>2026-07-14</em>, due <em>2026-08-23</em>.
  </p>
</template>
```

`matchIndex: -1` selects the last occurrence (`2026-08-23`). Your `RegExp` is never mutated — the `g` / `y` flags are re-derived internally, so a shared literal can't leak `lastIndex` between renders.

### Click to select

```vue
<code v-select-text="{ trigger: 'click' }">npm install @ozjsey/v-select-text</code>
```

`trigger: 'click'` never fires on mount or update — only on a click of the host. Unlike
`user-select: all`, it gives you the `select-text` event, can be narrowed with `match`, and is
keyboard-operable: the directive adds `tabindex="0"`, `role="button"` and <kbd>Enter</kbd> /
<kbd>Space</kbd> while it is active, unless the host is already an interactive control.

### Click to copy

```vue
<code v-select-text="{ trigger: 'click', copy: true }">sk-live-9f3b2c7d41ae4e08b6c5</code>
```

Selected *and* on the clipboard, with exactly the text the `select-text` event reports. `copy` wants
`trigger: 'click'` — a clipboard write needs a user gesture, and the default trigger fires on mount
where there is none. See [Copying the selection](#copying-the-selection).

### Range selection — typed options

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { SelectTextOptions } from '@ozjsey/v-select-text'

const isEditing = ref(false)
const options = ref<SelectTextOptions>({
  start: 0,
  end: 5,
  direction: 'forward',
})
</script>

<template>
  <p v-select-text="{ ...options, enabled: isEditing }">
    Hello world
  </p>
</template>
```

Selects characters 0 through 5 (`"Hello"`) each time `isEditing` goes from `false` to `true`. Offsets are counted against the text **as rendered** — see [Whitespace and offsets](#whitespace-and-offsets).

### Inputs and textareas

Supported, and on the same options bag — but reach for the directive here only when the *reactivity* is what you want, since a one-off is just `el.select()`.

```vue
<script setup lang="ts">
import { ref } from 'vue'

const isEditing = ref(false)
const text = ref('Hello World')
</script>

<template>
  <input v-select-text="isEditing" :value="text" />
  <textarea v-select-text="{ enabled: isEditing, match: 'World' }" :value="text" />
</template>
```

For inputs and textareas the text searched by `match` and indexed by `start` / `end` is `el.value`, and `whitespace` is ignored — a value is already exact. Note that an input's highlight greys out as soon as the field loses focus; a selection over static text does not.

### contenteditable

```vue
<div contenteditable v-select-text="{ enabled, match: 'draft', direction: 'backward' }">
  Rename this draft before sharing.
</div>
```

contenteditable hosts take the Range path, so everything in the text sections applies — including `whitespace` and matches that span nested elements. The check walks the `contenteditable` inheritance chain, so a child of an editable host is treated as editable too.

## API

The directive accepts `boolean | SelectTextOptions | undefined`:

```ts
import type { SelectTextOptions } from '@ozjsey/v-select-text'

type SelectTextOptions = {
  enabled?: boolean                              // default: true
  condition?: boolean                            // deprecated alias for `enabled`
  match?: string | RegExp                        // default: undefined
  matchIndex?: number                            // default: 0
  start?: number                                 // default: 0 (when `end` is provided)
  end?: number                                   // default: text length (when `start` is provided)
  direction?: 'forward' | 'backward' | 'none'    // default: 'forward'
  whitespace?: 'collapse' | 'preserve'           // default: 'collapse'
  trigger?: 'edge' | 'always' | 'click'          // default: 'edge'
  copy?: boolean                                 // default: false — needs trigger: 'click'
}
```

### Binding forms

| Binding | Behavior |
|---------|----------|
| `v-select-text` | Select all on mount |
| `v-select-text="true"` | Select all on mount |
| `v-select-text="false"` | No selection (`null` behaves the same) |
| `v-select-text="someRef"` | Boolean ref — select all on each `false → true` transition |
| `v-select-text="{ enabled, match, start, end, ... }"` | Typed options, below |

Any other primitive (a number, a string) is treated as `false` rather than crashing.

### Options

| Option | Type | Default | Behavior |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Master switch. With the default `trigger: 'edge'`, selection fires on each `false → true` transition — and a transition only counts once a selection actually lands, so a host that is still empty stays armed. `false` also removes the `trigger: 'click'` listener. |
| `condition` | `boolean` | `true` | **Deprecated** alias for `enabled`, kept for back-compat with 1.x. If both are given, `enabled` wins. |
| `match` | `string \| RegExp \| null` | — | Select an occurrence of this string or pattern instead of a numeric range. **Takes precedence over `start` / `end`.** Searched against `el.value` for inputs, against the resolved subtree text otherwise — so a match may span nested elements, and can never reach into text the user cannot see. No match → no selection and **no event**. An empty string matches nothing, and so does `null` — the value `ref<string \| null>(null)` hands a template before the needle exists. Omitting `match` entirely is what selects the whole host. |
| `matchIndex` | `number` | `0` | Which occurrence of `match`, 0-based, counting non-overlapping hits in document order. Negative counts from the end (`-1` is the last). Out of range → no selection, `±Infinity` included. Fractional values truncate toward zero; `NaN` and non-numbers fall back to `0`. |
| `start` | `number` | `0` when only `end` is given | Selection start, in UTF-16 code units. Clamped to `[0, length]`, truncated to an integer; `NaN` / `Infinity` are treated as unset. Ignored when `match` is set. |
| `end` | `number` | text length when only `start` is given | Selection end, same clamping. If `start > end` the two are swapped silently. If they resolve to the *same* offset the request is a caret, not a selection: nothing is selected and no event fires — see [The empty host](#the-empty-host). |
| `direction` | `'forward' \| 'backward' \| 'none'` | `'forward'` | Which end the caret sits at, so Shift+Arrow extends from the other one. Forwarded as the third argument of `setSelectionRange` for inputs; applied via `Selection.setBaseAndExtent` for text / contenteditable hosts. Ignored on the input `select()` path (whole-value selection, or the `setSelectionRange` fallback), which always anchors forward — and the event says so. |
| `whitespace` | `'collapse' \| 'preserve'` | `'collapse'` | How `start` / `end` / `match` read a text or contenteditable host. See [Whitespace and offsets](#whitespace-and-offsets). Ignored for `<input>` / `<textarea>`. |
| `trigger` | `'edge' \| 'always' \| 'click'` | `'edge'` | When a selection fires. See [Triggers and edge detection](#triggers-and-edge-detection). |
| `copy` | `boolean` | `false` | Also write the selected text to the clipboard. Writes exactly `detail.text`. **Wants `trigger: 'click'`** — a clipboard write needs a user gesture. See [Copying the selection](#copying-the-selection). |

Omitting both `match` and `start` / `end` selects the whole host — or nothing at all, quietly, while the host is still empty.

### Exports

| Export | Description |
|--------|-------------|
| `vSelectText` | The directive object (also the default export) — pass to `app.directive('select-text', vSelectText)` |
| `SelectTextPlugin` | Vue plugin — `app.use(SelectTextPlugin)` registers the directive |
| `DIRECTIVE_NAME` | The kebab-case name used by the plugin — `'select-text'` |
| `useSelectText` | Composable form — imperative `select()` / `copy()` / `clear()` / `update()`, plus `state` and `copyState` |
| `SelectTextOptions` | Type — the options object form of the binding |
| `SelectTextBinding` | Type — the full union the directive accepts: `boolean \| SelectTextOptions \| undefined` |
| `SelectTextEventDetail` | Type — `detail` of the `select-text` event |
| `SelectTextCopyDetail` | Type — `detail` of the `select-text-copy` event, and what `copy()` resolves with |
| `SelectTextCopyReason` | Type — `'empty' \| 'no-clipboard' \| 'no-user-activation' \| 'denied'` |
| `SelectTextCopyState` | Type — `'idle' \| 'pending' \| 'copied' \| 'error'` |
| `SelectTextKind` | Type — `'input' \| 'textarea' \| 'contenteditable' \| 'text'` |
| `SelectTextTrigger` | Type — `'edge' \| 'always' \| 'click'` |
| `SelectTextWhitespace` | Type — `'collapse' \| 'preserve'` |
| `UseSelectTextParams` | Type — argument of `useSelectText` |
| `UseSelectTextReturn` | Type — its return shape |

## Whitespace and offsets

This is the one thing worth reading twice, because `textContent` is **not** what the user sees.

Given this template:

```vue
<p v-select-text="{ start: 0, end: 5 }">
  Hello world
</p>
```

the element's `textContent` is **not** `"Hello world"`. Compiled as an SFC — Vue's default is `whitespace: 'condense'`, which folds each run down to one space — it is `" Hello world "`, 13 characters, with a space on each end. Rendered from static HTML, from SSR output, or from a runtime template compiled with `whitespace: 'preserve'`, the indentation survives verbatim: `"\n  Hello world\n"`, 15 characters.

Either way, raw offset `0` lands on whitespace rather than on `H`, and `0–5` selects `" Hell"` (or `"\n  He"`) — one character short of the word, and painting an odd blob in front of it.

So by default (`whitespace: 'collapse'`) the directive walks the subtree once and builds the text **as rendered**. Each character keeps a pointer back to the text node it came from, so the Range still lands on real nodes. The result is the same `"Hello world"` in every one of those cases — which is the point: your offsets stop depending on how the markup reached the DOM.

"As rendered" means all of this, not just whitespace:

- Every run of ASCII whitespace (space, tab, newline, form feed, carriage return) counts as a single space, and leading/trailing runs are dropped.
- Subtrees that paint no text are skipped: `display: none` (which is what `v-show="false"` sets), and the contents of `<script>`, `<style>`, `<noscript>`, `<template>`, `<textarea>`, `<select>`, `<option>`, `<title>`, `<iframe>`, `<object>`, `<canvas>`, `<audio>` and `<video>`. A `match` can never reach into text the user cannot see.
- Each element's own `white-space` is respected, so a `<pre>` nested inside a normal-flow host keeps its runs while its siblings collapse.
- A block-level child boundary and a `<br>` each count as one space, so `<ul><li>a</li><li>b</li></ul>` reads as `"a b"` rather than `"ab"` and `match: 'a b'` can find it.

| Mode | Text the offsets are counted against | `start: 0, end: 5` selects |
|---|---|---|
| `'collapse'` (default) | `"Hello world"` | `"Hello"` |
| `'preserve'` (SFC) | `" Hello world "` | `" Hell"` |
| `'preserve'` (static HTML / SSR) | `"\n  Hello world\n"` | `"\n  He"` |

`'preserve'` is raw `textContent`, verbatim — no skipping, no separators. An index into the string `el.textContent` hands you is the index the directive uses, which is exactly what a `white-space: pre` host wants and exactly what a normal-flow one does not.

Use `'preserve'` when the host renders whitespace literally — a `white-space: pre` code block, a plain-text editor — where the raw indices *are* the visible ones.

Two details that follow from this:

- A non-breaking space (`&nbsp;`, U+00A0) is a rendered character, not collapsible whitespace. It survives `'collapse'` as itself and counts as one character.
- The same resolved text is what `match` searches, which is why `match: 'quick brown'` works across a `<strong>` boundary and across a newline in your source.

`whitespace` has no effect on `<input>` / `<textarea>` — their `value` is already exact.

## `select-text` event

After every successful selection the host dispatches a **bubbling, non-cancelable** `CustomEvent` named `select-text`:

```ts
type SelectTextEventDetail = {
  start: number
  end: number
  text: string
  direction: 'forward' | 'backward' | 'none'
  kind: 'input' | 'textarea' | 'contenteditable' | 'text'
}
```

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { SelectTextEventDetail } from '@ozjsey/v-select-text'

const copied = ref('')

function onSelectText(e: CustomEvent<SelectTextEventDetail>) {
  copied.value = e.detail.text        // exactly what is now selected
  console.log(e.detail.start, e.detail.end, e.detail.kind)
}
</script>

<template>
  <p v-select-text="{ match: 'brown fox' }" @select-text="onSelectText">
    The quick <strong>brown fox</strong> jumps over the lazy dog.
  </p>
</template>
```

If Vue's template types complain about the handler signature, take the event as `Event` and cast inside: `(e as CustomEvent<SelectTextEventDetail>).detail`.

What the numbers mean:

- **Text and contenteditable hosts** — `start` / `end` / `text` are always in the same resolved view, whether you asked for the whole host, an explicit range or a `match`. A bare `v-select-text` and `v-select-text="{ start: 0 }"` request the identical selection, so they report the identical payload. Under the default `'collapse'` that is the rendered text, so `text` is what the reader sees highlighted. To put it on the clipboard, use [`copy: true`](#copying-the-selection) rather than calling `navigator.clipboard.writeText` yourself — a write needs a user gesture the default trigger does not have.
- **Inputs and textareas** — always against `el.value`.
- **The `select()` fallback** — when `setSelectionRange` throws, the event reports `start: 0`, `end: value.length`, the whole value, and `direction: 'forward'`, because `HTMLInputElement.select()` takes no direction. That is what was applied, not what was asked for.

No selection means no event:

- a `match` that isn't found, a `match` that is still `null`, or a `matchIndex` out of range
- an unsupported host, a host detached from the document, or a browser that refuses the Range
- **an empty resolution** — a host whose text hasn't arrived yet, a whitespace-only host under the default `'collapse'`, an explicitly collapsed `{ start: 5, end: 5 }`, a zero-length `RegExp` hit, or a range that covers only the space the resolver inserts between two block children. See [The empty host](#the-empty-host).

All of these are decided **before** the selection is installed, so the document selection is left exactly as it was. The one honest exception is an engine that accepts `Selection.removeAllRanges()` and then throws on `addRange()` — by then the previous selection is already gone. Nothing is reported either way.

## The empty host

The most ordinary shape this directive is put into is also the one that used to break:

```vue
<p v-select-text>{{ fromApi }}</p>   <!-- the text arrives after mount -->
```

**An empty resolution is a no-op, not a failure.** Nothing is selected, no `select-text` fires, no
warning is printed — not even the hidden-host or `user-select: none` diagnostics below, which
describe a selection that will not be *painted* and so have nothing to say about one that was never
made — and, this is the part that mattered, **the document selection is not touched**, so whatever
the user (or another host on the page) had selected survives an empty host mounting beside it.

And the edge is *not* spent. `'edge'` fires on each `false → true` transition of `enabled`, but the
transition only counts once a selection actually lands. A host that mounts empty selects its text on
the render that brings the text in, with no `trigger: 'always'` and no manual `enabled` cycle.

"Empty" is the resolved view, not the DOM:

| Host / binding | Resolves to | Result |
|---|---|---|
| `<p v-select-text>{{ fromApi }}</p>` before the fetch lands | `""` | no-op; selects when the text arrives |
| `<p v-select-text>` &nbsp;`   `&nbsp; `</p>` (whitespace only, `'collapse'`) | `""` | no-op — a run of whitespace paints nothing |
| the same host with `whitespace: 'preserve'` | `"   "` | **selects** — those characters are real in a `pre` host |
| `{ start: 5, end: 5 }` | a caret | no-op; the field's own selection is left where it was |
| `{ match: /x*/ }` (zero-length hit) | `""` | no-op |
| `{ start: 3, end: 4 }` over `<ul><li>abc</li><li>def</li></ul>` | the synthetic `" "` between the items | no-op — that space is in the resolved text, not in the DOM, so a Range over it is collapsed |

The rule underneath all six rows is one line: **a collapsed Range is not a selection.** It is checked
before the selection is installed, which is why an empty host cannot clear the page.

### The hidden-host diagnostic

A `display: none` host — including one inside a `v-show="false"` tab panel or modal — still accepts
a Range. The selection is real and `detail.text` is honest, but nothing is painted, so the event
describes something the user cannot see. The directive says so once per element:

```
[v-select-text] <p> sits inside a `display: none` <div> (a `v-show="false"` ancestor, for instance), so it renders nothing and the selection cannot be painted. The event still reports the text it resolved.
```

The selection is left in place rather than refused: if the panel is shown later and nothing else has
touched the document selection, it is already there.

## Copying the selection

```vue
<code v-select-text="{ trigger: 'click', copy: true }">sk-live-9f3b2c7d41ae4e08b6c5</code>
```

Click the token: it is selected *and* on the clipboard. `copy` defaults to `false`, and
`trigger: 'click'` is not decoration — read [the crux](#the-crux-user-activation) before using
anything else.

### What is written

**Exactly `detail.text` — the string the `select-text` event reports.** Never
`getSelection().toString()`, which differs in three measured ways:

- a `user-select: none` host stringifies to `""`, which would **wipe your clipboard** on a
  selection the directive considers successful
- Chrome mirrors a focused field's own selection into the document selection; Firefox and Safari do
  not, so an `<input>` would copy the right thing in one engine and nothing in two
- engines insert their own separators at block boundaries, so the string would not be the one you
  were shown

The consequence is the good kind: composition with `match`, with `start` / `end` and with the
whole-host path is free, because there is only one string in play.

**An empty text is never written**, so nothing here can clear a clipboard — and since an empty
resolution does not select at all (see [The empty host](#the-empty-host)), a `{ start: 5, end: 5 }`
or a `match` that is not there never even reaches the clipboard.

There is **no `execCommand` fallback**. The usual temp-`<textarea>` recipe calls `.select()` on it,
destroying the very selection this directive exists to make.

### The crux: user activation

`navigator.clipboard.writeText` needs *transient user activation*. `trigger: 'click'` is the only
universally-legal path. The package's own default, `trigger: 'edge'`, fires on **mount** — there is
no gesture there at all.

Re-measured 2026-09-07 against **Chrome 152.0.7977.82** (`--headless=new`, `http://localhost`,
top-level document, `document.hasFocus() === true`, clipboard permissions left at their defaults),
with the real clipboard read back after every attempt:

| Where the selection fires | Chrome 152 | Firefox | Safari |
|---|---|---|---|
| **no gesture at all** — the default `trigger: 'edge'` on mount, or a flip more than ~5 s after the last one | **REFUSED**, `reason: 'no-user-activation'` — *verified* | refused — *unverified, engine docs only* | refused — *unverified, engine docs only* |
| `trigger: 'click'`, real trusted click | **copied** — *verified* | expected to copy — *unverified* | expected to copy — *unverified* |
| `trigger: 'click'`, <kbd>Enter</kbd> / <kbd>Space</kbd> on the focused host | **copied** — *verified* | expected to copy — *unverified* | expected to copy — *unverified* |
| `enabled` flipped `false → true` **inside** a real click handler | **copied** — *verified* | expected to copy — *unverified* | expected to copy — *unverified* |
| the same flip from a `setTimeout(…, 250)` **started by a real click** | **copied** — *verified* | *unverified* | *unverified* |
| the same flip 6 s after the click | **REFUSED**, `reason: 'no-user-activation'` — *verified* | refused — *unverified* | refused — *unverified* |
| no gesture, but `clipboard-write` explicitly granted (DevTools, an extension, enterprise policy) | **copied** — *verified* | *unverified* | *unverified* |

**A timer does not lose the activation — the clock does.** Transient activation lasts about five
seconds in Chrome (measured: `navigator.userActivation.isActive` still `true` at +3000 ms, `false`
at +5200 ms), so deferring a flip by a frame or by 250 ms is fine and the widely repeated
"`setTimeout` breaks the clipboard" is only true once you are past that window. What actually fails
is **having no gesture in the first place**, which is exactly what `trigger: 'edge'` firing on
mount is.

The last row is why this table is worth reading twice: with `clipboard-write` granted the write
succeeds with no activation whatsoever. That is how a test harness — or a browser you happened to
have granted the permission in — can make a broken page look like a working one. The playground's
own checks reset the permission before every write for that reason, and keep the granted case as an
explicit control.

The Chrome column is driven by CDP in `playground/scripts/interactions/v-select-text.mjs`, with
trusted `Input.dispatch*` events for the gesture cases and `Runtime.evaluate { userGesture: false }`
for the ones that must not have one. **CDP is Chrome-only: the Firefox and Safari columns are
unverified and marked as such rather than guessed.**

One precision about row 1: what the checks drive is the *condition* — a write made while
`navigator.userActivation.isActive` is `false`, reached both by waiting the window out and by
evaluating with no gesture at all. A freshly loaded document is in that same condition, which is
what makes `trigger: 'edge'` on mount the case this row is about.

So `copy` on any non-click trigger prints one warning per element — on the first render where
`enabled` is actually true, not at mount, so a host that arms itself on a click does not warn about
a write nobody has asked for yet — and *still attempts the write*.
Pre-blocking would make the package less capable than the engines actually permit — a flip a moment
after a real click is legal (row 5), and a page that has been granted `clipboard-write` can write
with no gesture at all (row 7) — and Safari exposes no `navigator.userActivation` to pre-check with:

```
[v-select-text] `copy: true` with `trigger: 'edge'` has no user gesture to write under. Chrome refuses that as well as Firefox and Safari — the page has to still hold a transient activation (about five seconds after a real gesture in Chrome). Use `trigger: 'click'`, or call `copy()` from `useSelectText` inside your own click handler. The attempt is still made — listen for `select-text-copy` to see what happened.
```

### `select-text-copy`

Every attempt reports, success or failure. It is never thrown (that would break the render from
`mounted`) and never a rejected promise on the directive path (nobody holds it, so every consumer
would get unhandled-rejection noise).

```ts
type SelectTextCopyDetail = {
  ok: boolean
  text: string                      // what was offered — the selection's detail.text
  reason?: 'empty' | 'no-clipboard' | 'no-user-activation' | 'denied'
  error?: unknown                   // whatever the engine threw
  selection: SelectTextEventDetail  // the select-text this copy belongs to
}
```

```vue
<code
  v-select-text="{ trigger: 'click', copy: true }"
  @select-text-copy="onCopy"
>sk-live-9f3b2c7d41ae4e08b6c5</code>
```

```ts
function onCopy(e: CustomEvent<SelectTextCopyDetail>) {
  if (e.detail.ok) toast(`Copied ${e.detail.text}`)
  else toast(`Could not copy — ${e.detail.reason}`)
}
```

| `reason` | Means |
|---|---|
| `'no-user-activation'` | The write was refused **and** `navigator.userActivation.isActive` was `false` when it was made. Almost always `copy` on a non-click trigger. |
| `'denied'` | Refused for any other reason, or on an engine that exposes no `navigator.userActivation` (Safari) so the two cannot be told apart. `error` carries the engine's exception. |
| `'no-clipboard'` | No `navigator.clipboard.writeText` — an insecure context, or an old browser. |
| `'empty'` | The text was empty, so nothing was written. Not reachable through any binding since 2.1.0; it is the guard that keeps this package from ever clearing a clipboard. |

`navigator.userActivation` is read **synchronously, immediately before the write**, and is used
*only* to choose between those first two reasons. It never gates the attempt.

The handler above writes state — `toast(…)` re-renders. That is safe, and the next section is why.

### `copy` under `trigger: 'always'`: once per distinct text

`'always'` fires on **every** update. Pair it with `copy: true` and a `select-text-copy` handler
that writes state — the `toast(…)` above is one — and you have a cycle: the copy settles in a
promise, the handler re-renders, `'always'` selects again and starts another write. Vue's
recursive-update guard only sees *synchronous* re-entry, so it never fires. Measured in Chrome:
**~8,600 real clipboard writes per second, indefinitely**, on a page that still looked responsive.

So the library closes it. Under `trigger: 'always'`, a copy whose text is **identical to that
host's last attempt** is skipped outright — no `writeText`, no `select-text-copy`, no
`data-select-text-copy` write:

```vue
<p v-select-text="{ trigger: 'always', copy: true }" @select-text-copy="toast">{{ quote }}</p>
```

| what happens | writes |
|---|---|
| mount | 1 |
| any number of re-renders, `quote` unchanged | 0 |
| `quote` changes | 1 |
| `quote` changes back to a value copied earlier | 1 — only the *last* attempt is remembered |
| `copy` toggled off and on again | 1 — an explicit act re-arms it |

This is `'always'`'s own semantics rather than a limitation: the trigger exists so the selection
follows text that *moves*, so the copy follows the text too — not the render. It is keyed on the
last **attempt**, not the last success, because a refusal re-renders just as well (`toast('could
not copy')` is a state write too).

**Nothing else is guarded.** `trigger: 'click'` is one gesture per attempt and
`trigger: 'edge'` needs an explicit `false → true` re-arm; both are deliberate acts, so both write
the same text as often as you ask. You may well have copied something else in between — taking your
own clipboard away from you would be the worse bug. `useSelectText().copy()` likewise always
writes, whatever `trigger` its options carry.

### The state attribute

`data-select-text-copy` carries `pending` → `copied` | `error`, so feedback needs no JavaScript:

```css
[data-select-text-copy='copied']::after { content: ' ✓'; color: green; }
[data-select-text-copy='error']::after  { content: ' ✕'; color: crimson; }
```

**It is only written when it changes.** `setAttribute` queues a `MutationRecord` even for an
identical value, so a consumer with a `MutationObserver` on the host would otherwise get a callback
per attempt — and a callback that writes state is the same loop as the section above, driven by a
different engine. Two records per attempt (`pending` → settled) is the floor, and it is what you
get.

### Keyboard

`trigger: 'click'` used to be mouse-only. It now carries its own keyboard affordance, following the
portfolio rule *a directive that makes an element clickable must make it keyboard-operable,
preferring a real focusable control over injected ARIA*. A `<code>` token has no such control, so
while `trigger: 'click'` is active the directive adds:

- `tabindex="0"` — only if the host has none
- `role="button"` — only if the host has none
- <kbd>Enter</kbd> / <kbd>Space</kbd>, with `preventDefault()` so Space does not scroll the page

Everything it added is removed again when the trigger changes, when `enabled` turns false, and on
unmount; an attribute you wrote yourself is never touched. Hosts that are **already** interactive —
`<button>`, `<a href>`, `<input>`, `<textarea>`, `<select>` — are left completely alone, because the
browser already turns Enter into a click there and `role="button"` would misdescribe them.

### What is guaranteed, and what is not

- What lands on the clipboard is exactly the `detail.text` of the `select-text` that preceded it.
- `select-text-copy` never precedes its `select-text`.
- One selection = at most one attempt = at most one `select-text-copy`.
- Under `trigger: 'always'`, one *distinct text* = at most one attempt. A suppressed attempt is
  silent by design: no write, no event, no state attribute — the clipboard already holds that
  string, so there is nothing to report. `'edge'` and `'click'` repeat freely; see
  [once per distinct text](#copy-under-trigger-always-once-per-distinct-text).
- A superseded attempt (a second selection started before the first write settled) **still fires its
  own event** — nothing is swallowed — but does not write the state attribute back.
- A host unmounted mid-flight dispatches nothing. **The write still lands**: once
  `writeText` has been called the clipboard belongs to the browser, and this package will not
  pretend otherwise.

### Doing it yourself

If you need a transform, a history, a feedback window or an announcement, that is
[`v-copy`](../v-copy)'s job, not this one. `v-select-text` owns exactly *"copy what I just
selected"*.

If you still want to call `writeText` from your own `select-text` handler, it has to be a handler
running under a real gesture — so `trigger: 'click'`, and no `await` before the write. On the
default trigger it is refused **in Chrome as well**, and the un-`catch`ed version surfaces as an
uncaught page exception.

## `useSelectText`

The imperative form, for when the element is held outside a template or the selection is driven by a click handler rather than a reactive condition.

```vue
<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useSelectText } from '@ozjsey/v-select-text'

const quoteRef = useTemplateRef<HTMLElement>('quote')
const selection = useSelectText({
  target: () => quoteRef.value,
  options: { match: 'the important bit' },
})

async function quote() {
  // `copy()` selects AND writes, in the turn this click handler is running in
  // — which is the activation `writeText` needs. Do not `await` anything first.
  const copied = await selection.copy()
  if (copied && !copied.ok) console.warn('clipboard refused:', copied.reason)
}

function widen() {
  selection.update({ match: undefined, start: 0, end: 20 }) // MERGES with the initial options
  selection.select()
}
</script>

<template>
  <p ref="quote">… the important bit …</p>
  <button @click="quote">Quote</button>
  <button @click="widen">Widen</button>
  <button @click="selection.clear()" :disabled="selection.state.value === 'idle'">
    Clear
  </button>
  <span>{{ selection.copyState.value }}</span>
</template>
```

Parameters:

| Field | Type | Notes |
|---|---|---|
| `target` | `HTMLElement \| (() => HTMLElement \| null) \| null` | Required. A getter is the usual form with a template ref. `null` (or a getter returning `null`, or one that throws) yields a no-op API rather than an error. |
| `options` | `SelectTextOptions` | Optional. Same bag as the directive; `trigger` and `copy` are both irrelevant here because you decide when to call `select()` and `copy()`. |

Returned API:

| Field | Type | Notes |
|---|---|---|
| `state` | `Ref<'idle' \| 'selected'>` | `'selected'` after a successful cycle, `'idle'` after one that selected nothing. Reset to `'idle'` by `clear()` and on scope dispose. |
| `select()` | `() => SelectTextEventDetail \| null` | Runs a selection now and **returns the detail**, or `null` when the target is null, `enabled` is `false`, a `match` found nothing, or the resolution was empty. Still dispatches the `select-text` event on the host. Never writes to the clipboard, even with `copy: true` in `options` — `copy()` is the door. |
| `clear()` | `() => void` | Clears the document selection — and the field's own selection when the target is an `<input>` or `<textarea>`, which the document selection does not cover — then sets `state` back to `'idle'`. |
| `copy()` | `() => Promise<SelectTextCopyDetail \| null>` | Selects **and** writes `detail.text` to the clipboard in one turn, then resolves with the attempt. `null` when nothing was selected — so nothing was written. Never rejects. Call it directly from a click / keydown handler: awaiting anything first spends the user activation the write needs. |
| `copyState` | `Ref<'idle' \| 'pending' \| 'copied' \| 'error'>` | Clipboard progress, deliberately **separate** from `state` — widening that union would break the `state === 'idle'` example above. Reset by `clear()` and on scope dispose. |
| `update(next)` | `(next: SelectTextOptions) => void` | Shallow-**merges** into the current options without selecting — `update({ end: 7 })` keeps `start` and `direction`. |

It is SSR-safe: with no `document` the API is inert and `state` stays `'idle'`.

## Triggers and edge detection

| `trigger` | Fires |
|---|---|
| `'edge'` (default) | On each `false → true` transition of `enabled`. Mounting with `enabled: true` counts as one. |
| `'always'` | On every update while `enabled` is true — use when the range or the underlying text moves and the selection should follow. With `copy: true` the *selection* still re-runs every time, but the *write* happens [once per distinct text](#copy-under-trigger-always-once-per-distinct-text). |
| `'click'` | Never on mount or update. On every click of the host — or <kbd>Enter</kbd> / <kbd>Space</kbd> while it is focused — instead, while `enabled` is true. |

The directive tracks per element, in a `WeakMap`, whether the edge has been **spent** — meaning
`enabled` is true *and* a selection actually landed. So an `'edge'` selection does not repeat while
the condition stays `true` across re-renders, mounting with `enabled: false` leaves the edge unspent
so a later `true` fires correctly, and an enabled render that selected nothing (an empty host, a
`match` that has not arrived yet) also leaves it unspent — which is what makes
`<p v-select-text>{{ fromApi }}</p>` fire when the text lands. See [The empty host](#the-empty-host).

For `trigger: 'click'`, the listener is re-synced on every mount and update — it always closes over the options of the render that installed it — and is removed when `enabled` turns false, when `trigger` changes, or on unmount. `enabled` remains the master switch. The [keyboard affordance](#keyboard) that comes with it is installed and removed on exactly the same schedule.

## Supported elements

Every element that holds text is supported. The host is classified into one of four kinds, which is also reported as `detail.kind`:

| Host | `kind` | Strategy |
|---|---|---|
| `<input>` of a textual type | `'input'` | `setSelectionRange` |
| `<textarea>` | `'textarea'` | `setSelectionRange` |
| Anything `contenteditable` (inherited included) | `'contenteditable'` | Range API |
| **Any other element** — `<p>`, `<blockquote>`, `<code>`, `<td>`, `<span>`, … | `'text'` | Range API |

Only two groups warn and no-op:

- **Input types that cannot hold selectable text:** `hidden`, `file`, `image`, `submit`, `reset`, `button`, `checkbox`, `radio`, `color`, `range`
- **Elements that hold no text node at all:** `<img>`, `<br>`, `<hr>`, `<canvas>`, `<video>`, `<audio>`, `<iframe>`, `<embed>`, `<object>`, `<select>`, `<progress>`, `<meter>`, `<svg>`

```
[v-select-text] <img> holds no selectable text. Use an <input>, a <textarea>, or any element with text content.
```

For inputs the descriptor includes the type, e.g. `<input[type="checkbox"]>`. `<select>` is on the list because its text lives in `<option>`s the user cannot select.

### The `user-select: none` diagnostic

A programmatic Range over a `user-select: none` subtree is a real selection that paints nothing, which reads as "the directive didn't fire". For `'text'` hosts only, the directive checks the computed style and warns once per element:

```
[v-select-text] <p> resolves to `user-select: none`, so the selection is made but never painted. Remove that rule (or set `user-select: text`) to see it.
```

## Fallback behavior

- **Inputs:** if `setSelectionRange` throws — `<input type="number">` and `<input type="email">` reject it in real browsers — the directive falls back to `.select()`, which selects everything. The event then reports `start: 0`, `end: value.length`, the full value and `direction: 'forward'`. If `.select()` throws too, nothing is selected and no event fires.
- **Text / contenteditable:** `direction: 'backward'` is applied with `Selection.setBaseAndExtent`; on engines without it the selection is still made, just anchored forward. If the browser exposes no `Selection`, or the Range cannot be built, or the Range comes out collapsed, the cycle ends with no selection and no event — and without disturbing the selection already on the page.

## Upgrading from 1.x

1.x only handled `<input>` and `<textarea>` and warned on everything else. 2.x keeps every 1.x binding working:

- `condition` still works and is now a **deprecated** alias for `enabled` — rename it; `enabled` wins if both are present.
- The behaviour of a bare `v-select-text`, of a boolean binding, and of an options object carrying `start` / `end` / `direction` is unchanged for inputs.
- What changed is the default for *other* elements: instead of warning and no-opping, they now select their rendered text.

## License

MIT
