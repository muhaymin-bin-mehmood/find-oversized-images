/**
 * @typedef {object} ImageBox
 * @property {number} naturalWidth   file width in pixels
 * @property {number} naturalHeight  file height in pixels
 * @property {number} boxWidth       content box width in CSS pixels
 * @property {number} boxHeight      content box height in CSS pixels
 * @property {string} objectFit      computed object-fit value
 */

/**
 * How much the browser scales the file to draw it in its box.
 * @param {ImageBox} img
 */
export function scaleFor({ naturalWidth, naturalHeight, boxWidth, boxHeight, objectFit }) {
  const sx = boxWidth / naturalWidth;
  const sy = boxHeight / naturalHeight;
  switch (objectFit) {
    case 'contain':
      return Math.min(sx, sy);
    case 'cover':
      return Math.max(sx, sy);
    case 'none':
      return 1;
    case 'scale-down':
      return Math.min(1, sx, sy);
    default:
      // fill stretches each axis on its own; the axis that needs more pixels sets the limit
      return Math.max(sx, sy);
  }
}

// Float noise like 765.0000000001 must not round up to 766
const ceil = (n) => Math.ceil(n - 1e-6);

/**
 * Pixels the screen can use, and how many times wider the file is than that.
 * @param {ImageBox} img
 * @param {number} dpr device pixel ratio
 */
export function measure(img, dpr) {
  const s = scaleFor(img);
  return {
    needed: { width: ceil(img.naturalWidth * s * dpr), height: ceil(img.naturalHeight * s * dpr) },
    extra: 1 / (s * dpr),
  };
}

/** Share of the file's pixels that never reach the screen. */
export function unusedPixels(extra) {
  return Math.max(0, 1 - 1 / (extra * extra));
}

/**
 * Rough bytes saved by resizing to the needed width. Scales by width, not area,
 * because smaller images cost more bytes per pixel. This keeps it on the low side.
 * @param {number|null} bytes
 * @param {number} extra unrounded
 */
export function estimateSaving(bytes, extra) {
  if (bytes == null || extra <= 1) return null;
  return Math.round(bytes * (1 - 1 / extra));
}
