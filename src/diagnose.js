import { parseSrcset } from './srcset.js';
import { isShopifyCdn } from './shopify.js';

const MAX_SIZES_SHOWN = 60;

const shorten = (text) => (text.length > MAX_SIZES_SHOWN ? `${text.slice(0, MAX_SIZES_SHOWN - 3)}...` : text);

const shopifyHint = (url, need) => (isShopifyCdn(url) ? ` Shopify resizes on request: the same URL with width=${need} gives that file.` : '');

/**
 * Why an oversized image got a file that big, and what to change.
 * Reads the srcset and sizes the browser used for this image.
 * @param {{url:string, file:{width:number}, shown:{width:number}, needed:{width:number}, srcset:string|null, sizes:string|null}} finding
 * @param {{width:number}} viewport
 * @returns {{reason: 'no-srcset'|'sizes'|'no-small-candidate'|'density', advice: string}}
 */
export function diagnose(finding, viewport) {
  const need = finding.needed.width;
  const candidates = parseSrcset(finding.srcset);

  if (candidates.length === 0) {
    return {
      reason: 'no-srcset',
      advice: `No srcset, so every screen downloads this ${finding.file.width}px file. Add a srcset that includes a ${need}w version.${shopifyHint(finding.url, need)}`,
    };
  }

  const widths = candidates.filter((c) => c.w !== null).map((c) => c.w).sort((a, b) => a - b);
  if (widths.length === 0) {
    return {
      reason: 'density',
      advice: `srcset uses x descriptors, so the box size does not pick the file. Make the 1x file ${need}px wide, or switch to w descriptors with a ${need}w version.`,
    };
  }

  // The browser should have taken the smallest file that still covers the box
  const fits = widths.find((w) => w >= need);
  if (fits !== undefined && fits < finding.file.width) {
    const sizes = (finding.sizes ?? '').trim();
    const what = sizes
      ? `sizes is "${shorten(sizes)}" but the box is ${finding.shown.width}px wide, so the browser picks a bigger file.`
      : `No sizes attribute: the browser assumes the image is ${viewport.width}px wide, but the box is ${finding.shown.width}px.`;
    return {
      reason: 'sizes',
      advice: `${what} srcset already has ${fits}w; make sizes match the box.`,
    };
  }

  return {
    reason: 'no-small-candidate',
    advice: `The smallest file in srcset is ${widths[0]}w. Add a ${need}w version.${shopifyHint(finding.url, need)}`,
  };
}
