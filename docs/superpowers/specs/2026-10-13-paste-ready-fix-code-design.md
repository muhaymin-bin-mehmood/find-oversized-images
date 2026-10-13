# Paste-ready fix code (srcset and sizes)

Design for 0.3.0. Decided with the owner on 2026-10-13.

## Why

Today the tool names the problem ("this file is 4x wider than the box, sizes is wrong")
and leaves the hard part to the reader: working out what `sizes` and `srcset` should
actually be. That is the step that takes real effort, and it is the step we skip.

**Who this is for:** a developer or theme author auditing a page. Their job is done when
they have code they can paste, not when they have a list of problems.

**Success:** open the HTML report, click a code block, Ctrl+C, paste into the theme,
re-run the scan, and the image is gone from the list.

**Out of scope here** (separate projects, in this order): scanning a sitemap or several
URLs, and producing resized replacement files or handing the list to BatchSet.

## Decisions

1. Measure three viewports instead of two, so the tablet range is measured, not guessed.
2. The terminal table does not change. One pointer line is added after it.
3. The HTML report always includes the generated code. A markdown file is written only
   with `--fix-code`, because silently creating files in someone's working directory
   (a repo, a CI job) is bad behaviour.
4. No Copy button. A button needs JavaScript, and the report's promise is that it
   contains no scripts and ships a strict CSP. `user-select: all` on the code block
   gives click-then-Ctrl+C with no script.
5. Plain HTML output for every image. Real working URLs on the Shopify CDN, which
   resizes on request. Widths plus placeholder names elsewhere. One general WordPress
   note per report, never a per-image WordPress snippet, because WordPress generates
   srcset itself and the real fix is site-level.
6. Version 0.3.0, not a patch. The third viewport changes what a default run does.

## Viewports

| Name | Size | DPR |
|---|---|---|
| mobile | 390 x 844 | 3 |
| tablet | 768 x 1024 | 2 |
| desktop | 1366 x 768 | 1 |

A default run does all three. `--tablet` is added next to `--mobile` and `--desktop`.
`--width` keeps its current meaning: one custom viewport, and then no code is generated.

## Pipeline

```
collect (x3) -> analyze (x3, unchanged) -> join -> fixcode -> writers
```

`analyze.js`, `diagnose.js`, `group.js` and the terminal path in `format.js` keep their
current behaviour. Two new modules are added, and `collect.js` gains three fields.

### Identity: why URL cannot be the join key

`collect.js` keys each image by `img.currentSrc`. With srcset, `currentSrc` differs per
viewport by design: mobile picks the 400w file, desktop picks the 1200w file. Joining on
it would fail for exactly the images we care about.

`collect.js` therefore returns, per image:

- `identity` - the raw `srcset` attribute string when present, else the raw `src`
  attribute. Both are stable across viewports.
- `domPath` - an `nth-of-type` chain, so two images with the same identity (two product
  cards sharing a placeholder) stay distinct.
- `from` - `'img'` or `'source'`, saying where the chosen srcset came from, because code
  for a `<picture>` must be pasted on the `<source>`, not the `<img>`.

No existing field is removed or renamed.

### `src/join.js`

One job: take the per-viewport analyses, return one entry per image with every
viewport's measurement. Pure data in, data out: no browser, no filesystem, so it is
fully unit testable.

Matching: first on `identity`, then on `domPath` when one identity has several images.
An image missing from a viewport (hidden by CSS there, or never lazy-loaded) sets
`partial: true` and that viewport's entry to `null`.

```js
{
  identity, domPath, from,
  srcsetAttr, sizesAttr,        // what the page has today
  file: { width, height },
  objectFit,
  perViewport: {
    mobile:  { viewportWidth, boxWidth, dpr, needed } | null,
    tablet:  { ... } | null,
    desktop: { ... } | null,
  },
  partial: boolean,
  oversizedAt: ['mobile', 'desktop'],
}
```

### `src/fixcode.js`

One job: one joined entry in, one fix object out. Pure logic, no new dependency.

Code is generated only for images that are oversized on at least one viewport, which is
what `oversizedAt` records. An image that is already correctly sized everywhere gets no
entry, and when nothing is oversized there are no fixes, no new section in the report, and
no pointer line in the terminal.

## The `sizes` algorithm

Let each measured viewport give `(viewportWidth, boxWidth)` and `r = boxWidth / viewportWidth`.

**Shape detection, in this order:**

1. **Fixed** - every `boxWidth` within 8px of their mean. Emit a single value:
   `sizes="600px"`.
2. **Viewport-scaled** - every `r` within 5% of their mean. Emit a single value using the
   largest `r`: `sizes="92vw"`.
3. **Mixed** - neither holds. Emit explicit buckets.

**Buckets** for the mixed case, each containing exactly one measured point:

| Bucket | Media query | Upper bound `U` | Measured at |
|---|---|---|---|
| mobile | `(max-width: 480px)` | 480 | 390 |
| tablet | `(max-width: 1024px)` | 1024 | 768 |
| desktop | (no query, the default) | - | 1366 |

