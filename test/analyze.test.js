import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeViewport } from '../src/analyze.js';

const viewport = { name: 'desktop', width: 1366, height: 768, dpr: 1, mobile: false };
const img = (url, boxWidth, boxHeight, extra = {}) => ({
  url,
  naturalWidth: 1600,
  naturalHeight: 800,
  boxWidth,
  boxHeight,
  objectFit: 'fill',
  ...extra,
});
const run = (images, { bytes = {}, notLoaded = 0, lcp = null, threshold = 2 } = {}) =>
  analyzeViewport({
    viewport,
    raw: { images, notLoaded, lcp },
    bytesByUrl: new Map(Object.entries(bytes)),
    threshold,
  });

test('keeps viewport fields and counts not-loaded images', () => {
  const r = run([img('a', 400, 200)], { notLoaded: 2 });
  assert.equal(r.name, 'desktop');
  assert.equal(r.dpr, 1);
  assert.equal(r.imageCount, 3);
  assert.equal(r.notLoaded, 2);
});

test('builds a finding with rounded numbers', () => {
  const [f] = run([img('a', 400, 200)], { bytes: { a: 100000 } }).images;
  assert.deepEqual(f, {
    url: 'a',
    file: { width: 1600, height: 800 },
    shown: { width: 400, height: 200 },
    needed: { width: 400, height: 200 },
    objectFit: 'fill',
    extra: 4,
    unusedPixels: 0.94,
    bytes: 100000,
    estSavingBytes: 75000,
    count: 1,
    isLcp: false,
    oversized: true,
  });
});

test('dedupes by URL and keeps the most demanding use', () => {
  const r = run([img('a', 100, 50), img('a', 800, 400), img('a', 200, 100)]);
  assert.equal(r.images.length, 1);
  assert.equal(r.images[0].count, 3);
  assert.equal(r.images[0].extra, 2);
  assert.deepEqual(r.images[0].shown, { width: 800, height: 400 });
  assert.equal(r.imageCount, 3);
});

test('flags at or above the threshold, using the rounded extra', () => {
  // 1600 / 820 = 1.95, rounds to 2.0
  const r = run([img('a', 820, 410), img('b', 900, 450)]);
  assert.equal(r.images.find((i) => i.url === 'a').oversized, true);
  assert.equal(r.images.find((i) => i.url === 'b').oversized, false);
});

test('sorts by extra, highest first', () => {
  const r = run([img('small', 800, 400), img('big', 100, 50), img('mid', 400, 200)]);
  assert.deepEqual(r.images.map((i) => i.url), ['big', 'mid', 'small']);
});

test('unknown sizes stay null and stay out of the total', () => {
  const r = run([img('a', 400, 200), img('b', 400, 200)], { bytes: { a: 1000 } });
  const b = r.images.find((i) => i.url === 'b');
  assert.equal(b.bytes, null);
  assert.equal(b.estSavingBytes, null);
  assert.equal(r.totals.unknownSizes, 1);
  assert.equal(r.totals.estSavingBytes, 750);
});

test('totals only count oversized images', () => {
  const r = run([img('big', 400, 200), img('ok', 1600, 800)], { bytes: { big: 1000, ok: 1000 } });
  assert.equal(r.totals.oversized, 1);
  assert.equal(r.totals.estSavingBytes, 750);
});

test('marks the LCP image when the LCP element is an img', () => {
  const r = run([img('a', 400, 200), img('b', 400, 200)], { lcp: { url: 'b', isImage: true } });
  assert.equal(r.images.find((i) => i.url === 'b').isLcp, true);
  assert.equal(r.images.find((i) => i.url === 'a').isLcp, false);
  assert.deepEqual(r.lcp, { url: 'b', isImage: true });
});

test('does not mark anything when the LCP element is not an img', () => {
  const r = run([img('a', 400, 200)], { lcp: { url: 'a', isImage: false } });
  assert.equal(r.images[0].isLcp, false);
});

test('defaults an empty object-fit to fill', () => {
  const r = run([img('a', 400, 200, { objectFit: '' })]);
  assert.equal(r.images[0].objectFit, 'fill');
});
