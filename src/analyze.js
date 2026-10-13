import { measure, unusedPixels, estimateSaving } from './math.js';
import { diagnose } from './diagnose.js';

const round = (n, places) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/**
 * Turn the raw data from one viewport into findings.
 * @param {object} args
 * @param {{name:string, width:number, height:number, dpr:number}} args.viewport
 * @param {{images: object[], notLoaded: number, lcp: {url: string|null, isImage: boolean}|null}} args.raw
 * @param {Map<string, number>} args.bytesByUrl transfer size per image URL
 * @param {number} args.threshold flag images whose rounded extra is at or above this
 */
export function analyzeViewport({ viewport, raw, bytesByUrl, threshold }) {
  // Same file used several times (carousels, repeated logos): the use that
  // needs the most pixels decides how big the file has to be.
  const groups = new Map();
  for (const img of raw.images) {
    const m = measure(img, viewport.dpr);
    const group = groups.get(img.url);
    if (!group) {
      groups.set(img.url, { img, m, count: 1 });
    } else {
      group.count += 1;
      if (m.extra < group.m.extra) Object.assign(group, { img, m });
    }
  }

  const lcpUrl = raw.lcp?.isImage ? raw.lcp.url : null;
  const images = [...groups.values()].map(({ img, m, count }) => {
    const extra = round(m.extra, 1);
    const bytes = bytesByUrl.get(img.url) ?? null;
    const finding = {
      url: img.url,
      file: { width: img.naturalWidth, height: img.naturalHeight },
      shown: { width: Math.round(img.boxWidth), height: Math.round(img.boxHeight) },
      needed: m.needed,
      objectFit: img.objectFit || 'fill',
      extra,
      unusedPixels: round(unusedPixels(m.extra), 2),
      bytes,
      estSavingBytes: estimateSaving(bytes, m.extra),
      count,
      isLcp: lcpUrl !== null && img.url === lcpUrl,
      oversized: extra >= threshold,
      srcset: img.srcset ?? null,
      sizes: img.sizes ?? null,
    };
    finding.fix = finding.oversized ? diagnose(finding, viewport) : null;
    return finding;
  });
  images.sort((a, b) => b.extra - a.extra);

  const flagged = images.filter((i) => i.oversized);
  return {
    name: viewport.name,
    width: viewport.width,
    height: viewport.height,
    dpr: viewport.dpr,
    imageCount: raw.images.length + raw.notLoaded,
    notLoaded: raw.notLoaded,
    lcp: raw.lcp,
    images,
    totals: {
      oversized: flagged.length,
      estSavingBytes: flagged.reduce((sum, i) => sum + (i.estSavingBytes ?? 0), 0),
      unknownSizes: images.filter((i) => i.bytes === null).length,
    },
  };
}