**Bucket value, and the bias that matters:** we measured 390, 768 and 1366, but each
bucket covers a range. Guessing too high costs a slightly larger file. Guessing too low
makes the image **blurry**, which is much worse. So every bucket biases upward:

```
value_b = ceil(max(boxWidth_b, r_b * U_b)) px
```

For the desktop bucket there is no upper bound, so it uses the measured 1366 box width.

For a genuinely fixed-width image this formula over-provides by at most 23% in the mobile
bucket and 33% in the tablet bucket, but a fixed-width image is caught by shape 1 and
never reaches here. For a viewport-scaled image it is exact, and such images are caught
by shape 2 anyway. Mixed images are the ones with no clean pattern, and there the bias is
deliberate.

**Known limit, stated in the report:** screens wider than 1366 fall in the desktop bucket
with the 1366 measurement. A layout that keeps growing past 1366 may still pick a file
slightly too small there. `--width` is the escape hatch for checking a specific width.

## The `srcset` widths

Start from `needed.width` per viewport, which `analyze` already computes (box x dpr, with
object-fit accounted for).

1. Round each up to a multiple of 50.
2. Drop a width that is within 10% of a larger one, keeping the larger.
3. Drop any width above the original file's width. Pixels cannot be invented.
4. If every needed width exceeded the file, emit the file's own width alone and add the
   note that the original is too small for this slot.
5. Sort ascending.

## URLs

**Shopify CDN** (`cdn.shopify.com`, or a path containing `/cdn/shop/`): build real URLs
with the `URL` API. Keep existing query parameters, replace any existing `width`, and drop
`height` so it cannot contradict the width. These URLs work when pasted.

**Everywhere else:** we cannot invent URLs. Emit the widths with placeholder names derived
from the original (`abaya-400.jpg 400w`) and say plainly that those files must be produced.

**`src` in the emitted code:** for Shopify, the widest emitted candidate, so a browser
without srcset support is never blurry. Elsewhere, the original `src` unchanged.

**No `width` and `height` attributes.** They would help layout shift, but adding them to a
site whose CSS does not already set them can change the layout. Not our call to make from
a scan.

## When no code is produced

- **One viewport only** (`--width`): no code. Message: a default run measures three
  viewports, which is what the generated code needs.
- **Partial** (image missing from a viewport): code from the measured viewports, with the
  missing viewport named, and `confident: false`. This is where mobile lazy-loading
  trouble surfaces.
- **`x` descriptors** (`diagnose` reason `density`): `sizes` does not help these. Emit the
  `w`-descriptor rewrite and say why.
- **Original too small:** cap at the file width and note it.

## Output of `fixcode.js`

Data, not strings. Writers do the formatting.

```js
{
  target: 'img' | 'source',
  sizes: '(max-width: 480px) 440px, 600px',
  widths: [400, 800, 1200],
  srcset: '...' | null,      // null when URLs cannot be built
  html: '<img ...>',         // the paste-ready block
  notes: ['Not loaded on mobile, so this is built from tablet and desktop only.'],
  confident: boolean,
}
```

## Output surfaces

**Terminal:** unchanged table, plus one line at the end:

```
Paste-ready srcset and sizes for these images: run with --fix-code (writes image-fixes.md) or --html
```

**HTML report:** a new section after the per-viewport sections, titled "Paste-ready
fixes", since the code is cross-viewport and does not belong inside one viewport's
section. Each entry: the code block (`user-select: all`, labelled "Click the code, then
Ctrl+C"), its notes, and a visible marker when `confident` is false. The existing
sections, CSP and no-script promise are untouched.

**`image-fixes.md`** (only with `--fix-code`): one block per image in fenced code, so it
pastes straight into a GitHub issue, a PR, or a chat with an assistant.

**`--json`:** a new top-level `fixes` array, outside `viewports`, because the data is
cross-viewport. The existing `viewports[].images[].fix` stays as it is. With `--json`, the
pointer line goes to stderr, matching how `--html` already behaves.

**WordPress note:** one line at the end of the report and the markdown file. WordPress
builds srcset itself, so the real fix is registering these widths with `add_image_size`,
regenerating thumbnails, and correcting `sizes` through the `wp_calculate_image_sizes`
filter. We give the widths and the `sizes` value, which is what we can honestly give.

## Testing

New unit tests, no browser:

- `join.js`: an srcset image whose `currentSrc` differs across all three viewports (the
  reason this module exists); two images with one identity separated by `domPath`; an
  image absent from one viewport producing `partial`.
- `fixcode.js`: fixed box; viewport-scaled box; mixed box; a Shopify URL with existing
  query parameters; a Shopify URL that already has `width=`; needed width above the file
  width; `x` descriptors; a `<picture>`/`<source>` target; one viewport only, which must
  produce no code.

Integration, on the existing local fixture: run all three viewports and assert that the
generated `sizes` actually makes the browser pick the intended candidate. This is the test
that proves the feature rather than the code.

The current 94 tests stay green. `cli.test.js` and the JSON assertions need updating for
three viewports instead of two.

## Release

0.3.0. The changelog must state three things plainly: a default run now measures a third
viewport, runs are slower for it, and `--fail-on` results can change because images can be
flagged on tablet that were not flagged before.
