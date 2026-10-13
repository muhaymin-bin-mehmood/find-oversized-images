import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatTable, formatJson } from '../src/format.js';

const finding = (over) => ({
  url: 'https://cdn.example.com/a/hero.jpg?w=2560',
  file: { width: 2560, height: 1442 },
  shown: { width: 765, height: 235 },
  needed: { width: 765, height: 431 },
  objectFit: 'cover',
  extra: 3.3,
  unusedPixels: 0.91,
  bytes: 572416,
  estSavingBytes: 401362,
  count: 1,
  isLcp: false,
  oversized: true,
  ...over,
});

const viewport = (over) => ({
  name: 'desktop',
  width: 1366,
  height: 768,
  dpr: 1,
  imageCount: 42,
  notLoaded: 2,
  lcp: { url: 'https://cdn.example.com/a/hero.jpg?w=2560', isImage: true },
  images: [
    finding({ isLcp: true }),
    finding({ url: 'https://example.com/tile-1.jpg', extra: 3.8, count: 8, bytes: 43008, estSavingBytes: 31690 }),
    finding({ url: 'https://example.com/ok.jpg', extra: 1.2, oversized: false }),
  ],
  totals: { oversized: 2, estSavingBytes: 433052, unknownSizes: 0 },
  ...over,
});

const report = (viewports) => ({ url: 'https://example.com/', version: '0.1.0', threshold: 2, viewports });

test('formatBytes', () => {
  assert.equal(formatBytes(null), 'unknown');
  assert.equal(formatBytes(572416), '559 KB');
  assert.equal(formatBytes(3 * 1024 * 1024 + 200000), '3.2 MB');
});

test('table has the URL, a viewport header and only oversized rows', () => {
  const out = formatTable(report([viewport()]));
  assert.match(out, /^https:\/\/example\.com\/\n\n/);
  assert.match(out, /Desktop 1366x768 @1x {3}42 images, 2 oversized, 2 not loaded\n/);
  assert.match(out, /extra +unused +file +shown +size +est\. save +image/);
  assert.match(out, /3\.3x +91% +2560x1442 +765x235 +559 KB +~392 KB +hero\.jpg {2}<- LCP/);
  assert.match(out, /tile-1\.jpg {2}x8/);
  assert.doesNotMatch(out, /ok\.jpg/);
  assert.match(out, /Total: ~423 KB could be saved \(estimate, conservative\)/);
});

test('rows are listed in the order given (analyze already sorted them)', () => {
  const out = formatTable(report([viewport()]));
  assert.ok(out.indexOf('hero.jpg') < out.indexOf('tile-1.jpg'));
});

test('unknown sizes show as unknown and a note', () => {
  const vp = viewport({
    images: [finding({ bytes: null, estSavingBytes: null })],
    totals: { oversized: 1, estSavingBytes: 0, unknownSizes: 1 },
  });
  const out = formatTable(report([vp]));
  assert.match(out, /unknown +- +hero\.jpg/);
  assert.match(out, /1 oversized image had no size info and is not in the total\./);
});

test('says so when nothing is oversized', () => {
  const vp = viewport({ notLoaded: 0, images: [], totals: { oversized: 0, estSavingBytes: 0, unknownSizes: 0 } });
  const out = formatTable(report([vp]));
  assert.match(out, /42 images, 0 oversized\n {2}No images at or above 2x\./);
  assert.doesNotMatch(out, /Total:/);
});

test('notes an LCP element that is not an img', () => {
  const out = formatTable(report([viewport({ lcp: { url: null, isImage: false } })]));
  assert.match(out, /2 not loaded, LCP: not an <img>/);
});

test('long file names are cut to 40 characters', () => {
  const long = `https://example.com/${'a'.repeat(60)}.jpg`;
  const out = formatTable(report([viewport({ images: [finding({ url: long })] })]));
  assert.match(out, new RegExp(` ${'a'.repeat(37)}\\.\\.\\.`));
});

test('viewports are separated by a blank line', () => {
  const out = formatTable(report([viewport({ name: 'mobile', width: 390, height: 844, dpr: 3 }), viewport()]));
  assert.match(out, /Mobile 390x844 @3x/);
  assert.match(out, /\n\nDesktop 1366x768 @1x/);
});

test('json is the report, pretty printed', () => {
  const r = report([viewport()]);
  const out = formatJson(r);
  assert.deepEqual(JSON.parse(out), r);
  assert.ok(out.endsWith('\n'));
});

const cards = (n) =>
  Array.from({ length: n }, (_, k) =>
    finding({
      url: `https://shop.example/card-${k + 1}.jpg`,
      file: { width: 800, height: 1200 },
      shown: { width: 280, height: 392 },
      extra: 2.9,
      unusedPixels: 0.88,
      bytes: 10240,
      estSavingBytes: 6144,
      fix: { reason: 'sizes', advice: 'sizes is "100vw" but the box is 280px wide, so the browser picks a bigger file. srcset already has 300w; make sizes match the box.' },
    }),
  );

test('same problem on many images is one row with a count, an example and the fix', () => {
  const vp = viewport({ images: cards(3), totals: { oversized: 3, estSavingBytes: 18432, unknownSizes: 0 } });
  const out = formatTable(report([vp]));
  assert.match(out, /2\.9x +88% +800x1200 +280x392 +30 KB +~18 KB +3 images, e\.g\. card-1\.jpg\n/);
  assert.match(out, /\n {4}Fix: sizes is "100vw" but the box is 280px wide/);
  assert.equal(out.match(/Fix:/g).length, 1);
  assert.doesNotMatch(out, /card-2\.jpg/);
});

test('all: true lists every image', () => {
  const vp = viewport({ images: cards(3), totals: { oversized: 3, estSavingBytes: 18432, unknownSizes: 0 } });
  const out = formatTable(report([vp]), { all: true });
  assert.match(out, /card-2\.jpg/);
  assert.equal(out.match(/Fix:/g).length, 3);
});

test('links: true makes image names clickable without breaking the columns', () => {
  const vp = viewport({ images: cards(2), totals: { oversized: 2, estSavingBytes: 12288, unknownSizes: 0 } });
  const plain = formatTable(report([vp]));
  const linked = formatTable(report([vp]), { links: true });
  assert.ok(linked.includes('\x1b]8;;https://shop.example/card-1.jpg\x1b\\card-1.jpg\x1b]8;;\x1b\\'));
  assert.equal(linked.replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, ''), plain);
});
