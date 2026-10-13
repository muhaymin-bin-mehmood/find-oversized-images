import test from 'node:test';
import assert from 'node:assert/strict';
import { groupFindings } from '../src/group.js';

const fix = { reason: 'no-srcset', advice: 'No srcset, so every screen downloads this 800px file. Add a srcset that includes a 280w version.' };
const card = (n, over) => ({
  url: `https://shop.example/p${n}.jpg`,
  file: { width: 800, height: 1200 },
  shown: { width: 280, height: 392 },
  extra: 2.9,
  unusedPixels: 0.88,
  bytes: 1000 * n,
  estSavingBytes: 600 * n,
  count: 1,
  isLcp: false,
  oversized: true,
  fix,
  ...over,
});

test('same box, same extra and same fix make one group', () => {
  const groups = groupFindings([card(1), card(2), card(3, { file: { width: 800, height: 1201 } })]);
  assert.equal(groups.length, 1);
  const [g] = groups;
  assert.equal(g.images.length, 3);
  assert.equal(g.bytes, 6000);
  assert.equal(g.estSavingBytes, 3600);
  assert.deepEqual(g.file, { width: 800, height: 1200 });
  assert.equal(g.fix, fix);
});

test('the same kind of fix groups even when the exact advice differs by a pixel', () => {
  const off = { reason: 'no-srcset', advice: fix.advice.replace('280w', '281w') };
  const groups = groupFindings([card(1), card(2, { file: { width: 800, height: 1199 }, fix: off })]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].fix, fix); // advice of the first image
});

test('a different box, extra or kind of fix starts a new group, in first-seen order', () => {
  const other = { reason: 'sizes', advice: 'x' };
  const groups = groupFindings([
    card(1),
    card(2, { shown: { width: 133, height: 133 }, extra: 3 }),
    card(3, { fix: other }),
    card(4),
  ]);
  assert.deepEqual(groups.map((g) => g.images.map((i) => i.url.slice(-6))), [['p1.jpg', 'p4.jpg'], ['p2.jpg'], ['p3.jpg']]);
});

test('the LCP image always stays on its own', () => {
  const groups = groupFindings([card(1), card(2, { isLcp: true }), card(3)]);
  assert.equal(groups.length, 2);
  assert.equal(groups[1].isLcp, true);
  assert.equal(groups[1].images.length, 1);
});

test('unknown sizes are left out of the sums; all unknown gives null', () => {
  assert.equal(groupFindings([card(1), card(2, { bytes: null, estSavingBytes: null })])[0].bytes, 1000);
  const [g] = groupFindings([card(1, { bytes: null, estSavingBytes: null })]);
  assert.equal(g.bytes, null);
  assert.equal(g.estSavingBytes, null);
});
