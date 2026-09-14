# Changelog

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
