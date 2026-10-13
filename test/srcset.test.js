import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSrcset } from '../src/srcset.js';

test('width descriptors', () => {
  assert.deepEqual(parseSrcset('a.jpg 400w, b.jpg 800w'), [
    { url: 'a.jpg', w: 400, x: null },
    { url: 'b.jpg', w: 800, x: null },
  ]);
});

test('density descriptors, and no descriptor means 1x', () => {
  assert.deepEqual(parseSrcset('a.jpg, b.jpg 2x'), [
    { url: 'a.jpg', w: null, x: 1 },
    { url: 'b.jpg', w: null, x: 2 },
  ]);
});

test('commas inside URLs (Cloudinary style) are kept', () => {
  assert.deepEqual(parseSrcset('https://c.io/w_300,c_fill/a.jpg 300w, https://c.io/w_600,c_fill/a.jpg 600w'), [
    { url: 'https://c.io/w_300,c_fill/a.jpg', w: 300, x: null },
    { url: 'https://c.io/w_600,c_fill/a.jpg', w: 600, x: null },
  ]);
});

test('extra whitespace and newlines', () => {
  assert.deepEqual(parseSrcset('\n  a.jpg   400w ,\n  b.jpg 800w\n'), [
    { url: 'a.jpg', w: 400, x: null },
    { url: 'b.jpg', w: 800, x: null },
  ]);
});

test('empty and junk input give no candidates', () => {
  assert.deepEqual(parseSrcset(''), []);
  assert.deepEqual(parseSrcset(null), []);
  assert.deepEqual(parseSrcset(' , , '), []);
  // invalid descriptors drop the candidate, as browsers do
  assert.deepEqual(parseSrcset('a.jpg 0w, b.jpg abc, c.jpg 300w'), [{ url: 'c.jpg', w: 300, x: null }]);
});
