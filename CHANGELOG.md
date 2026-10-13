# Changelog

## 0.3.0

- Paste-ready `srcset` and `sizes` for every oversized image, in the `--html` report and, with `--fix-code`, in `image-fixes.md`. Real working URLs on the Shopify CDN; widths and placeholder names elsewhere. The report has no Copy button on purpose: it ships no scripts, so the code block selects itself on a click.
- A tablet viewport (768x1024 at 2x, with an iPad user agent) is now measured, so the middle range is measured rather than guessed. New `--tablet` flag.
- Images that could not be measured at every viewport are marked, with the missing viewport named, instead of quietly producing code from partial data.
- `--json` gains a top-level `fixes` array.

Three things change in a default run: it measures three viewports instead of two, so it takes longer, and `--fail-on` can now fail on an image that is only oversized on tablet.

## 0.2.0

- Each oversized image now says why it got a file that big and what to change: no `srcset`, a `sizes` that does not match the box, no small enough file in `srcset`, or `x` descriptors. `<picture>` sources are read the way the browser picks them. Shopify CDN images also get the exact `width=` to request.
- Fixed: images with `srcset` were measured at the browser's density-corrected width, not the real file width, so they were under-reported. A 1600px file in a 200px box showed as 4x instead of 8x.
- Images with the same box, `extra` and kind of fix are grouped into one row. `--all` lists every image.
- `--html` saves `oversized-report.html` with thumbnails that link to each file, and opens it. `--no-open` only saves it.
- Image names are clickable links in terminals that support them.
- JSON: each image has `srcset` and `sizes`, and oversized images have `fix` with `reason` and `advice`.

## 0.1.1

- Homepage points to https://batchset.com/tools/find-oversized-images. README says no browser window opens.

## 0.1.0

- First release.
