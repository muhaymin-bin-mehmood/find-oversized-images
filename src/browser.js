import { chromium } from 'playwright-core';
import { ToolError, firstLine } from './errors.js';

const CHANNELS = [
  ['chrome', 'Chrome'],
  ['msedge', 'Edge'],
];

// Playwright's message when a channel's executable is simply not there
const isNotInstalled = (err) => /is not found at|doesn't exist|ENOENT/i.test(String(err?.message ?? err));

/**
 * Start the user's installed Chrome, else Edge, headless.
 * @param {{browserPath?: string|null, launch?: (options: object) => Promise<any>}} [options]
 *   `launch` is only replaced in tests.
 */
export async function launchBrowser({ browserPath = null, launch = (o) => chromium.launch(o) } = {}) {
  if (browserPath) {
    try {
      return await launch({ executablePath: browserPath });
    } catch (err) {
      throw new ToolError(`Could not start the browser at ${browserPath}: ${firstLine(err)}`);
    }
  }
  const failures = [];
  for (const [channel, name] of CHANNELS) {
    try {
      return await launch({ channel });
    } catch (err) {
      if (!isNotInstalled(err)) failures.push(`${name} is installed but failed to start: ${firstLine(err)}`);
    }
  }
  if (failures.length) throw new ToolError(`${failures.join('. ')}. Pass --browser-path <path to chrome or msedge> to use another browser.`);
  throw new ToolError('Could not find Chrome or Edge. Install one of them, or pass --browser-path <path to chrome or msedge>.');
}
