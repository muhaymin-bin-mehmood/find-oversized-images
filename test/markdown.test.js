import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMarkdown } from '../src/markdown.js';

const entry = {
  joined: {
    url: 'https://shop.example/a.jpg',
    file: { width: 2000, height: 1500 },
    perViewport: { mobile: { boxWidth: 360 }, tablet: null, desktop: { boxWidth: 300 } },
  },
  fix: {
    target: 'img',
    sizes: '(max-width: 480px) 441px, 300px',
    widths: [300, 1100],
    srcset: null,
    html: '<img\n  srcset="a-300.jpg 300w"\n  sizes="300px">',
    notes: ['These files do not exist yet: produce them at the widths below, then use the real names.'],
    confident: false,
  },
};

const report = { url: 'https://shop.example/', version: '0.3.0', threshold: 2, viewports: [] };

test('writes one fenced block per image with its notes', () => {
  const md = formatMarkdown(report, [entry]);
  assert.match(md, /^# Image fixes for https:\/\/shop\.example\//m);
  assert.match(md, /```html\n<img/);
  assert.match(md, /These files do not exist yet/);
  assert.match(md, /not fully measured/i, 'an unconfident fix is marked');
  assert.match(md, /wp_calculate_image_sizes/, 'the WordPress note is there once');
  assert.equal(md.match(/wp_calculate_image_sizes/g).length, 1);
});

test('says so plainly when there is nothing to fix', () => {
  const md = formatMarkdown(report, []);
  assert.match(md, /No images needed a fix/);
  assert.ok(!md.includes('```html'));
});
