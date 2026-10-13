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

const measuredPoints = (perViewport) =>
  VIEWPORT_ORDER.filter((name) => perViewport[name]).map((name) => ({ name, ...perViewport[name] }));

/**
 * How the box behaves across the measured viewports: one fixed width, a share of the
 * viewport, or neither.
 * @returns {{kind:'fixed', px:number}|{kind:'vw', ratio:number}|{kind:'mixed'}|null}
 */
function shapeOf(points) {
  if (points.length < 2) return null;

  const boxes = points.map((p) => p.boxWidth);
  const boxMean = mean(boxes);
  if (boxes.every((b) => Math.abs(b - boxMean) <= PX_TOLERANCE)) {
    return { kind: 'fixed', px: Math.ceil(Math.max(...boxes)) };
  }

  const ratios = points.map((p) => p.boxWidth / p.viewportWidth);
  const ratioMean = mean(ratios);
  if (ratios.every((r) => Math.abs(r - ratioMean) <= RATIO_TOLERANCE * ratioMean)) {
    // A box wider than its viewport is clamped: sizes cannot ask for more than 100vw
    return { kind: 'vw', ratio: Math.min(1, Math.max(...ratios)) };
  }
  return { kind: 'mixed' };
}

/**
 * The widest the image's box can get inside each bucket, in CSS pixels.
 *
 * This is the number `sizes` declares, so the srcset ladder has to be built from it too:
 * a ladder built from the measured box alone would stop below what the declared slot asks
 * for at the top of a bucket, and the browser would hand that device a file that is too
 * small. Guessing high costs a slightly larger file; guessing low makes the image blurry.
 *
 * @param {Record<string, {viewportWidth:number, boxWidth:number}|null>} perViewport
 * @returns {Record<string, number>} one CSS-pixel slot per measured viewport
 */
export function slotWidths(perViewport) {
  const points = measuredPoints(perViewport);
  const shape = shapeOf(points);
  if (shape === null) return {};

  const entries = points.map((p) => {
    const { upper } = BUCKETS[p.name];
    if (shape.kind === 'fixed') return [p.name, shape.px];
    const top = upper ?? p.viewportWidth;
    if (shape.kind === 'vw') return [p.name, Math.ceil(shape.ratio * top)];
    return [p.name, upper === null ? Math.ceil(p.boxWidth) : Math.ceil(Math.max(p.boxWidth, (p.boxWidth / p.viewportWidth) * upper))];
  });
  return Object.fromEntries(entries);
}

/**
 * The sizes value for one image, read from its box width at each measured viewport.
 * @param {Record<string, {viewportWidth:number, boxWidth:number}|null>} perViewport
 * @returns {string|null} null when fewer than two viewports were measured
 */
export function buildSizes(perViewport) {
  const points = measuredPoints(perViewport);
  const shape = shapeOf(points);
  if (shape === null) return null;

  if (shape.kind === 'fixed') return `${shape.px}px`;
  if (shape.kind === 'vw') return `${round1(shape.ratio * 100)}vw`;

  const slots = slotWidths(perViewport);
  return points
    .map((p, i) => {
      // The last entry must carry no query: when every query fails the browser falls back
      // to 100vw and picks the largest file, which is the problem this tool reports
      const last = i === points.length - 1;
      const { query } = BUCKETS[p.name];
      return query === null || last ? `${slots[p.name]}px` : `${query} ${slots[p.name]}px`;
    })
    .join(', ');
}
