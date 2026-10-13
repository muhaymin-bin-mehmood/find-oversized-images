import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../src/diagnose.js';

const viewport = { name: 'desktop', width: 1366, height: 768, dpr: 1 };

const finding = (over) => ({
  url: 'https://shop.example/cdn/a.jpg?width=800',
  file: { width: 800, height: 1200 },
  shown: { width: 280, height: 392 },
  needed: { width: 280, height: 420 },
  srcset: null,
  sizes: null,
  ...over,
});

test('no srcset: every screen gets the same file', () => {
  const fix = diagnose(finding(), viewport);
  assert.equal(fix.reason, 'no-srcset');
  assert.equal(fix.advice, 'No srcset, so every screen downloads this 800px file. Add a srcset that includes a 280w version.');
});

test('srcset has a small enough file but sizes is wrong', () => {
  const fix = diagnose(finding({ srcset: 'a-300.jpg 300w, a-800.jpg 800w', sizes: '100vw' }), viewport);
  assert.equal(fix.reason, 'sizes');
  assert.equal(fix.advice, 'sizes is "100vw" but the box is 280px wide, so the browser picks a bigger file. srcset already has 300w; make sizes match the box.');
});

test('missing sizes means the browser assumes the full screen width', () => {
  const fix = diagnose(finding({ srcset: 'a-300.jpg 300w, a-800.jpg 800w', sizes: '' }), viewport);
  assert.equal(fix.reason, 'sizes');
  assert.match(fix.advice, /^No sizes attribute: the browser assumes the image is 1366px wide, but the box is 280px\. srcset already has 300w/);
});

test('very long sizes values are shortened', () => {
  const sizes = `(min-width: 990px) calc((100vw - 130px) / 4), ${'(min-width: 750px) calc((100vw - 120px) / 3), '.repeat(3)}100vw`;
  const fix = diagnose(finding({ srcset: 'a-300.jpg 300w, a-800.jpg 800w', sizes }), viewport);
  assert.match(fix.advice, /^sizes is "\(min-width: 990px\).{20,60}\.\.\." but/);
});

test('srcset has nothing small enough', () => {
  const fix = diagnose(finding({ srcset: 'a-800.jpg 800w, a-1600.jpg 1600w', sizes: '280px' }), viewport);
  assert.equal(fix.reason, 'no-small-candidate');
  assert.equal(fix.advice, 'The smallest file in srcset is 800w. Add a 280w version.');
});

test('x descriptors do not follow the box size', () => {
  const fix = diagnose(finding({ srcset: 'a.jpg 1x, a@2x.jpg 2x' }), viewport);
  assert.equal(fix.reason, 'density');
  assert.equal(fix.advice, 'srcset uses x descriptors, so the box size does not pick the file. Make the 1x file 280px wide, or switch to w descriptors with a 280w version.');
});

test('a srcset that cannot be read is treated as missing', () => {
  assert.equal(diagnose(finding({ srcset: ' , ' }), viewport).reason, 'no-srcset');
});

test('Shopify CDN images get the exact width to request', () => {
  const fix = diagnose(finding({ url: 'https://shop.example/cdn/shop/files/a.jpg?v=1&width=800' }), viewport);
  assert.equal(
    fix.advice,
    'No srcset, so every screen downloads this 800px file. Add a srcset that includes a 280w version. Shopify resizes on request: the same URL with width=280 gives that file.',
  );
  const cdn = diagnose(finding({ url: 'https://cdn.shopify.com/s/files/1/a.jpg', srcset: 'a 800w', sizes: '280px' }), viewport);
  assert.match(cdn.advice, /Shopify resizes on request: the same URL with width=280 gives that file\.$/);
  // sizes problems are fixed in the markup, not the URL
  const sizes = diagnose(finding({ url: 'https://cdn.shopify.com/a.jpg', srcset: 'a 300w, b 800w', sizes: '100vw' }), viewport);
  assert.doesNotMatch(sizes.advice, /Shopify/);
});
