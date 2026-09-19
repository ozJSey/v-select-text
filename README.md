# @ozjsey/v-select-text

Select the rendered text of any element — whole, by range, or by pattern.

[![npm](https://img.shields.io/npm/v/@ozjsey/v-select-text.svg)](https://www.npmjs.com/package/@ozjsey/v-select-text)
![license MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![gzipped 5.13 KiB](https://img.shields.io/badge/gzipped-5.13%20KiB-blue.svg)
![dependencies 0](https://img.shields.io/badge/dependencies-0-blue.svg)

**[See it running, and edit it in the browser →](https://ozjsey.github.io/npm-portfolio-playground/#v-select-text)**

## The problem

Selecting an `<input>` is one line of vanilla JS (`el.select()`) and needs no directive. Selecting
the *rendered text* of a `<p>`, a `<blockquote>`, a `<td>` or a `<code>` block — across nested
markup, at offsets that survive template indentation, or by a pattern you only know at runtime — is
the thing that actually needs one.

Hand-rolled with the Range API it breaks on the first indented template, because `textContent` is
**not** what the user sees: a `<p>` written across three lines in an SFC carries a space at each
end. Raw offset `0` lands on whitespace rather than on `H`, and `0–5` selects `" Hell"` — one
character short of the word, and painting an odd blob in front of it.

## The solution

`v-select-text` does that with the Range API, and supports inputs, textareas and contenteditable
hosts on the same options bag.

```vue
<p v-select-text="{ match: 'quick brown' }">
  The quick <strong>brown fox</strong> jumps over the lazy dog.
</p>
```

`"quick brown"` straddles the boundary between a text node and the `<strong>`; the match is found
against the flattened subtree text, so the Range crosses the boundary with it. That text is built
**as rendered** — whitespace runs collapsed, subtrees that paint nothing skipped — and `start`,
`end` and `match` are all counted against it, so your offsets stop depending on how the markup
reached the DOM. Unlike `user-select: all`, you get a `select-text` event, the selection can be
narrowed with `match`, and under `trigger: 'click'` the host is keyboard-operable.

**The one surprise worth knowing before you start:** `copy: true` wants `trigger: 'click'`. A
clipboard write needs a user gesture, and the default trigger fires on mount where there is none —
so the directive warns, still attempts the write, and reports the refusal on `select-text-copy`
rather than failing silently.

## Install

```bash
npm install @ozjsey/v-select-text
```

Vue 3 is a peer dependency — it won't be bundled. **Vue 3.2.0 or newer is required**:
`useSelectText` calls `getCurrentScope()` / `onScopeDispose()`, which Vue 3.2.0 added and 3.1.x does
not export.

```ts
import { createApp } from 'vue'
import { SelectTextPlugin } from '@ozjsey/v-select-text'
import App from './App.vue'

createApp(App).use(SelectTextPlugin).mount('#app')
```

This registers the directive under the kebab-case name `select-text`, so templates use it as
`v-select-text="..."`. Or import `vSelectText` into a single component — Vue auto-registers the
variable as `v-select-text` because the name starts with `v`.

## Usage

### Select on mount, or on a boolean

```vue
<script setup lang="ts">
import { ref } from 'vue'

const isQuoting = ref(false)
</script>

<template>
  <blockquote v-select-text>
    The quick brown fox jumps over the lazy dog.
  </blockquote>

  <p v-select-text="isQuoting">Selected on each false → true transition.</p>
  <button @click="isQuoting = !isQuoting">Quote it</button>
</template>
```

The whole subtree is selected, and — unlike an input's highlight — the selection stays painted
whether or not anything is focused. A host whose text has not arrived yet selects nothing and leaves
its edge unspent, so `<p v-select-text>{{ fromApi }}</p>` fires on the render that brings the text
in.

### Click to select, click to copy

```vue
<code v-select-text="{ trigger: 'click' }">npm install @ozjsey/v-select-text</code>

<code v-select-text="{ trigger: 'click', copy: true }">sk-live-9f3b2c7d41ae4e08b6c5</code>
```

`trigger: 'click'` never fires on mount or update — only on a click of the host. While it is active
the directive adds `tabindex="0"`, `role="button"` and <kbd>Enter</kbd> / <kbd>Space</kbd>, unless
the host is already an interactive control, and removes again exactly what it added. With
`copy: true` the token is selected *and* on the clipboard, carrying exactly the text the
`select-text` event reports.

### Inputs and textareas

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

Supported, and on the same options bag — but reach for the directive here only when the *reactivity*
is what you want, since a one-off is just `el.select()`. For inputs and textareas the text searched
by `match` and indexed by `start` / `end` is `el.value`, and `whitespace` is ignored — a value is
already exact.

## Everything else

Every option, every event, every diagnostic, driven in a real browser and editable as you read:
**[the `v-select-text` playground tab](https://ozjsey.github.io/npm-portfolio-playground/#v-select-text)**.
Sixteen cards, including the ones that answer what this page deliberately does not:

- [`whitespace: 'collapse'` vs `'preserve'`](https://ozjsey.github.io/npm-portfolio-playground/#v-select-text/whitespace) — both modes on the same indented template
- [text that arrives after mount](https://ozjsey.github.io/npm-portfolio-playground/#v-select-text/late-text) — the binding fires, selects nothing, then selects for real
- [the clipboard activation trap, measured](https://ozjsey.github.io/npm-portfolio-playground/#v-select-text/copy-activation) — the same flip inside the handler, 250 ms later, and six seconds later
- [`trigger: 'always'` with `copy`](https://ozjsey.github.io/npm-portfolio-playground/#v-select-text/always-copy-loop) — the write loop, and the guard that stops it
- [contenteditable](https://ozjsey.github.io/npm-portfolio-playground/#v-select-text/contenteditable) · [the `select-text` event](https://ozjsey.github.io/npm-portfolio-playground/#v-select-text/event) · [`useSelectText`](https://ozjsey.github.io/npm-portfolio-playground/#v-select-text/composable)
- [unsupported hosts](https://ozjsey.github.io/npm-portfolio-playground/#v-select-text/unsupported) — what warns, and what it says

[CHANGELOG.md](./CHANGELOG.md) ·
[ARCHITECTURE.md](https://github.com/ozjsey/v-select-text/blob/main/ARCHITECTURE.md)

## License

MIT
