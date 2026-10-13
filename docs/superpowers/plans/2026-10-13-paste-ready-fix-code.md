# Paste-ready fix code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate the `sizes` and `srcset` a developer can paste, instead of only naming what is wrong.

**Architecture:** Three viewports are measured instead of two. A new pure `join` module pairs each image's measurements across viewports using the raw `srcset`/`src` attribute as identity, because `currentSrc` differs per viewport by design. A new pure `fixcode` module turns one joined entry into `sizes`, a width ladder and a paste-ready block. The HTML report gains a cross-viewport section; `--fix-code` writes `image-fixes.md`. The terminal table is untouched.

**Tech Stack:** Node >= 20, ES modules, `node:test` with `node:assert/strict`, `playwright-core` driving installed Chrome or Edge.

**Spec:** `docs/superpowers/specs/2026-10-13-paste-ready-fix-code-design.md`

## Global Constraints

- Node `>=20`. No new runtime dependency: `playwright-core` stays the only one.
- The HTML report contains no scripts and keeps its CSP exactly as it is today: `default-src 'none'; img-src http: https:; style-src 'unsafe-inline'`.
- No existing JSON field is removed or renamed. Only additions.
- The terminal table's columns and grouping do not change. One pointer line is appended, and only when at least one fix exists.
- Viewports: mobile 390x844 dpr 3, tablet 768x1024 dpr 2, desktop 1366x768 dpr 1.
- Shape tolerances, copied from the spec: fixed = every `boxWidth` within 8px of their mean; viewport-scaled = every ratio within 5% of their mean.
- Bucket upper bounds: mobile 480, tablet 1024, desktop none (uses the 1366 measurement).
- Width ladder: round up to a multiple of 50, drop a width within 10% of a larger one, never exceed the original file's width.
- Version 0.3.0.
- Commit messages carry no Claude attribution and no co-author trailer.

## Review Focus

1. An image wider than its viewport (`r > 1`, a full-bleed image with overflow) must not produce `sizes="134vw"`. Clamp to `100vw`. Pinned in Task 3.
2. Two different images sharing one `srcset` attribute (a repeated card placeholder) with different box widths must not be merged into one fix, or one of them gets code built from the other's layout. Pinned in Task 2.
3. When `partial` leaves only one measured viewport, there is no shape to detect. It must produce no code rather than treating one point as "fixed". Pinned in Task 3 and Task 4.
4. A URL with a query string, or with no file extension, must still yield a sane placeholder name. Pinned in Task 4.
5. A protocol-relative (`//cdn.shopify.com/...`) or otherwise unparseable URL must not throw while detecting Shopify or building a name. Pinned in Task 4.

---

### Task 1: Stable identity from the page

**Files:**
- Modify: `src/collect.js` (inside `readImages`, the entry object around lines 100-120)
- Test: `test/integration.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: each raw image entry gains `identity: string`, `domPath: string`, `from: 'img' | 'source'`. `identity` is the raw `srcset` attribute when present, else the raw `src` attribute. Existing fields are unchanged.

- [ ] **Step 1: Write the failing test**

Add to `test/integration.test.js`:

```js
test('reports a stable identity, a dom path and where the srcset came from', { skip }, async () => {
  const browser = await launchBrowser();
  try {
    const raw = await collectViewport(browser, `${server.url}/page.html`, { name: 'desktop', width: 1366, height: 768, dpr: 1, mobile: false }, { timeout: 30000 });
    for (const image of raw.images) {
      assert.ok(typeof image.identity === 'string' && image.identity.length > 0, 'identity is a non-empty string');
      assert.match(image.domPath, /^(html|body|[a-z]+:nth-of-type\(\d+\))/);
      assert.ok(image.from === 'img' || image.from === 'source');
    }
    // identity must be the attribute, not the file the browser picked
    const withSrcset = raw.images.find((i) => i.srcset);
    assert.equal(withSrcset.identity, withSrcset.srcset);
    assert.ok(!withSrcset.identity.startsWith('http'), 'identity is the attribute, not a resolved URL');
  } finally {
    await browser.close();
  }
});
```

Add `collectViewport` to the existing import from `../src/collect.js`, creating that import line if the file does not have one.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration.test.js`
Expected: FAIL, `identity is a non-empty string` (the field is undefined)

- [ ] **Step 3: Write minimal implementation**

In `src/collect.js`, change `chosenSrcset` to also report its origin:

```js
  const chosenSrcset = (img) => {
    const picture = img.parentElement?.tagName === 'PICTURE' ? img.parentElement : null;
    if (picture) {
      for (const source of picture.querySelectorAll(':scope > source')) {
        if (!source.getAttribute('srcset')) continue;
        if (source.media && !matchMedia(source.media).matches) continue;
        if (source.type && !decodable.includes(source.type.trim().toLowerCase())) continue;
        return { srcset: source.getAttribute('srcset'), sizes: source.getAttribute('sizes'), from: 'source' };
      }
    }
    return { srcset: img.getAttribute('srcset'), sizes: img.getAttribute('sizes'), from: 'img' };
  };

  // An nth-of-type chain, so two images with the same attributes stay distinct
  const pathTo = (el) => {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && parts.length < 20; node = node.parentElement) {
      const tag = node.tagName.toLowerCase();
      if (!node.parentElement) {
        parts.unshift(tag);
        break;
      }
      let index = 1;
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
        if (sib.tagName === node.tagName) index++;
      }
      parts.unshift(`${tag}:nth-of-type(${index})`);
    }
    return parts.join(' > ');
  };
```

Then, where `entry` is built, replace the destructuring and add the three fields:

```js
    const { srcset, sizes, from } = chosenSrcset(img);
    const entry = {
      url,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      boxWidth,
      boxHeight,
      objectFit: style.objectFit,
      srcset: srcset || null,
      sizes: sizes ?? null,
      identity: srcset || img.getAttribute('src') || url,
      domPath: pathTo(img),
      from,
    };
```

