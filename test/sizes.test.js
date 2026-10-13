import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSizes, slotWidths } from '../src/sizes.js';

const point = (viewportWidth, boxWidth, dpr) => ({
  viewportWidth,
  boxWidth,
  dpr,
  needed: { width: Math.ceil(boxWidth * dpr), height: 1 },
});

test('a box that is the same width everywhere is a single px value', () => {
  const sizes = buildSizes({ mobile: point(390, 300, 3), tablet: point(768, 304, 2), desktop: point(1366, 300, 1) });
  assert.equal(sizes, '304px');
});

test('a box that tracks the viewport is a single vw value', () => {
  // ratios 0.9205, 0.9206, 0.9202: within tolerance, and the largest one wins
  const sizes = buildSizes({ mobile: point(390, 359, 3), tablet: point(768, 707, 2), desktop: point(1366, 1257, 1) });
  assert.equal(sizes, '92.1vw');
});

test('a mixed box gets buckets, biased up to the top of each bucket', () => {
  // mobile r = 0.918 -> 0.918 * 480 = 441; tablet r = 0.5 -> 0.5 * 1024 = 512; desktop uses its own box
  const sizes = buildSizes({ mobile: point(390, 358, 3), tablet: point(768, 384, 2), desktop: point(1366, 300, 1) });
  assert.equal(sizes, '(max-width: 480px) 441px, (max-width: 1024px) 512px, 300px');
});

test('an image wider than the viewport is clamped to 100vw', () => {
  const sizes = buildSizes({ mobile: point(390, 520, 3), tablet: point(768, 1024, 2), desktop: point(1366, 1820, 1) });
  assert.equal(sizes, '100vw');
});

test('one measured viewport gives no sizes at all', () => {
  assert.equal(buildSizes({ mobile: point(390, 358, 3), tablet: null, desktop: null }), null);
});

test('two measured viewports still work, skipping the missing bucket', () => {
  const sizes = buildSizes({ mobile: null, tablet: point(768, 384, 2), desktop: point(1366, 300, 1) });
  assert.equal(sizes, '(max-width: 1024px) 512px, 300px');
});

test('the slot widths are the same biased values the sizes value declares', () => {
  const perViewport = { mobile: point(390, 358, 3), tablet: point(768, 384, 2), desktop: point(1366, 300, 1) };
  // the sizes value for this image is "(max-width: 480px) 441px, (max-width: 1024px) 512px, 300px"
  assert.deepEqual(slotWidths(perViewport), { mobile: 441, tablet: 512, desktop: 300 });
});

test('a fixed-width image has the same slot in every bucket', () => {
  const perViewport = { mobile: point(390, 300, 3), tablet: point(768, 304, 2), desktop: point(1366, 300, 1) };
  assert.deepEqual(slotWidths(perViewport), { mobile: 304, tablet: 304, desktop: 304 });
});

test('the widest measured bucket is unconditional, so wide screens are not left at 100vw', () => {
  // without a desktop measurement the last entry must still be a bare value: a sizes list
  // whose queries all fail falls back to 100vw, which picks the largest file
  const sizes = buildSizes({ mobile: point(390, 358, 3), tablet: point(768, 384, 2), desktop: null });
  assert.equal(sizes, '(max-width: 480px) 441px, 512px');
  assert.ok(!/\(max-width: 1024px\)$/.test(sizes), 'the last entry carries no media query');
});
