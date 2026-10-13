/**
 * Fold oversized images with the same box, the same extra and the same kind of fix into
 * one group, so a grid of 70 product cards reads as one problem, not 70 rows.
 * The LCP image is never folded in: it is the one to fix first.
 * Keeps the order in which groups are first seen (the input is sorted by extra).
 * @param {object[]} flagged oversized findings from analyze
 */
export function groupFindings(flagged) {
  const groups = new Map();
  for (const image of flagged) {
    const key = image.isLcp
      ? `lcp:${image.url}`
      : [image.extra, image.shown.width, image.shown.height, image.fix?.reason ?? ''].join('|');
    let group = groups.get(key);
    if (!group) {
      group = {
        images: [],
        extra: image.extra,
        unusedPixels: image.unusedPixels,
        file: image.file,
        shown: image.shown,
        fix: image.fix ?? null,
        isLcp: image.isLcp,
      };
      groups.set(key, group);
    }
    group.images.push(image);
  }
  return [...groups.values()].map((g) => ({ ...g, bytes: sumKnown(g.images, 'bytes'), estSavingBytes: sumKnown(g.images, 'estSavingBytes') }));
}

function sumKnown(images, field) {
  const known = images.filter((i) => i[field] != null);
  return known.length ? known.reduce((sum, i) => sum + i[field], 0) : null;
}