`pathTo` runs inside the page, so it must stay inside `readImages` with the other in-page helpers.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node --test test/integration.test.js`
Expected: PASS

Run: `npm test`
Expected: PASS, no regressions

- [ ] **Step 5: Commit**

```bash
git add src/collect.js test/integration.test.js
git commit -m "feat: report a stable identity and dom path per image"
```

---

### Task 2: Join the viewports

**Files:**
- Create: `src/join.js`
- Create: `test/join.test.js`
- Modify: `src/analyze.js` (the `finding` object, to pass the new fields through)

**Interfaces:**
- Consumes: raw entries with `identity`, `domPath`, `from` from Task 1.
- Produces: `joinViewports(viewports) -> JoinedImage[]` where `viewports` is the array of analyzed viewport objects the CLI already builds, and

```js
/** @typedef {object} JoinedImage
 *  @property {string} identity
 *  @property {string} domPath
 *  @property {'img'|'source'} from
 *  @property {string|null} srcsetAttr
 *  @property {string|null} sizesAttr
 *  @property {{width:number,height:number}} file
 *  @property {string} objectFit
 *  @property {string} url            a representative URL, for naming and Shopify detection
 *  @property {Record<string, {viewportWidth:number, boxWidth:number, dpr:number, needed:{width:number,height:number}}|null>} perViewport
 *  @property {boolean} partial
 *  @property {string[]} oversizedAt
 */
```

`perViewport` has one key per viewport name that was run, with `null` where the image was absent.

- [ ] **Step 1: Write the failing test**

Create `test/join.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { joinViewports } from '../src/join.js';

const image = (over) => ({
  url: 'https://shop.example/a-800.jpg',
  identity: 'a-400.jpg 400w, a-800.jpg 800w',
  domPath: 'body:nth-of-type(1) > img:nth-of-type(1)',
  from: 'img',
  srcset: 'a-400.jpg 400w, a-800.jpg 800w',
  sizes: '100vw',
  file: { width: 800, height: 600 },
  shown: { width: 360, height: 270 },
  needed: { width: 1080, height: 810 },
  objectFit: 'cover',
  oversized: true,
  ...over,
});

const viewport = (name, width, dpr, images) => ({ name, width, dpr, images });

test('joins the same image across viewports even when the picked file differs', () => {
  const joined = joinViewports([
    viewport('mobile', 390, 3, [image({ url: 'https://shop.example/a-800.jpg', shown: { width: 360, height: 270 }, needed: { width: 1080, height: 810 } })]),
    viewport('desktop', 1366, 1, [image({ url: 'https://shop.example/a-400.jpg', shown: { width: 300, height: 225 }, needed: { width: 300, height: 225 } })]),
  ]);

  assert.equal(joined.length, 1, 'one image, not two');
  assert.equal(joined[0].perViewport.mobile.boxWidth, 360);
  assert.equal(joined[0].perViewport.desktop.boxWidth, 300);
  assert.equal(joined[0].perViewport.mobile.viewportWidth, 390);
  assert.equal(joined[0].partial, false);
  assert.deepEqual(joined[0].oversizedAt, ['mobile', 'desktop']);
});

test('two images sharing one srcset attribute stay separate', () => {
  const a = image({ domPath: 'body:nth-of-type(1) > img:nth-of-type(1)', shown: { width: 360, height: 270 } });
  const b = image({ domPath: 'body:nth-of-type(1) > img:nth-of-type(2)', shown: { width: 120, height: 90 } });
  const joined = joinViewports([viewport('mobile', 390, 3, [a, b]), viewport('desktop', 1366, 1, [a, b])]);

  assert.equal(joined.length, 2);
  assert.deepEqual(
    joined.map((j) => j.perViewport.mobile.boxWidth).sort((x, y) => x - y),
    [120, 360],
  );
});

test('an image missing from one viewport is partial', () => {
  const joined = joinViewports([
    viewport('mobile', 390, 3, []),
    viewport('tablet', 768, 2, [image()]),
    viewport('desktop', 1366, 1, [image()]),
  ]);

  assert.equal(joined.length, 1);
  assert.equal(joined[0].partial, true);
  assert.equal(joined[0].perViewport.mobile, null);
  assert.equal(joined[0].perViewport.tablet.boxWidth, 360);
});

test('an image that is never oversized is still joined, with an empty oversizedAt', () => {
  const fine = image({ oversized: false });
  const joined = joinViewports([viewport('desktop', 1366, 1, [fine]), viewport('mobile', 390, 3, [fine])]);

  assert.deepEqual(joined[0].oversizedAt, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/join.test.js`
Expected: FAIL, cannot find module `../src/join.js`

- [ ] **Step 3: Write minimal implementation**

Create `src/join.js`:

```js
/**
 * Pair each image's measurements across viewports.
 *
 * The join key cannot be the URL: with srcset, the file the browser picks changes
 * with the viewport by design, so the same image has a different URL in each run.
 * The raw srcset (or src) attribute does not change, so that is the identity, with
 * the dom path separating images that share one attribute.
 *
 * @param {{name:string, width:number, dpr:number, images:object[]}[]} viewports
 * @returns {object[]} one entry per image
 */
export function joinViewports(viewports) {
  const names = viewports.map((vp) => vp.name);
  const entries = new Map();

  for (const vp of viewports) {
    for (const image of vp.images) {
      const key = `${image.identity}\u0000${image.domPath}`;
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          identity: image.identity,
          domPath: image.domPath,
          from: image.from,
          srcsetAttr: image.srcset ?? null,
          sizesAttr: image.sizes ?? null,
          file: image.file,
          objectFit: image.objectFit,
          url: image.url,
          perViewport: Object.fromEntries(names.map((n) => [n, null])),
          partial: false,
          oversizedAt: [],
        };
        entries.set(key, entry);
      }
      entry.perViewport[vp.name] = {
        viewportWidth: vp.width,
        boxWidth: image.shown.width,
        dpr: vp.dpr,
        needed: image.needed,
      };
      if (image.oversized) entry.oversizedAt.push(vp.name);
    }
  }

  for (const entry of entries.values()) {
    entry.partial = names.some((n) => entry.perViewport[n] === null);
    // Keep the declared viewport order, not the order images were seen in
    entry.oversizedAt = names.filter((n) => entry.oversizedAt.includes(n));
  }
  return [...entries.values()];
}
```

In `src/analyze.js`, pass the new fields through on the `finding` object, right after `url`:

```js
      url: img.url,
      identity: img.identity,
      domPath: img.domPath,
      from: img.from,
```

This adds fields; no analyze behaviour changes.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node --test test/join.test.js`
Expected: PASS, 4 tests

Run: `npm test` after adding `test/join.test.js` to the `test` script in `package.json`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/join.js src/analyze.js test/join.test.js package.json
git commit -m "feat: join image measurements across viewports by attribute identity"
```

---

### Task 3: The sizes algorithm

**Files:**
- Create: `src/sizes.js`
- Create: `test/sizes.test.js`

**Interfaces:**
- Consumes: a `perViewport` map from Task 2.
- Produces: `buildSizes(perViewport) -> string | null`. `null` means fewer than two viewports were measured, so no shape can be read. Also exports `VIEWPORT_ORDER = ['mobile', 'tablet', 'desktop']` and `BUCKETS`, both used by Task 4.

- [ ] **Step 1: Write the failing test**

Create `test/sizes.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSizes } from '../src/sizes.js';

