import test from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from '../src/browser.js';
import { ToolError } from '../src/errors.js';

const notFound = (channel) => new Error(`Chromium distribution '${channel}' is not found at /opt/${channel}\nRun "npx playwright install ${channel}"`);

test('falls back from Chrome to Edge', async () => {
  const tried = [];
  const browser = await launchBrowser({
    launch: async ({ channel }) => {
      tried.push(channel);
      if (channel === 'chrome') throw notFound('chrome');
      return 'edge-browser';
    },
  });
  assert.equal(browser, 'edge-browser');
  assert.deepEqual(tried, ['chrome', 'msedge']);
});

test('says not found when neither browser is installed', async () => {
  await assert.rejects(
    launchBrowser({ launch: async ({ channel }) => { throw notFound(channel); } }),
    (err) => err instanceof ToolError && /^Could not find Chrome or Edge\./.test(err.message),
  );
});

test('reports why an installed browser failed to start', async () => {
  await assert.rejects(
    launchBrowser({
      launch: async ({ channel }) => {
        if (channel === 'chrome') throw new Error('error while loading shared libraries: libnss3.so\nmore log');
        throw notFound(channel);
      },
    }),
    (err) =>
      err instanceof ToolError &&
      /Chrome is installed but failed to start: error while loading shared libraries: libnss3\.so/.test(err.message) &&
      /--browser-path/.test(err.message),
  );
});
