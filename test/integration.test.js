import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer, PNGS } from './helpers/server.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchBrowser } from '../src/browser.js';
import { collectViewport } from '../src/collect.js';
import { run } from '../src/cli.js';

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
  assert.equal(vp.imageCount, 14);
  assert.equal(images.length, 12);

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

  assert.equal(srcset.fix, null);

  // srcset files are measured at their real size, not the density-corrected naturalWidth
  const wsizes = byCase(images, 'wsizes');
  assert.match(wsizes.url, /1600x800\.png\?c=wsizes$/);
  assert.deepEqual([wsizes.file, wsizes.extra], [{ width: 1600, height: 800 }, 8]);
  assert.equal(wsizes.sizes, '100vw');
  assert.equal(wsizes.fix.reason, 'sizes');

  const density = byCase(images, 'density');
  assert.deepEqual([density.file, density.extra, density.fix.reason], [{ width: 1600, height: 800 }, 8, 'density']);

  const pic = byCase(images, 'pic');
  assert.deepEqual([pic.file, pic.extra], [{ width: 1600, height: 800 }, 8]);
  assert.equal(pic.srcset, '/img/1600x800.png?c=pic 1600w');
  assert.equal(pic.fix.reason, 'no-small-candidate');

  assert.equal(byCase(images, 'cover').fix.reason, 'no-srcset');

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

test('default run prints a table for mobile, tablet and desktop', { skip }, async () => {
  server.pageUserAgents.length = 0;
  const { code, stdout, stderr } = await runCli([`${server.origin}/page.html`]);
  // Sites that serve different markup by user agent must see a phone on the mobile run,
  // a tablet on the tablet run, and a desktop on the desktop run
  const [mobileUa, tabletUa, desktopUa] = server.pageUserAgents;
  assert.match(mobileUa, /Android.*Mobile/);
  assert.match(tabletUa, /iPad/);
  assert.doesNotMatch(tabletUa, /Android/);
  assert.doesNotMatch(desktopUa, /Mobile/);
  assert.doesNotMatch(mobileUa + tabletUa + desktopUa, /Headless/);
  assert.equal(code, 0, stderr);
  assert.match(stdout, /Mobile 390x844 @3x/);
  assert.match(stdout, /Tablet 768x1024 @2x/);
  assert.match(stdout, /Desktop 1366x768 @1x/);
  assert.match(stdout, /<- LCP/);
  assert.match(stdout, /Total: ~\d+ KB could be saved \(estimate, conservative\)/);
});

const sink = () => {
  const chunks = [];
  return { write: (c) => chunks.push(String(c)), text: () => chunks.join(''), isTTY: false };
};

test('--html saves a report next to the table and opens it', { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'foi-'));
  try {
    const stdout = sink();
    const stderr = sink();
    const opened = [];
    const code = await run([`${server.origin}/page.html`, '--desktop', '--html'], {
      stdout, stderr, env: {}, cwd: dir, openFile: (f) => opened.push(f),
    });
    assert.equal(code, 0, stderr.text());
    const file = join(dir, 'oversized-report.html');
    assert.deepEqual(opened, [file]);
    assert.match(stdout.text(), /Desktop 1366x768 @1x/);
    assert.ok(stdout.text().endsWith(`HTML report saved to ${file}\n`));
    const html = readFileSync(file, 'utf8');
    assert.match(html, /Desktop 1366x768 @1x/);
    assert.match(html, /<b>Fix:<\/b>/);
    assert.match(html, /c=wsizes/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--html with --json keeps stdout pure JSON, and CI never opens a browser', { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'foi-'));
  try {
    const stdout = sink();
    const stderr = sink();
    const opened = [];
    const code = await run([`${server.origin}/page.html`, '--desktop', '--html', '--json'], {
      stdout, stderr, env: { CI: 'true' }, cwd: dir, openFile: (f) => opened.push(f),
    });
    assert.equal(code, 0, stderr.text());
    assert.doesNotThrow(() => JSON.parse(stdout.text()));
    assert.match(stderr.text(), /HTML report saved to/);
    assert.deepEqual(opened, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test('reports a stable identity, a dom path and where the srcset came from', { skip }, async () => {
  const browser = await launchBrowser();
  try {
    const raw = await collectViewport(
      browser,
      `${server.origin}/page.html`,
      { name: 'desktop', width: 1366, height: 768, dpr: 1, mobile: false },
      { timeout: 30000 },
    );
    for (const image of raw.images) {
      assert.ok(typeof image.identity === 'string' && image.identity.length > 0, 'identity is a non-empty string');
      assert.match(image.domPath, /^(html|body|[a-z]+:nth-of-type\(\d+\))/);
      assert.ok(image.from === 'img' || image.from === 'source');
    }
    // identity must be the attribute, not the file the browser picked
    const withSrcset = raw.images.find((i) => i.srcset);
    assert.equal(withSrcset.identity, withSrcset.srcset);
    assert.ok(!withSrcset.identity.startsWith('http'), 'identity is the attribute, not a resolved URL');
  } finally {
    await browser.close();
  }
});

test('--fix-code writes a markdown file and the table points at it', { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fix-code-'));
  try {
    const out = [];
    const code = await run([`${server.origin}/page.html`, '--fix-code'], {
      stdout: { write: (s) => out.push(s), isTTY: false },
      stderr: { write: () => {} },
      env: {},
      cwd: dir,
      openFile: () => {},
    });
    assert.equal(code, 0);
    const table = out.join('');
    assert.match(table, /Paste-ready srcset and sizes/);
    const md = readFileSync(join(dir, 'image-fixes.md'), 'utf8');
    assert.match(md, /```html/);
    assert.match(md, /sizes="/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--json carries a top-level fixes array', { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fix-json-'));
  try {
    const out = [];
    await run([`${server.origin}/page.html`, '--json'], {
      stdout: { write: (s) => out.push(s), isTTY: false },
      stderr: { write: () => {} },
      env: {},
      cwd: dir,
      openFile: () => {},
    });
    const report = JSON.parse(out.join(''));
    assert.equal(report.viewports.length, 3);
    assert.ok(Array.isArray(report.fixes));
    for (const entry of report.fixes) {
      assert.ok(typeof entry.fix.sizes === 'string');
      assert.ok(Array.isArray(entry.fix.widths));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