const point = (viewportWidth, boxWidth, dpr) => ({ viewportWidth, boxWidth, dpr, needed: { width: Math.ceil(boxWidth * dpr), height: 1 } });

test('a box that is the same width everywhere is a single px value', () => {
  const sizes = buildSizes({ mobile: point(390, 300, 3), tablet: point(768, 304, 2), desktop: point(1366, 300, 1) });
  assert.equal(sizes, '304px');
});

test('a box that tracks the viewport is a single vw value', () => {
  // ratios 0.9205, 0.9206, 0.9202: within tolerance, and the largest one wins
  const sizes = buildSizes({ mobile: point(390, 359, 3), tablet: point(768, 707, 2), desktop: point(1366, 1257, 1) });
  assert.equal(sizes, '92.1vw');
});

test('a mixed box gets buckets, biased up to the top of each bucket', () => {
  // mobile r = 0.918 -> 0.918 * 480 = 441; tablet r = 0.5 -> 0.5 * 1024 = 512; desktop uses its own box
  const sizes = buildSizes({ mobile: point(390, 358, 3), tablet: point(768, 384, 2), desktop: point(1366, 300, 1) });
  assert.equal(sizes, '(max-width: 480px) 441px, (max-width: 1024px) 512px, 300px');
});

test('an image wider than the viewport is clamped to 100vw', () => {
  const sizes = buildSizes({ mobile: point(390, 520, 3), tablet: point(768, 1024, 2), desktop: point(1366, 1820, 1) });
  assert.equal(sizes, '100vw');
});

test('one measured viewport gives no sizes at all', () => {
  assert.equal(buildSizes({ mobile: point(390, 358, 3), tablet: null, desktop: null }), null);
});

