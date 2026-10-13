import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHtml } from '../src/html.js';

const fix = { reason: 'sizes', advice: 'sizes is "100vw" but the box is 280px wide, so the browser picks a bigger file. srcset already has 300w; make sizes match the box.' };
const card = (n, over) => ({
  url: `https://shop.example/cdn/card-${n}.jpg?width=800`,
  file: { width: 800, height: 1200 },
  shown: { width: 280, height: 392 },
  needed: { width: 280, height: 420 },
  objectFit: 'cover',
  extra: 2.9,
  unusedPixels: 0.88,
  bytes: 10240,
  estSavingBytes: 6144,
  count: 1,
  isLcp: false,
  oversized: true,
  srcset: null,
  sizes: null,
  fix,
  ...over,
});

const viewport = (images, over) => ({
  name: 'desktop',
  width: 1366,
  height: 768,
  dpr: 1,
  imageCount: 40,
  notLoaded: 3,
  lcp: null,
  images,
  totals: {
    oversized: images.filter((i) => i.oversized).length,
    estSavingBytes: images.reduce((s, i) => s + (i.oversized ? i.estSavingBytes ?? 0 : 0), 0),
    unknownSizes: 0,
  },
  ...over,
});

const report = (viewports) => ({ url: 'https://shop.example/', version: '0.2.0', threshold: 2, viewports });
const at = new Date('2026-10-13T12:00:00Z');

test('a complete page with the URL, viewport summary, groups and fixes', () => {
  const html = formatHtml(report([viewport([card(1), card(2), card(3, { oversized: false, fix: null })])]), { generatedAt: at });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<title>Oversized images on shop\.example<\/title>/);
  assert.match(html, /<a href="https:\/\/shop\.example\/"/);
  assert.match(html, /2026-10-13/);
  assert.match(html, /find-oversized-images 0\.2\.0/);
  assert.match(html, /Desktop 1366x768 @1x/);
  assert.match(html, /<b>2<\/b> oversized of 40 images/);
  assert.match(html, /3 not loaded/);
  assert.match(html, /2 images/);
  assert.match(html, /sizes is &quot;100vw&quot; but the box is 280px wide/);
  // each image is a thumbnail that links to the file
  assert.match(html, /<a href="https:\/\/shop\.example\/cdn\/card-1\.jpg\?width=800" target="_blank" rel="noopener noreferrer"><img src="https:\/\/shop\.example\/cdn\/card-1\.jpg\?width=800"/);
  assert.doesNotMatch(html, /card-3\.jpg/);
});

test('no scripts, a strict CSP and no referrer to the image hosts', () => {
  const html = formatHtml(report([viewport([card(1)])]), { generatedAt: at });
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https:; style-src 'unsafe-inline'">/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
});

test('long groups show 12 thumbnails and fold the rest', () => {
  const images = Array.from({ length: 15 }, (_, k) => card(k + 1));
  const html = formatHtml(report([viewport(images)]), { generatedAt: at });
  assert.match(html, /15 images/);
  assert.match(html, /<details><summary>Show 3 more<\/summary>/);
  assert.equal(html.match(/<img /g).length, 15);
});

test('the LCP image is marked', () => {
  const html = formatHtml(report([viewport([card(1, { isLcp: true })])]), { generatedAt: at });
  assert.match(html, /class="badge">LCP</);
});

test('page content cannot inject markup or script links', () => {
  const evil = card(1, {
    url: 'https://x.io/"><script>alert(1)</script>.jpg',
    fix: { reason: 'sizes', advice: 'sizes is "<img onerror=alert(1)>"' },
  });
  const js = card(2, { url: 'javascript:alert(1)', extra: 3 });
  const html = formatHtml({ ...report([viewport([evil, js])]), url: 'https://x.io/<b>' }, { generatedAt: at });
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img onerror/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(html, /src="javascript:/);
  assert.match(html, /x\.io\/%3Cb%3E|x\.io\/&lt;b&gt;/);
  assert.doesNotMatch(html, /x\.io\/<b>/);
});

test('says so when nothing is oversized', () => {
  const html = formatHtml(report([viewport([card(1, { oversized: false, fix: null })])]), { generatedAt: at });
  assert.match(html, /No images at or above 2x\./);
});

test('links to the browser auditor at the bottom', () => {
  const html = formatHtml(report([viewport([card(1)])]), { generatedAt: at });
  assert.match(html, /href="https:\/\/batchset\.com\/tools\/website-image-auditor"/);
});
