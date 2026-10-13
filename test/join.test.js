import test from 'node:test';
import assert from 'node:assert/strict';
import { joinViewports } from '../src/join.js';

const image = (over) => ({
  url: 'https://shop.example/a-800.jpg',
  identity: 'a-400.jpg 400w, a-800.jpg 800w',
  domPath: 'body:nth-of-type(1) > img:nth-of-type(1)',
  from: 'img',
  srcset: 'a-400.jpg 400w, a-800.jpg 800w',
  sizes: '100vw',
  file: { width: 800, height: 600 },
  shown: { width: 360, height: 270 },
  needed: { width: 1080, height: 810 },
  objectFit: 'cover',
  oversized: true,
  ...over,
});

const viewport = (name, width, dpr, images) => ({ name, width, dpr, images });

test('joins the same image across viewports even when the picked file differs', () => {
  const joined = joinViewports([
    viewport('mobile', 390, 3, [
      image({ url: 'https://shop.example/a-800.jpg', shown: { width: 360, height: 270 }, needed: { width: 1080, height: 810 } }),
    ]),
    viewport('desktop', 1366, 1, [
      image({ url: 'https://shop.example/a-400.jpg', shown: { width: 300, height: 225 }, needed: { width: 300, height: 225 } }),
    ]),
  ]);

  assert.equal(joined.length, 1, 'one image, not two');
  assert.equal(joined[0].perViewport.mobile.boxWidth, 360);
  assert.equal(joined[0].perViewport.desktop.boxWidth, 300);
  assert.equal(joined[0].perViewport.mobile.viewportWidth, 390);
  assert.equal(joined[0].partial, false);
  assert.deepEqual(joined[0].oversizedAt, ['mobile', 'desktop']);
});

test('two images sharing one srcset attribute stay separate', () => {
  const a = image({ domPath: 'body:nth-of-type(1) > img:nth-of-type(1)', shown: { width: 360, height: 270 } });
  const b = image({ domPath: 'body:nth-of-type(1) > img:nth-of-type(2)', shown: { width: 120, height: 90 } });
  const joined = joinViewports([viewport('mobile', 390, 3, [a, b]), viewport('desktop', 1366, 1, [a, b])]);

  assert.equal(joined.length, 2);
  assert.deepEqual(
    joined.map((j) => j.perViewport.mobile.boxWidth).sort((x, y) => x - y),
    [120, 360],
  );
});

test('an image missing from one viewport is partial', () => {
  const joined = joinViewports([
    viewport('mobile', 390, 3, []),
    viewport('tablet', 768, 2, [image()]),
    viewport('desktop', 1366, 1, [image()]),
  ]);

  assert.equal(joined.length, 1);
  assert.equal(joined[0].partial, true);
  assert.equal(joined[0].perViewport.mobile, null);
  assert.equal(joined[0].perViewport.tablet.boxWidth, 360);
});

test('an image that is never oversized is still joined, with an empty oversizedAt', () => {
  const fine = image({ oversized: false });
  const joined = joinViewports([viewport('desktop', 1366, 1, [fine]), viewport('mobile', 390, 3, [fine])]);

  assert.deepEqual(joined[0].oversizedAt, []);
});
