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
  if (tooSmall) {
    notes.push(
      `The original file is ${joined.file.width}px wide, which is smaller than the widest slot needs, so the ladder stops there.`,
    );
  }
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
