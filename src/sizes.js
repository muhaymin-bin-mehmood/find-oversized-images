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
