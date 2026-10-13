import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer, PNGS } from './helpers/server.js';
import { launchBrowser } from '../src/browser.js';

const BIN = fileURLToPath(new URL('../bin/find-oversized-images.js', import.meta.url));

let browserFound = true;
try {
  const browser = await launchBrowser();
  await browser.close();
} catch {
  browserFound = false;
}
if (!browserFound && process.env.REQUIRE_BROWSER) throw new Error('REQUIRE_BROWSER is set but Chrome or Edge could not be launched');
const skip = browserFound ? false : 'Chrome or Edge not found';

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

let server;
test.before(async () => {
  server = await startServer();
});
test.after(async () => {
  await server.close();
});

const byCase = (images, c) => images.find((i) => i.url.endsWith(`c=${c}`));

test('measures every fixture case at DPR 1', { skip }, async () => {
  const { code, stdout, stderr } = await runCli([
    `${server.origin}/page.html`, '--width', '800', '--height', '600', '--dpr', '1', '--json', '--fail-on', '3',
  ]);
  assert.equal(code, 1, stderr); // cover, contain, pad, lazy, redirect are >= 3
  const report = JSON.parse(stdout);
  assert.equal(report.viewports.length, 1);
  const vp = report.viewports[0];
  const { images } = vp;

  assert.equal(vp.notLoaded, 1);
  assert.equal(vp.imageCount, 11);
  assert.equal(images.length, 9);

  assert.deepEqual([byCase(images, 'fill').extra, byCase(images, 'fill').needed], [2, { width: 800, height: 400 }]);
  assert.deepEqual([byCase(images, 'cover').extra, byCase(images, 'cover').needed], [4, { width: 400, height: 200 }]);
  assert.deepEqual([byCase(images, 'contain').extra, byCase(images, 'contain').needed], [8, { width: 200, height: 100 }]);
  assert.equal(byCase(images, 'none').extra, 1);
  assert.equal(byCase(images, 'none').oversized, false);
  assert.equal(byCase(images, 'pad').extra, 4);
  assert.deepEqual(byCase(images, 'pad').shown, { width: 400, height: 100 });
  assert.equal(byCase(images, 'lazy').extra, 8);

  const srcset = byCase(images, 'srcset');
  assert.match(srcset.url, /400x200\.png\?c=srcset$/);
  assert.equal(srcset.extra, 1);

  const dup = byCase(images, 'dup');
  assert.equal(dup.count, 2);
  assert.equal(dup.extra, 2);
  assert.deepEqual(dup.shown, { width: 200, height: 100 });

  const redirected = images.find((i) => i.url.endsWith('/redirect/400x200.png'));
  assert.equal(redirected.extra, 4);
  assert.equal(redirected.bytes, PNGS['400x200.png'].length);

  assert.equal(byCase(images, 'fill').bytes, PNGS['1600x800.png'].length);
  assert.equal(byCase(images, 'cover').estSavingBytes, Math.round(PNGS['1600x800.png'].length * 0.75));

  assert.ok(vp.lcp.isImage);
  assert.match(vp.lcp.url, /c=fill$/);
  assert.equal(byCase(images, 'fill').isLcp, true);
});

test('applies the device pixel ratio', { skip }, async () => {
  const { code, stdout, stderr } = await runCli([
    `${server.origin}/page.html`, '--width', '800', '--height', '600', '--dpr', '2', '--json', '--fail-on', '9',
  ]);
  assert.equal(code, 0, stderr);
  const { images } = JSON.parse(stdout).viewports[0];
  assert.deepEqual([byCase(images, 'cover').extra, byCase(images, 'cover').needed], [2, { width: 800, height: 400 }]);
  assert.equal(byCase(images, 'contain').extra, 4);
});

test('default run prints a table for mobile and desktop', { skip }, async () => {
  server.pageUserAgents.length = 0;
  const { code, stdout, stderr } = await runCli([`${server.origin}/page.html`]);
  // Sites that serve different markup by user agent must see a phone on the mobile run
  const [mobileUa, desktopUa] = server.pageUserAgents;
  assert.match(mobileUa, /Android.*Mobile/);
  assert.doesNotMatch(desktopUa, /Mobile/);
  assert.doesNotMatch(mobileUa + desktopUa, /Headless/);
  assert.equal(code, 0, stderr);
  assert.match(stdout, /Mobile 390x844 @3x/);
  assert.match(stdout, /Desktop 1366x768 @1x/);
  assert.match(stdout, /<- LCP/);
  assert.match(stdout, /Total: ~\d+ KB could be saved \(estimate, conservative\)/);
});

test('HTTP errors exit 2', { skip }, async () => {
  const { code, stdout, stderr } = await runCli([`${server.origin}/nope.html`, '--desktop']);
  assert.equal(code, 2);
  assert.equal(stdout, '');
  assert.match(stderr, /HTTP 404/);
});

test('a page that never loads times out with exit 2', { skip }, async () => {
  const { code, stderr } = await runCli([`${server.origin}/slow.html`, '--desktop', '--timeout', '1000']);
  assert.equal(code, 2);
  assert.match(stderr, /did not finish loading within 1000 ms.*--timeout/);
});

// Before the fix this run never ended, which would hang a CI job using --fail-on
test('a page that hangs after it loads times out with exit 2', { skip, timeout: 20000 }, async () => {
  const { code, stdout, stderr } = await runCli([`${server.origin}/spin.html`, '--desktop', '--timeout', '1000']);
  assert.equal(code, 2, stderr);
  assert.equal(stdout, '');
  assert.match(stderr, /^Error: The page stopped responding after it loaded \(desktop viewport\).*--timeout/);
});

test('usage errors exit 2 before any browser starts', async () => {
  const { code, stderr } = await runCli(['example.com', '--threshold', 'abc']);
  assert.equal(code, 2);
  assert.match(stderr, /^Error: --threshold needs a number above 0/);
});

test('a closed stdout pipe (as with | head -1) exits quietly', async () => {
  const child = spawn(process.execPath, [BIN, '--help']);
  child.stdout.destroy(); // the reader goes away before the CLI writes
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(stderr, '');
  assert.equal(code, 0);
});

test('--version prints the package version', async () => {
  const { code, stdout } = await runCli(['--version']);
  assert.equal(code, 0);
  assert.match(stdout, /^\d+\.\d+\.\d+\n$/);
});
