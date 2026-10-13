# find-oversized-images

[![CI](https://github.com/muhaymin-bin-mehmood/find-oversized-images/actions/workflows/ci.yml/badge.svg)](https://github.com/muhaymin-bin-mehmood/find-oversized-images/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/find-oversized-images)](https://www.npmjs.com/package/find-oversized-images)

Find images that are much bigger than the size they are shown at.

Lighthouse says "properly size images". This tells you which ones, by how much, on a phone and on a desktop, roughly how many KB you would save, and why the browser got a file that big (no `srcset`, a wrong `sizes`, or no small enough file).

```bash
npx find-oversized-images https://example.com
```

It opens the page in the Chrome or Edge you already have (headless, no browser download), once at phone size and once at desktop size. For every `<img>` it compares the file's pixels with the pixels the screen can actually use.

No browser window opens. The browser runs in the background and the report prints in your terminal. Add `--html` for a report with thumbnails you can click, or `--json` for the raw data.

## Output

```
https://example.com/

Mobile 390x844 @3x   42 images, 0 oversized, 2 not loaded
  No images at or above 2x.

Desktop 1366x768 @1x   42 images, 26 oversized, 2 not loaded
  extra  unused  file       shown      size  est. save  image
   3.3x     91%  2560x1442  765x235  559 KB    ~392 KB  hero.jpg  <- LCP
    Fix: sizes is "100vw" but the box is 765px wide, so the browser picks a bigger file. srcset already has 800w; make sizes match the box.
   2.9x     88%  800x1200   280x392  1.1 MB    ~710 KB  25 images, e.g. product-1.jpg
    Fix: No srcset, so every screen downloads this 800px file. Add a srcset that includes a 280w version.
  Total: ~1.1 MB could be saved (estimate, conservative)
```

- **extra**: how many times wider the file is than the screen can use. 1 is right-sized. Images at 2 or more are listed (change it with `--threshold`).
- **unused**: share of the file's pixels that never reach the screen.
- **file / shown**: file size in pixels, and the box it is drawn in (CSS pixels).
- **size**: bytes over the network, as the browser reports them. Works for cross-origin images too.
- **est. save**: a rough, deliberately low estimate. See below.
- `<- LCP` marks the Largest Contentful Paint image. Fix that one first. `x8` means the same file is used 8 times.
- **25 images, e.g.**: images with the same box, the same `extra` and the same kind of fix are one row. Use `--all` to list each one.
- **Fix**: why the browser got a file that big, and what to change:
  - *No srcset*: every screen gets the same file. Add smaller versions in a `srcset`.
  - *sizes*: `srcset` already has a small enough file, but `sizes` tells the browser the image is wider than its box.
  - *Smallest file in srcset*: `srcset` has no file small enough for this box.
  - *x descriptors*: `srcset` with `1x`/`2x` follows the screen density, not the box size.
  - Shopify CDN images also get the exact `width=` to request.

In Windows Terminal, VS Code, iTerm2, WezTerm and kitty the image names are links: Ctrl+click (Cmd+click on a Mac) opens the file. The classic Windows console shows plain text. Set `FORCE_HYPERLINK=0` or `1` to override.

## HTML report

```bash
npx find-oversized-images https://example.com --html
```

Saves `oversized-report.html` in the current folder and opens it in your browser. Each group shows its fix and thumbnails of the images; click one to open the file. The page has no scripts, and thumbnails load straight from the site with no referrer. Add `--no-open` to only save it. It is never opened when the `CI` environment variable is set.

## Options

| Option | What it does |
|---|---|
| `--mobile` | Only the phone viewport (390x844 at 3x) |
| `--desktop` | Only the desktop viewport (1366x768 at 1x) |
| `--width <px>` | Custom viewport width. Replaces the defaults. |
| `--height <px>` | Custom viewport height (default 800) |
| `--dpr <n>` | Custom device pixel ratio (default 1) |
| `--threshold <n>` | List images at or above this `extra` (default 2) |
| `--fail-on <n>` | Exit with code 1 if any image has `extra` of n or more |
| `--all` | One row per image, instead of grouping images with the same problem |
| `--html` | Also save `oversized-report.html` with thumbnails and fixes, and open it |
| `--no-open` | With `--html`, save the report but do not open it |
| `--json` | Print JSON with every image, not just the oversized ones. Oversized images include `srcset`, `sizes` and a `fix` with `reason` and `advice`. |
| `--timeout <ms>` | Page load timeout, also used if the page hangs after it loads (default 30000) |
| `--browser-path <path>` | Use this Chrome or Edge executable |

## Use it in CI

```bash
npx find-oversized-images https://staging.example.com --fail-on 3
```

| Exit code | Meaning |
|---|---|
| 0 | Ran fine |
| 1 | An image crossed `--fail-on` |
| 2 | Something went wrong (bad URL, no browser, page failed to load) |

## How the math works

For each image, the tool takes its content box (without padding and border) and works out how much the browser scales the file to draw it, based on `object-fit`:

| object-fit | scale |
|---|---|
| `fill` (default) | the larger of width ratio and height ratio, because each axis is stretched on its own |
| `contain` | the smaller ratio |
| `cover` | the larger ratio (the overflow is cropped) |
| `none` | 1 |
| `scale-down` | like `contain`, but never above 1 |

Then `needed width = file width x scale x devicePixelRatio`, and `extra = file width / needed width`.

Device pixel ratio matters. A 400px box needs a 400px file on a normal laptop and a 1200px file on a phone at 3x. That is why both sizes are checked by default.

`file width` is the real width of the downloaded file. With `srcset`, the browser reports a "density-corrected" width instead (a 1600px file picked for an 800px slot reads as 800px), so the tool decodes the file on its own to get its real pixels.

### Why the saving is only an estimate

Shrinking an image by `extra` in each direction cuts its pixels by `extra` squared, but file size does not drop that fast, because small images use more bytes per pixel. So the tool scales bytes by width only:

```
est. save = size x (1 - 1 / extra)
```

For a 3.3x image that says 70%, where pixel math says 91%. The real number is usually somewhere in between. Use it to decide what to fix first, not as a measurement.

## Limits

- Only `<img>` elements. CSS background images, images inside iframes or shadow DOM, and canvas are not checked.
- SVG files are skipped. They scale to any size, so they cannot be oversized in this sense.
- One page per run.
- It reports. It does not resize anything.
- It scrolls the page to load lazy images, but images behind a click (tabs, carousels) can show up as "not loaded".
- `size` is `unknown` when the browser cannot report it, and those images are left out of the total.

If you want a fuller report for a public page, with fixes, I also built a [website image auditor](https://batchset.com/tools/website-image-auditor) that runs in the browser with nothing to install.

## Background

This started as a DevTools console snippet: [Find oversized images on any page with one console snippet](https://dev.to/muhayminbinmehmood/find-oversized-images-on-any-page-with-one-console-snippet-1bn6). The snippet is still handy behind a login. This CLI adds both viewport sizes, real transfer sizes, `object-fit: fill` handling, and a CI exit code.

## Requirements

Node 20 or newer, and Chrome or Edge installed. If neither is found, pass `--browser-path`.

## License

MIT
