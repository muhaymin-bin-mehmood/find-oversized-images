import { chromium } from 'playwright-core';
import { ToolError, firstLine } from './errors.js';

/**
 * Start the user's installed Chrome, else Edge, headless.
 * @param {{browserPath?: string|null}} [options]
 */
export async function launchBrowser({ browserPath = null } = {}) {
  if (browserPath) {
    try {
      return await chromium.launch({ executablePath: browserPath });
    } catch (err) {
      throw new ToolError(`Could not start the browser at ${browserPath}: ${firstLine(err)}`);
    }
  }
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // not installed, try the next one
    }
  }
  throw new ToolError('Could not find Chrome or Edge. Install one of them, or pass --browser-path <path to chrome or msedge>.');
}
