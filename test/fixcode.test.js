import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFix } from '../src/fixcode.js';
import { isShopifyCdn, shopifyUrl, placeholderName } from '../src/shopify.js';

const point = (viewportWidth, boxWidth, dpr) => ({
  viewportWidth,
  boxWidth,
  dpr,
  needed: { width: Math.ceil(boxWidth * dpr), height: 1 },
});

const joined = (over) => ({
  identity: 'a.jpg',
  domPath: 'body:nth-of-type(1) > img:nth-of-type(1)',
  from: 'img',
  srcsetAttr: null,
  sizesAttr: null,
  file: { width: 2000, height: 1500 },
  objectFit: 'cover',
  url: 'https://shop.example/a.jpg',
  perViewport: { mobile: point(390, 360, 3), tablet: point(768, 384, 2), desktop: point(1366, 300, 1) },
  partial: false,
  oversizedAt: ['mobile', 'tablet', 'desktop'],
  ...over,
});

test('widths come from what each viewport needs, rounded up to 50', () => {
  const fix = buildFix(joined());
  // needs 1080, 768, 300 -> 1100, 800, 300
  assert.deepEqual(fix.widths, [300, 800, 1100]);
  assert.equal(fix.confident, true);
});

test('a width within 10% of a larger one is dropped', () => {
  const fix = buildFix(joined({ perViewport: { mobile: point(390, 360, 3), tablet: point(768, 530, 2), desktop: point(1366, 300, 1) } }));
  // needs 1080, 1060 -> 1100, 1100 after rounding, so one candidate remains
  assert.deepEqual(fix.widths, [300, 1100]);
});

test('no width above the original file, and a note when the file is too small', () => {
  const fix = buildFix(joined({ file: { width: 500, height: 375 } }));
  assert.deepEqual(fix.widths, [300, 500]);
  assert.ok(
    fix.notes.some((n) => n.includes('original')),
    `expected a note about the original being too small, got ${JSON.stringify(fix.notes)}`,
  );
});

test('Shopify URLs are built for real, keeping other query parameters', () => {
  const fix = buildFix(joined({ url: 'https://cdn.shopify.com/s/files/1/a.jpg?v=17&height=900' }));
  assert.match(fix.srcset, /\?v=17&width=300 300w/);
  assert.ok(!fix.srcset.includes('height=900'), 'height is dropped so it cannot fight width');
  assert.match(fix.html, /src="https:\/\/cdn\.shopify\.com\/s\/files\/1\/a\.jpg\?v=17&width=1100"/);
});

test('a Shopify URL that already has a width is rewritten, not doubled', () => {
  const url = shopifyUrl('https://cdn.shopify.com/s/files/1/a.jpg?width=2000&v=3', 400);
  assert.equal(url, 'https://cdn.shopify.com/s/files/1/a.jpg?width=400&v=3');
});

test('other hosts get placeholder names and no invented srcset', () => {
  const fix = buildFix(joined());
  assert.equal(fix.srcset, null);
  assert.match(fix.html, /a-300\.jpg 300w/);
  assert.ok(
    fix.notes.some((n) => n.includes('produce')),
    'says the files have to be produced',
  );
});

test('placeholder names survive a query string and a missing extension', () => {
  assert.equal(placeholderName('https://e.com/img/hero.jpg?v=2', 400), 'hero-400.jpg');
  assert.equal(placeholderName('https://e.com/img/hero', 400), 'hero-400.jpg');
  assert.equal(placeholderName('//cdn.shopify.com/s/files/1/a.png', 800), 'a-800.png');
});

test('an unparseable URL does not throw', () => {
  assert.equal(isShopifyCdn('not a url'), false);
  // the name is percent-encoded by the URL parser, which is fine: it must not throw
  assert.match(placeholderName('not a url', 400), /-400\.jpg$/);
});

test('a picture source is the paste target', () => {
  const fix = buildFix(joined({ from: 'source' }));
  assert.equal(fix.target, 'source');
  assert.match(fix.html, /^<source\b/m);
});

test('x descriptors are rewritten as w descriptors, with the reason', () => {
  const fix = buildFix(joined({ srcsetAttr: 'a.jpg 1x, a@2x.jpg 2x' }));
  assert.ok(
    fix.notes.some((n) => n.includes('x descriptors')),
    `expected a note about x descriptors, got ${JSON.stringify(fix.notes)}`,
  );
  assert.match(fix.html, /300w/);
});

test('a partial image is built from what was measured and is not confident', () => {
  const fix = buildFix(joined({ partial: true, perViewport: { mobile: null, tablet: point(768, 384, 2), desktop: point(1366, 300, 1) } }));
  assert.equal(fix.confident, false);
  assert.ok(
    fix.notes.some((n) => n.includes('mobile')),
    `expected the missing viewport to be named, got ${JSON.stringify(fix.notes)}`,
  );
});

test('one measured viewport produces no fix', () => {
  assert.equal(buildFix(joined({ partial: true, perViewport: { mobile: point(390, 360, 3), tablet: null, desktop: null } })), null);
});

test('an image that is not oversized anywhere produces no fix', () => {
  assert.equal(buildFix(joined({ oversizedAt: [] })), null);
});
