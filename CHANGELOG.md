# Changelog

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
