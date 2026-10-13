import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleFor, measure, unusedPixels, estimateSaving } from '../src/math.js';

const wide = { naturalWidth: 1600, naturalHeight: 800, boxWidth: 400, boxHeight: 100 };

test('contain uses the smaller scale', () => {
  assert.equal(scaleFor({ ...wide, objectFit: 'contain' }), 0.125);
});

test('cover uses the larger scale', () => {
  assert.equal(scaleFor({ ...wide, objectFit: 'cover' }), 0.25);
});

test('none never scales', () => {
  assert.equal(scaleFor({ ...wide, objectFit: 'none' }), 1);
});

test('scale-down acts like contain but never scales up', () => {
  assert.equal(scaleFor({ ...wide, objectFit: 'scale-down' }), 0.125);
  const small = { naturalWidth: 100, naturalHeight: 50, boxWidth: 400, boxHeight: 200 };
  assert.equal(scaleFor({ ...small, objectFit: 'scale-down' }), 1);
});

test('fill (and anything unknown) uses the larger per-axis scale', () => {
  const stretched = { naturalWidth: 1600, naturalHeight: 800, boxWidth: 400, boxHeight: 400 };
  assert.equal(scaleFor({ ...stretched, objectFit: 'fill' }), 0.5);
  assert.equal(scaleFor({ ...stretched, objectFit: '' }), 0.5);
});

test('measure applies the device pixel ratio', () => {
  const cover = { ...wide, objectFit: 'cover' };
  assert.deepEqual(measure(cover, 1), { needed: { width: 400, height: 200 }, extra: 4 });
  assert.deepEqual(measure(cover, 2), { needed: { width: 800, height: 400 }, extra: 2 });
});

test('measure matches the DEV article hero image', () => {
  const hero = { naturalWidth: 2560, naturalHeight: 1442, boxWidth: 765, boxHeight: 235, objectFit: 'cover' };
  const { needed, extra } = measure(hero, 1);
  assert.deepEqual(needed, { width: 765, height: 431 });
  assert.equal(Math.round(extra * 10) / 10, 3.3);
});

test('measure reports extra below 1 for a file smaller than the box', () => {
  const small = { naturalWidth: 400, naturalHeight: 200, boxWidth: 800, boxHeight: 400, objectFit: 'fill' };
  assert.equal(measure(small, 1).extra, 0.5);
});

test('unusedPixels is the share of pixels nobody sees', () => {
  assert.equal(unusedPixels(1), 0);
  assert.equal(unusedPixels(2), 0.75);
  assert.equal(unusedPixels(0.5), 0);
});

test('estimateSaving scales bytes by width, not area', () => {
  assert.equal(estimateSaving(1000, 4), 750);
  assert.equal(estimateSaving(572416, 2560 / 765), 401362);
});

test('estimateSaving is null when there is nothing to save or no size', () => {
  assert.equal(estimateSaving(1000, 1), null);
  assert.equal(estimateSaving(1000, 0.5), null);
  assert.equal(estimateSaving(null, 4), null);
});
