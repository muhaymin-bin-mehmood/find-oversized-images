import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCli, normalizeUrl, VIEWPORTS } from '../src/cli.js';
import { ToolError } from '../src/errors.js';

test('defaults: both viewports, threshold 2, table output', () => {
  const o = parseCli(['https://example.com']);
  assert.equal(o.url, 'https://example.com/');
  assert.deepEqual(o.viewports, [VIEWPORTS.mobile, VIEWPORTS.desktop]);
  assert.equal(o.threshold, 2);
  assert.equal(o.failOn, null);
  assert.equal(o.json, false);
  assert.equal(o.timeout, 30000);
  assert.equal(o.browserPath, null);
});

test('default viewports match the spec', () => {
  assert.deepEqual(VIEWPORTS.mobile, { name: 'mobile', width: 390, height: 844, dpr: 3, mobile: true });
  assert.deepEqual(VIEWPORTS.desktop, { name: 'desktop', width: 1366, height: 768, dpr: 1, mobile: false });
});

test('--mobile and --desktop pick one viewport, both together pick both', () => {
  assert.deepEqual(parseCli(['x.com', '--mobile']).viewports, [VIEWPORTS.mobile]);
  assert.deepEqual(parseCli(['x.com', '--desktop']).viewports, [VIEWPORTS.desktop]);
  assert.deepEqual(parseCli(['x.com', '--mobile', '--desktop']).viewports, [VIEWPORTS.mobile, VIEWPORTS.desktop]);
});

test('--width makes one custom viewport with defaults for height and dpr', () => {
  assert.deepEqual(parseCli(['x.com', '--width', '800']).viewports, [
    { name: 'custom', width: 800, height: 800, dpr: 1, mobile: false },
  ]);
  assert.deepEqual(parseCli(['x.com', '--width', '800', '--height', '600', '--dpr', '2.5']).viewports, [
    { name: 'custom', width: 800, height: 600, dpr: 2.5, mobile: false },
  ]);
});

test('other options', () => {
  const o = parseCli(['x.com', '--threshold', '1.5', '--fail-on', '3', '--json', '--timeout', '5000', '--browser-path', 'C:\\chrome.exe']);
  assert.equal(o.threshold, 1.5);
  assert.equal(o.failOn, 3);
  assert.equal(o.json, true);
  assert.equal(o.timeout, 5000);
  assert.equal(o.browserPath, 'C:\\chrome.exe');
});

test('--help and --version short-circuit, even without a URL', () => {
  assert.equal(parseCli(['--help']).help, true);
  assert.equal(parseCli(['-h']).help, true);
  assert.equal(parseCli(['--version']).version, true);
});

test('a URL without a scheme gets https', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com/');
  assert.equal(normalizeUrl('example.com/shop?a=1'), 'https://example.com/shop?a=1');
  assert.equal(normalizeUrl('http://localhost:3000/'), 'http://localhost:3000/');
});

test('rejects non-http URLs and junk', () => {
  assert.throws(
    () => normalizeUrl('ftp://example.com'),
    (err) => err instanceof ToolError && err.message === 'Only http and https URLs are supported, got ftp. Run with --help for usage.',
  );
  assert.throws(() => normalizeUrl('http://'), ToolError);
});

test('needs exactly one URL', () => {
  assert.throws(() => parseCli([]), /exactly one URL/);
  assert.throws(() => parseCli(['a.com', 'b.com']), /exactly one URL/);
});

test('bad numbers fail with a usage hint', () => {
  for (const args of [
    ['--threshold', 'abc'],
    ['--threshold', '0'],
    ['--fail-on', '-1'],
    ['--width', '12.5'],
    ['--width', '800', '--dpr', '0'],
    ['--timeout', 'soon'],
  ]) {
    assert.throws(() => parseCli(['x.com', ...args]), (err) => err instanceof ToolError && /--help/.test(err.message), args.join(' '));
  }
});

test('--height or --dpr without --width is an error', () => {
  assert.throws(() => parseCli(['x.com', '--dpr', '2']), /need --width/);
});

test('unknown flags are an error', () => {
  assert.throws(() => parseCli(['x.com', '--wat']), (err) => err instanceof ToolError && /--help/.test(err.message));
});
