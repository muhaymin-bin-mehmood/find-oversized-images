import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { ToolError } from './errors.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export const VIEWPORTS = {
  mobile: { name: 'mobile', width: 390, height: 844, dpr: 3, mobile: true },
  desktop: { name: 'desktop', width: 1366, height: 768, dpr: 1, mobile: false },
};

export const HELP = `Usage: find-oversized-images <url> [options]

Finds images whose file is much bigger than the box they are shown in.
Checks a phone viewport and a desktop viewport unless you pick one.

Options:
  --mobile             only the mobile viewport (390x844 @3x)
  --desktop            only the desktop viewport (1366x768 @1x)
  --width <px>         custom viewport width (replaces the defaults)
  --height <px>        custom viewport height (default 800)
  --dpr <n>            custom device pixel ratio (default 1)
  --threshold <n>      list images at or above this extra ratio (default 2)
  --fail-on <n>        exit 1 if any image has extra >= n (for CI)
  --json               print JSON instead of a table
  --timeout <ms>       page load timeout (default 30000)
  --browser-path <p>   path to a Chrome or Edge executable
  -h, --help           show this help
  -v, --version        show the version

Needs Chrome or Edge installed.
`;

const HINT = 'Run with --help for usage.';

/** Accept "example.com" as https://example.com. Only http and https are allowed. */
export function normalizeUrl(input) {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ToolError(`"${input}" is not a valid URL. ${HINT}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ToolError(`Only http and https URLs are supported, got ${url.protocol} ${HINT}`);
  }
  return url.href;
}

function number(value, flag, { integer = false } = {}) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || (integer && !Number.isInteger(n))) {
    throw new ToolError(`${flag} needs a ${integer ? 'whole ' : ''}number above 0, got "${value}". ${HINT}`);
  }
  return n;
}

/** Parse argv (without node and script path). Throws ToolError on bad input. */
export function parseCli(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        mobile: { type: 'boolean' },
        desktop: { type: 'boolean' },
        width: { type: 'string' },
        height: { type: 'string' },
        dpr: { type: 'string' },
        threshold: { type: 'string' },
        'fail-on': { type: 'string' },
        json: { type: 'boolean' },
        timeout: { type: 'string' },
        'browser-path': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (err) {
    throw new ToolError(`${err.message} ${HINT}`);
  }

  const { values: v, positionals } = parsed;
  if (v.help || v.version) return { help: Boolean(v.help), version: Boolean(v.version) };
  if (positionals.length !== 1) throw new ToolError(`Give exactly one URL. ${HINT}`);

  const width = number(v.width, '--width', { integer: true });
  const height = number(v.height, '--height', { integer: true });
  const dpr = number(v.dpr, '--dpr');
  if (width === undefined && (height !== undefined || dpr !== undefined)) {
    throw new ToolError(`--height and --dpr need --width. ${HINT}`);
  }

  let viewports;
  if (width !== undefined) {
    viewports = [{ name: 'custom', width, height: height ?? 800, dpr: dpr ?? 1, mobile: false }];
  } else if (v.mobile && !v.desktop) {
    viewports = [VIEWPORTS.mobile];
  } else if (v.desktop && !v.mobile) {
    viewports = [VIEWPORTS.desktop];
  } else {
    viewports = [VIEWPORTS.mobile, VIEWPORTS.desktop];
  }

  return {
    help: false,
    version: false,
    url: normalizeUrl(positionals[0]),
    viewports,
    threshold: number(v.threshold, '--threshold') ?? 2,
    failOn: number(v['fail-on'], '--fail-on') ?? null,
    json: Boolean(v.json),
    timeout: number(v.timeout, '--timeout', { integer: true }) ?? 30000,
    browserPath: v['browser-path'] ?? null,
  };
}