test('two measured viewports still work, skipping the missing bucket', () => {
  const sizes = buildSizes({ mobile: null, tablet: point(768, 384, 2), desktop: point(1366, 300, 1) });
  assert.equal(sizes, '(max-width: 1024px) 512px, 300px');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sizes.test.js`
Expected: FAIL, cannot find module `../src/sizes.js`

- [ ] **Step 3: Write minimal implementation**

Create `src/sizes.js`:

```js
export const VIEWPORT_ORDER = ['mobile', 'tablet', 'desktop'];

// Each bucket holds exactly one measured viewport. The upper bound is how wide the
// bucket goes, which is wider than the point we measured at.
export const BUCKETS = {
  mobile: { query: '(max-width: 480px)', upper: 480 },
  tablet: { query: '(max-width: 1024px)', upper: 1024 },
  desktop: { query: null, upper: null },
};

const PX_TOLERANCE = 8;
const RATIO_TOLERANCE = 0.05;

const mean = (numbers) => numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * The sizes value for one image, read from its box width at each measured viewport.
 *
 * Guessing high costs a slightly larger file. Guessing low makes the image blurry,
 * which is worse, so every bucket is biased towards the top of its range.
 *
 * @param {Record<string, {viewportWidth:number, boxWidth:number}|null>} perViewport
 * @returns {string|null} null when fewer than two viewports were measured
 */
export function buildSizes(perViewport) {
  const points = VIEWPORT_ORDER.filter((name) => perViewport[name]).map((name) => ({ name, ...perViewport[name] }));
  if (points.length < 2) return null;

  const boxes = points.map((p) => p.boxWidth);
  const boxMean = mean(boxes);
  if (boxes.every((b) => Math.abs(b - boxMean) <= PX_TOLERANCE)) {
    return `${Math.ceil(Math.max(...boxes))}px`;
  }

  const ratios = points.map((p) => p.boxWidth / p.viewportWidth);
  const ratioMean = mean(ratios);
  if (ratios.every((r) => Math.abs(r - ratioMean) <= RATIO_TOLERANCE * ratioMean)) {
    return `${round1(Math.min(100, Math.max(...ratios) * 100))}vw`;
  }

  const parts = points.map((p) => {
    const { query, upper } = BUCKETS[p.name];
    const value = upper === null ? Math.ceil(p.boxWidth) : Math.ceil(Math.max(p.boxWidth, (p.boxWidth / p.viewportWidth) * upper));
    return query === null ? `${value}px` : `${query} ${value}px`;
  });
  return parts.join(', ');
}
```

The clamp test passes through the vw branch: the three ratios (1.33, 1.33, 1.33) are within tolerance, and `Math.min(100, ...)` caps the result.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node --test test/sizes.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/sizes.js test/sizes.test.js package.json
git commit -m "feat: build a sizes value from box widths measured at three viewports"
```

Add `test/sizes.test.js` to the `test` script before committing.

---

### Task 4: The fix code itself

**Files:**
- Create: `src/shopify.js`
- Create: `src/fixcode.js`
- Create: `test/fixcode.test.js`
- Modify: `src/diagnose.js` (import `isShopifyCdn` instead of defining it)

**Interfaces:**
- Consumes: `JoinedImage` from Task 2, `buildSizes` and `VIEWPORT_ORDER` from Task 3.
- Produces:
  - `src/shopify.js`: `isShopifyCdn(url) -> boolean`, `shopifyUrl(url, width) -> string`, `placeholderName(url, width) -> string`.
  - `src/fixcode.js`: `buildFix(joined) -> Fix | null`, where

```js
/** @typedef {object} Fix
 *  @property {'img'|'source'} target
 *  @property {string} sizes
 *  @property {number[]} widths
 *  @property {string|null} srcset   null when real URLs cannot be built
 *  @property {string} html          the paste-ready block
 *  @property {string[]} notes
 *  @property {boolean} confident
 */
```

`null` means no code can be produced for this image.

- [ ] **Step 1: Write the failing test**

Create `test/fixcode.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFix } from '../src/fixcode.js';
import { isShopifyCdn, shopifyUrl, placeholderName } from '../src/shopify.js';

const point = (viewportWidth, boxWidth, dpr) => ({ viewportWidth, boxWidth, dpr, needed: { width: Math.ceil(boxWidth * dpr), height: 1 } });

const joined = (over) => ({
  identity: 'a.jpg',
  domPath: 'body:nth-of-type(1) > img:nth-of-type(1)',
  from: 'img',
  srcsetAttr: null,
  sizesAttr: null,
  file: { width: 2000, height: 1500 },
  objectFit: 'cover',
  url: 'https://shop.example/a.jpg',
  perViewport: { mobile: point(390, 360, 3), tablet: point(768, 384, 2), desktop: point(1366, 300, 1) },
  partial: false,
  oversizedAt: ['mobile', 'tablet', 'desktop'],
  ...over,
});

test('widths come from what each viewport needs, rounded up to 50', () => {
  const fix = buildFix(joined());
  // needs 1080, 768, 300 -> 1100, 800, 300
  assert.deepEqual(fix.widths, [300, 800, 1100]);
  assert.equal(fix.confident, true);
});

test('a width within 10% of a larger one is dropped', () => {
  const fix = buildFix(joined({ perViewport: { mobile: point(390, 360, 3), tablet: point(768, 530, 2), desktop: point(1366, 300, 1) } }));
  // needs 1080, 1060 -> 1100, 1100 after rounding, so one candidate remains
  assert.deepEqual(fix.widths, [300, 1100]);
});

test('no width above the original file, and a note when the file is too small', () => {
  const fix = buildFix(joined({ file: { width: 500, height: 375 } }));
  assert.deepEqual(fix.widths, [300, 500]);
  assert.ok(
    fix.notes.some((n) => n.includes('original')),
    `expected a note about the original being too small, got ${JSON.stringify(fix.notes)}`,
  );
});

test('Shopify URLs are built for real, keeping other query parameters', () => {
  const fix = buildFix(joined({ url: 'https://cdn.shopify.com/s/files/1/a.jpg?v=17&height=900' }));
  assert.match(fix.srcset, /\?v=17&width=300 300w/);
  assert.ok(!fix.srcset.includes('height=900'), 'height is dropped so it cannot fight width');
  assert.match(fix.html, /src="https:\/\/cdn\.shopify\.com\/s\/files\/1\/a\.jpg\?v=17&width=1100"/);
});

test('a Shopify URL that already has a width is rewritten, not doubled', () => {
  const url = shopifyUrl('https://cdn.shopify.com/s/files/1/a.jpg?width=2000&v=3', 400);
  assert.equal(url, 'https://cdn.shopify.com/s/files/1/a.jpg?width=400&v=3');
});

test('other hosts get placeholder names and no invented srcset', () => {
  const fix = buildFix(joined());
  assert.equal(fix.srcset, null);
  assert.match(fix.html, /a-300\.jpg 300w/);
  assert.ok(
    fix.notes.some((n) => n.includes('produce')),
    'says the files have to be produced',
  );
});

test('placeholder names survive a query string and a missing extension', () => {
  assert.equal(placeholderName('https://e.com/img/hero.jpg?v=2', 400), 'hero-400.jpg');
  assert.equal(placeholderName('https://e.com/img/hero', 400), 'hero-400.jpg');
  assert.equal(placeholderName('//cdn.shopify.com/s/files/1/a.png', 800), 'a-800.png');
});

test('an unparseable URL does not throw', () => {
  assert.equal(isShopifyCdn('not a url'), false);
  // the name is percent-encoded by the URL parser, which is fine: it must not throw
  assert.match(placeholderName('not a url', 400), /-400\.jpg$/);
});

test('a picture source is the paste target', () => {
  const fix = buildFix(joined({ from: 'source' }));
  assert.equal(fix.target, 'source');
  assert.match(fix.html, /^<source /m);
});

test('x descriptors are rewritten as w descriptors, with the reason', () => {
  const fix = buildFix(joined({ srcsetAttr: 'a.jpg 1x, a@2x.jpg 2x' }));
  assert.ok(
    fix.notes.some((n) => n.includes('x descriptors')),
    `expected a note about x descriptors, got ${JSON.stringify(fix.notes)}`,
  );
  assert.match(fix.html, /300w/);
});

test('a partial image is built from what was measured and is not confident', () => {
  const fix = buildFix(joined({ partial: true, perViewport: { mobile: null, tablet: point(768, 384, 2), desktop: point(1366, 300, 1) } }));
  assert.equal(fix.confident, false);
  assert.ok(
    fix.notes.some((n) => n.includes('mobile')),
    `expected the missing viewport to be named, got ${JSON.stringify(fix.notes)}`,
  );
});

test('one measured viewport produces no fix', () => {
  assert.equal(buildFix(joined({ partial: true, perViewport: { mobile: point(390, 360, 3), tablet: null, desktop: null } })), null);
});

test('an image that is not oversized anywhere produces no fix', () => {
  assert.equal(buildFix(joined({ oversizedAt: [] })), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/fixcode.test.js`
Expected: FAIL, cannot find module `../src/fixcode.js`

- [ ] **Step 3: Write minimal implementation**

Create `src/shopify.js`:

```js
/** Shopify's image CDN resizes any file on request with a width= parameter. */
export function isShopifyCdn(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'cdn.shopify.com' || u.pathname.includes('/cdn/shop/');
  } catch {
    return false;
  }
}

/** The same Shopify URL at a given width. Other parameters are kept; height is dropped. */
export function shopifyUrl(url, width) {
  const u = new URL(url);
  u.searchParams.delete('height');
  u.searchParams.set('width', String(width));
  return u.href;
}

/** A name for a file that does not exist yet: hero.jpg at 400 becomes hero-400.jpg. */
export function placeholderName(url, width) {
  let path = url;
  try {
    path = new URL(url, 'https://example.invalid').pathname;
  } catch {}
  const base = path.split('/').filter(Boolean).pop() || 'image';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '.jpg';
  return `${stem}-${width}${ext}`;
}
```

In `src/diagnose.js`, delete the local `isShopifyCdn` and import it instead:

```js
import { parseSrcset } from './srcset.js';
import { isShopifyCdn } from './shopify.js';
```

Create `src/fixcode.js`:

```js
import { buildSizes, VIEWPORT_ORDER } from './sizes.js';
import { isShopifyCdn, shopifyUrl, placeholderName } from './shopify.js';
import { parseSrcset } from './srcset.js';

const STEP = 50;
const CLOSE = 0.9; // a width at or above 90% of a larger one adds nothing

/** Round up to a multiple of 50 and drop widths that sit too close to a larger one. */
function ladder(needed, fileWidth) {
  const rounded = [...new Set(needed.map((n) => Math.ceil(n / STEP) * STEP))].sort((a, b) => a - b);
  const kept = rounded.filter((w, i) => {
    const next = rounded[i + 1];
    return next === undefined || w < next * CLOSE;
  });
  const capped = kept.filter((w) => w <= fileWidth);
  const tooSmall = kept.some((w) => w > fileWidth);
  // The widest slot cannot be served, so the original itself becomes the top of the ladder
  if (tooSmall && !capped.includes(fileWidth)) capped.push(fileWidth);
  return { widths: capped.length ? capped : [fileWidth], tooSmall };
}

const attr = (name, value) => `  ${name}="${value}"`;

/**
 * The code to paste for one image, or null when we cannot say.
 * @param {object} joined one entry from joinViewports
 * @returns {object|null}
 */
export function buildFix(joined) {
  if (joined.oversizedAt.length === 0) return null;

  const sizes = buildSizes(joined.perViewport);
  if (sizes === null) return null;

  const measured = VIEWPORT_ORDER.filter((name) => joined.perViewport[name]);
  const missing = VIEWPORT_ORDER.filter((name) => name in joined.perViewport && !joined.perViewport[name]);
  const { widths, tooSmall } = ladder(
    measured.map((name) => joined.perViewport[name].needed.width),
    joined.file.width,
  );

  const notes = [];
  if (tooSmall) notes.push(`The original file is ${joined.file.width}px wide, which is smaller than the widest slot needs, so the ladder stops there.`);
  if (missing.length) notes.push(`Not measured on ${missing.join(' and ')}, so this is built from ${measured.join(' and ')} only.`);
  const candidates = parseSrcset(joined.srcsetAttr);
  if (candidates.length > 0 && candidates.every((c) => c.w === null)) {
    notes.push('This srcset uses x descriptors, so the box size cannot pick the file. The code below uses w descriptors instead.');
  }

  const shopify = isShopifyCdn(joined.url);
  const srcset = shopify ? widths.map((w) => `${shopifyUrl(joined.url, w)} ${w}w`).join(', ') : null;
  if (!shopify) notes.push('These files do not exist yet: produce them at the widths below, then use the real names.');

  const lines = widths.map((w) => (shopify ? `${shopifyUrl(joined.url, w)} ${w}w` : `${placeholderName(joined.url, w)} ${w}w`));
  const tag = joined.from === 'source' ? 'source' : 'img';
  const parts = [`<${tag}`];
  if (shopify && tag === 'img') parts.push(attr('src', shopifyUrl(joined.url, widths[widths.length - 1])));
  parts.push(attr('srcset', lines.join(',\n          ')));
  parts.push(attr('sizes', sizes));
  const html = `<!-- keep this image's other attributes (alt, class, loading) -->\n${parts.join('\n')}>`;

  return {
    target: tag,
    sizes,
    widths,
    srcset,
    html,
    notes,
    confident: !joined.partial,
  };
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node --test test/fixcode.test.js`
Expected: PASS, 13 tests

Run: `npm test`
Expected: PASS, including the existing `diagnose` tests after the import change

- [ ] **Step 5: Commit**

```bash
git add src/shopify.js src/fixcode.js src/diagnose.js test/fixcode.test.js package.json
git commit -m "feat: generate paste-ready srcset and sizes per image"
```

Add `test/fixcode.test.js` to the `test` script before committing.

---

### Task 5: The markdown file

**Files:**
- Create: `src/markdown.js`
- Create: `test/markdown.test.js`

**Interfaces:**
- Consumes: `Fix` objects from Task 4 plus their joined entries.
- Produces: `formatMarkdown(report, fixes) -> string`, where `fixes` is `{ joined, fix }[]` and `report` is the object the CLI already builds (`{ url, version, threshold, viewports }`).

- [ ] **Step 1: Write the failing test**

Create `test/markdown.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMarkdown } from '../src/markdown.js';

const entry = {
  joined: { url: 'https://shop.example/a.jpg', file: { width: 2000, height: 1500 }, perViewport: { mobile: { boxWidth: 360 }, tablet: null, desktop: { boxWidth: 300 } } },
  fix: {
    target: 'img',
    sizes: '(max-width: 480px) 441px, 300px',
    widths: [300, 1100],
    srcset: null,
    html: '<img\n  srcset="a-300.jpg 300w"\n  sizes="300px">',
    notes: ['These files do not exist yet: produce them at the widths below, then use the real names.'],
    confident: false,
  },
};

const report = { url: 'https://shop.example/', version: '0.3.0', threshold: 2, viewports: [] };

test('writes one fenced block per image with its notes', () => {
  const md = formatMarkdown(report, [entry]);
  assert.match(md, /^# Image fixes for https:\/\/shop\.example\//m);
  assert.match(md, /```html\n<img/);
  assert.match(md, /These files do not exist yet/);
  assert.match(md, /not fully measured/i, 'an unconfident fix is marked');
  assert.match(md, /wp_calculate_image_sizes/, 'the WordPress note is there once');
  assert.equal(md.match(/wp_calculate_image_sizes/g).length, 1);
});

test('says so plainly when there is nothing to fix', () => {
  const md = formatMarkdown(report, []);
  assert.match(md, /No images needed a fix/);
  assert.ok(!md.includes('```html'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/markdown.test.js`
Expected: FAIL, cannot find module `../src/markdown.js`

- [ ] **Step 3: Write minimal implementation**

Create `src/markdown.js`:

```js
import { shortName } from './format.js';

const WORDPRESS_NOTE = `## WordPress

WordPress builds srcset itself from the sizes it has registered, so there is no per-image
snippet to paste. Register the widths above with \`add_image_size\`, regenerate thumbnails,
and return the \`sizes\` value above from the \`wp_calculate_image_sizes\` filter.`;

/**
 * The fixes as markdown, so they paste into an issue, a pull request or a chat.
 * @param {{url:string, version:string}} report
 * @param {{joined:object, fix:object}[]} fixes
 */
export function formatMarkdown(report, fixes) {
  const head = `# Image fixes for ${report.url}\n\nFrom find-oversized-images ${report.version}.`;
  if (fixes.length === 0) return `${head}\n\nNo images needed a fix.\n`;

  const blocks = fixes.map(({ joined, fix }) => {
    const title = `## ${shortName(joined.url)}`;
    const facts = `File is ${joined.file.width}x${joined.file.height}. Paste on the \`<${fix.target}>\`.`;
    const warning = fix.confident ? '' : '\n\n**Not fully measured.** Check this one before pasting.';
    const notes = fix.notes.length ? `\n\n${fix.notes.map((n) => `- ${n}`).join('\n')}` : '';
    return `${title}\n\n${facts}${warning}\n\n\`\`\`html\n${fix.html}\n\`\`\`${notes}`;
  });

  return `${head}\n\n${blocks.join('\n\n')}\n\n${WORDPRESS_NOTE}\n`;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node --test test/markdown.test.js`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/markdown.js test/markdown.test.js package.json
git commit -m "feat: write the fixes as markdown"
```

Add `test/markdown.test.js` to the `test` script before committing.

---

### Task 6: The report section

**Files:**
- Modify: `src/html.js` (add a section builder, extend `STYLE`, extend `formatHtml`)
- Modify: `test/html.test.js`

**Interfaces:**
- Consumes: `Fix` objects from Task 4.
- Produces: `formatHtml(report, { generatedAt, fixes })` accepts a new `fixes` option, `{ joined, fix }[]`, defaulting to `[]`. The signature stays backward compatible.

- [ ] **Step 1: Write the failing test**

Add to `test/html.test.js`:

```js
test('adds a paste-ready fixes section with no script', () => {
  const fixes = [
    {
      joined: { url: 'https://shop.example/a.jpg', file: { width: 2000, height: 1500 } },
      fix: {
        target: 'img',
        sizes: '300px',
        widths: [300],
        srcset: null,
        html: '<img\n  srcset="a-300.jpg 300w"\n  sizes="300px">',
        notes: ['These files do not exist yet: produce them at the widths below, then use the real names.'],
        confident: true,
      },
    },
  ];
  const html = formatHtml({ url: 'https://shop.example/', version: '0.3.0', threshold: 2, viewports: [] }, { fixes });

  assert.match(html, /Paste-ready fixes/);
  assert.match(html, /user-select:all/);
  assert.match(html, /Click the code, then Ctrl\+C/);
  assert.match(html, /&lt;img/, 'the code is escaped, not live markup');
  assert.ok(!/<script/i.test(html), 'still no scripts');
  assert.match(html, /default-src &#39;none&#39;|default-src 'none'/, 'CSP is unchanged');
});

test('marks a fix that could not be fully measured', () => {
  const fixes = [
    {
      joined: { url: 'https://shop.example/b.jpg', file: { width: 900, height: 600 } },
      fix: { target: 'source', sizes: '92vw', widths: [800], srcset: null, html: '<source srcset="b-800.jpg 800w" sizes="92vw">', notes: [], confident: false },
    },
  ];
  const html = formatHtml({ url: 'https://shop.example/', version: '0.3.0', threshold: 2, viewports: [] }, { fixes });
  assert.match(html, /Not fully measured/);
});

test('no fixes section when there are no fixes', () => {
  const html = formatHtml({ url: 'https://shop.example/', version: '0.3.0', threshold: 2, viewports: [] }, {});
  assert.ok(!html.includes('Paste-ready fixes'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/html.test.js`
Expected: FAIL, `Paste-ready fixes` not found

- [ ] **Step 3: Write minimal implementation**

In `src/html.js`, add to `STYLE`:

```css
.code{background:var(--thumb);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto;user-select:all;font:13px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;margin:8px 0}
.hint{color:var(--muted);font-size:13px;margin:0}
.warn{background:var(--accent-soft);border-radius:8px;padding:8px 10px;margin:8px 0;font-weight:600}
.fixnotes{color:var(--muted);font-size:13px;margin:6px 0 0;padding-left:18px}
```

Add the section builder above `formatHtml`:

```js
const WORDPRESS_NOTE =
  'On WordPress there is no per-image snippet: WordPress builds srcset from its registered sizes. ' +
  'Register these widths with add_image_size, regenerate thumbnails, and return the sizes value from the wp_calculate_image_sizes filter.';

function fixHtml({ joined, fix }) {
  const warning = fix.confident ? '' : '<p class="warn">Not fully measured. Check this one before pasting.</p>';
  const notes = fix.notes.length ? `<ul class="fixnotes">${fix.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
  return (
    `<article class="group">` +
    `<div class="head"><span>${esc(shortName(joined.url))}</span>` +
    `<span class="sizes">file ${joined.file.width}x${joined.file.height} &middot; paste on the &lt;${esc(fix.target)}&gt;</span></div>` +
    `${warning}<p class="hint">Click the code, then Ctrl+C.</p><pre class="code">${esc(fix.html)}</pre>${notes}` +
    `</article>`
  );
}

function fixesHtml(fixes) {
  if (fixes.length === 0) return '';
  return `<section><h2>Paste-ready fixes</h2><p class="summary">${fixes.length === 1 ? '1 image' : `${fixes.length} images`}, built from every viewport that was measured.</p>${fixes
    .map(fixHtml)
    .join('')}<p class="note">${esc(WORDPRESS_NOTE)}</p></section>`;
}
```

Change the signature and the body of `formatHtml`:

```js
export function formatHtml(report, { generatedAt = new Date(), fixes = [] } = {}) {
```

and insert the new section after the viewport sections:

```js
${report.viewports.map((vp) => viewportHtml(vp, report.threshold)).join('\n')}
${fixesHtml(fixes)}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node --test test/html.test.js`
Expected: PASS

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/html.js test/html.test.js
git commit -m "feat: paste-ready fixes section in the HTML report"
```

---

### Task 7: Wire it into the CLI

**Files:**
- Modify: `src/cli.js` (`VIEWPORTS`, `HELP`, `parseCli`, `run`)
- Modify: `src/format.js` (the pointer line)
- Modify: `test/cli.test.js`
- Modify: `test/integration.test.js`

**Interfaces:**
- Consumes: `joinViewports` (Task 2), `buildFix` (Task 4), `formatMarkdown` (Task 5), `formatHtml` with `fixes` (Task 6).
- Produces: a `--tablet` flag, a `--fix-code` flag writing `image-fixes.md`, a top-level `fixes` array in `--json`, and one pointer line after the table.

- [ ] **Step 1: Write the failing test**

Add to `test/cli.test.js`:

```js
test('a default run measures three viewports', () => {
  const opts = parseCli(['https://example.com']);
  assert.deepEqual(
    opts.viewports.map((v) => v.name),
    ['mobile', 'tablet', 'desktop'],
  );
});

test('--tablet picks only the tablet viewport', () => {
  const opts = parseCli(['--tablet', 'https://example.com']);
  assert.deepEqual(
    opts.viewports.map((v) => [v.name, v.width, v.dpr]),
    [['tablet', 768, 2]],
  );
});

test('--fix-code is off by default', () => {
  assert.equal(parseCli(['https://example.com']).fixCode, false);
  assert.equal(parseCli(['--fix-code', 'https://example.com']).fixCode, true);
});
```

Add to `test/integration.test.js`:

```js
test('--fix-code writes a markdown file and the table points at it', { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fix-code-'));
  try {
    const out = [];
    const code = await run([`${server.url}/page.html`, '--fix-code'], {
      stdout: { write: (s) => out.push(s), isTTY: false },
      stderr: { write: () => {} },
      env: {},
      cwd: dir,
      openFile: () => {},
    });
    assert.equal(code, 0);
    const table = out.join('');
    assert.match(table, /Paste-ready srcset and sizes/);
    const md = readFileSync(join(dir, 'image-fixes.md'), 'utf8');
    assert.match(md, /```html/);
    assert.match(md, /sizes="/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--json carries a top-level fixes array', { skip }, async () => {
  const out = [];
  await run([`${server.url}/page.html`, '--json'], {
    stdout: { write: (s) => out.push(s), isTTY: false },
    stderr: { write: () => {} },
    env: {},
    cwd: mkdtempSync(join(tmpdir(), 'fix-json-')),
    openFile: () => {},
  });
  const report = JSON.parse(out.join(''));
  assert.equal(report.viewports.length, 3);
  assert.ok(Array.isArray(report.fixes));
  for (const entry of report.fixes) {
    assert.ok(typeof entry.fix.sizes === 'string');
    assert.ok(Array.isArray(entry.fix.widths));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cli.test.js`
Expected: FAIL, the default run returns two viewports and `fixCode` is undefined

- [ ] **Step 3: Write minimal implementation**

In `src/cli.js`, add the viewport and the flags:

```js
export const VIEWPORTS = {
  mobile: { name: 'mobile', width: 390, height: 844, dpr: 3, mobile: true },
  tablet: { name: 'tablet', width: 768, height: 1024, dpr: 2, mobile: true },
  desktop: { name: 'desktop', width: 1366, height: 768, dpr: 1, mobile: false },
};
```

In `HELP`, under the existing viewport flags:

```
  --tablet             only the tablet viewport (768x1024 @2x)
  --fix-code           also write image-fixes.md with paste-ready srcset and sizes
```

In `parseCli`, add `tablet: { type: 'boolean' }` and `'fix-code': { type: 'boolean' }` to `options`, and replace the viewport choice:

```js
  const picked = [v.mobile && VIEWPORTS.mobile, v.tablet && VIEWPORTS.tablet, v.desktop && VIEWPORTS.desktop].filter(Boolean);
  let viewports;
  if (width !== undefined) {
    viewports = [{ name: 'custom', width, height: height ?? 800, dpr: dpr ?? 1, mobile: false }];
  } else if (picked.length > 0) {
    viewports = picked;
  } else {
    viewports = [VIEWPORTS.mobile, VIEWPORTS.tablet, VIEWPORTS.desktop];
  }
```

and return `fixCode: Boolean(v['fix-code'])`.

In `run`, after the report is built and before writing output:

```js
    const fixes = joinViewports(viewports)
      .map((joined) => ({ joined, fix: buildFix(joined) }))
      .filter((entry) => entry.fix !== null);

    const report = { url: opts.url, version: VERSION, threshold: opts.threshold, viewports, fixes };
```

Pass the fixes to the table and the report:

```js
    stdout.write(opts.json ? formatJson(report) : formatTable(report, { all: opts.all, links, fixes: fixes.length }));
```

```js
      writeFileSync(file, formatHtml(report, { fixes }));
```

and write the markdown file when asked, next to the existing `--html` block:

```js
    if (opts.fixCode) {
      const file = resolve(cwd, FIX_FILE);
      writeFileSync(file, formatMarkdown(report, fixes));
      (opts.json ? stderr : stdout).write(`\nFix code saved to ${file}\n`);
    }
```

with `const FIX_FILE = 'image-fixes.md';` next to `HTML_FILE`, and the three new imports:

```js
import { joinViewports } from './join.js';
import { buildFix } from './fixcode.js';
import { formatMarkdown } from './markdown.js';
```

In `src/format.js`, extend `formatTable` to append the pointer line:

```js
export function formatTable(report, { all = false, links = false, fixes = 0 } = {}) {
  const sections = report.viewports.map((vp) => formatViewport(vp, report.threshold, { all, links }));
  const pointer = fixes
    ? '\nPaste-ready srcset and sizes for these images: run with --fix-code (writes image-fixes.md) or --html\n'
    : '';
  return `${report.url}\n\n${sections.join('\n\n')}\n${pointer}`;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node --test test/cli.test.js test/format.test.js`
Expected: PASS

Run: `npm test`
Expected: PASS. Any existing assertion that counted two viewports is updated to three, and nothing else changes.

- [ ] **Step 5: Commit**

```bash
git add src/cli.js src/format.js test/cli.test.js test/integration.test.js
git commit -m "feat: three viewports, --tablet and --fix-code"
```

---

### Task 8: Prove it on a real page, then release

**Files:**
- Modify: `test/integration.test.js` (the end-to-end proof)
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json` (version)

**Interfaces:**
- Consumes: everything above.
- Produces: 0.3.0.

- [ ] **Step 1: Write the failing test**

This is the test that proves the feature rather than the code: the generated `sizes`, put back on the page, must make the browser pick the file we intended.

Add to `test/integration.test.js`:

```js
test('the generated sizes makes the browser pick the intended candidate', { skip }, async () => {
  const browser = await launchBrowser();
  try {
    // Two real viewports: one measurement cannot produce a sizes value, by design
    const analyzedAt = [];
    for (const viewport of [VIEWPORTS.mobile, VIEWPORTS.desktop]) {
      const raw = await collectViewport(browser, `${server.url}/page.html`, viewport, { timeout: 30000 });
      analyzedAt.push(analyzeViewport({ viewport, raw, bytesByUrl: raw.bytesByUrl, threshold: 2 }));
    }
    const desktop = analyzedAt[1];
    const target = desktop.images.find((i) => i.oversized && i.srcset);
    assert.ok(target, 'the fixture has an oversized image with a srcset');

    const entry = joinViewports(analyzedAt).find((j) => j.identity === target.identity);
    const fix = buildFix(entry);
    assert.ok(fix, 'a fix was produced');

    // Put the generated sizes back on a page and ask the browser what it picks
    const context = await browser.newContext({ viewport: { width: VIEWPORTS.desktop.width, height: VIEWPORTS.desktop.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${server.url}/page.html`);
    const picked = await page.evaluate(
      ({ identity, sizes }) => {
        const img = [...document.images].find((i) => i.getAttribute('srcset') === identity || i.getAttribute('src') === identity);
        img.sizes = sizes;
        return new Promise((resolve) => setTimeout(() => resolve(img.currentSrc), 200));
      },
      { identity: entry.identity, sizes: fix.sizes },
    );
    await context.close();

    const pickedWidth = Number(/(\d+)x\d+\.png/.exec(picked)?.[1] ?? 0);
    assert.ok(pickedWidth > 0, `expected a sized fixture file, got ${picked}`);
    assert.ok(
      pickedWidth < target.file.width,
      `expected the generated sizes to pick a smaller file than ${target.file.width}, got ${pickedWidth}`,
    );
  } finally {
    await browser.close();
  }
});
```

Add `analyzeViewport`, `joinViewports`, `buildFix` and `VIEWPORTS` to the imports in that file.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration.test.js`
Expected: FAIL if the fixture has no oversized image carrying a srcset. In that case add one to `test/fixtures/page.html`, using the existing PNGs:

```html
<p>case: srcset too coarse
<img src="1600x800.png?c=coarse" srcset="1600x800.png?c=coarse 1600w, 400x200.png?c=coarse-small 400w" sizes="100vw" style="width:300px">
```

and add nothing to `test/helpers/server.js`, which already serves both PNGs.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: PASS, every test

- [ ] **Step 4: Run it on a real store and read the output yourself**

```bash
node bin/find-oversized-images.js https://abayaforwomen.com --html --fix-code
```

Check by eye: the `sizes` values are plausible for that layout, Shopify URLs carry `width=`, and nothing says `undefined` or `NaN`. This step is judgement, not an assertion, and it is the one that catches a formula that is technically green and practically wrong.

- [ ] **Step 5: Update the docs and the version**

In `package.json`, set `"version": "0.3.0"`.

In `CHANGELOG.md`, add at the top:

```markdown
## 0.3.0

- Paste-ready `srcset` and `sizes` for every oversized image, in the HTML report and, with
  `--fix-code`, in `image-fixes.md`. Real working URLs on the Shopify CDN; widths and
  placeholder names elsewhere.
- A tablet viewport (768x1024 @2x) is now measured, so the middle range is measured rather
  than guessed. New `--tablet` flag.
- `--json` gains a top-level `fixes` array.

Three things change in a default run: it measures three viewports instead of two, so it
takes longer, and `--fail-on` can now fail on an image that is only oversized on tablet.
```

In `README.md`, document `--tablet` and `--fix-code` in the options list, and add a short
section showing one generated block. Say plainly that the report has no scripts, so the
code block is click-then-Ctrl+C rather than a Copy button.

- [ ] **Step 6: Commit**

```bash
git add test/integration.test.js test/fixtures/page.html README.md CHANGELOG.md package.json
git commit -m "feat: prove the generated sizes picks the right file, and release 0.3.0"
```

Publishing stays with the owner: `git push --follow-tags` then `npm publish`, with a VPN on.
