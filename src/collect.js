import { ToolError, firstLine } from './errors.js';

const SCROLL_MAX_STEPS = 20;
const SCROLL_MAX_MS = 15000;
const SETTLE_MAX_MS = 3000;
const DECODE_MAX_MS = 5000;
// Types a <source> may name that Chrome and Edge can decode
const DECODABLE = ['image/avif', 'image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/apng', 'image/bmp', 'image/x-icon'];

/** Reject with a ToolError if `promise` has not settled within `ms`. */
function withDeadline(promise, ms, message) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ToolError(message)), ms);
  });
  promise.catch(() => {}); // a step that loses the race rejects later, when the context closes
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// The functions below run inside the page, so they must not use anything from this module.

function readLcp() {
  return new Promise((resolve) => {
    let last = null;
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      last = entries[entries.length - 1];
    });
    try {
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      resolve(null);
      return;
    }
    setTimeout(() => {
      observer.disconnect();
      resolve(last ? { url: last.url || null, isImage: Boolean(last.element) && last.element.tagName === 'IMG' } : null);
    }, 100);
  });
}

async function scrollThrough({ maxSteps, maxMs }) {
  const start = Date.now();
  for (let i = 0; i < maxSteps && Date.now() - start < maxMs; i++) {
    const before = window.scrollY;
    window.scrollBy(0, window.innerHeight);
    await new Promise((r) => setTimeout(r, 250));
    if (window.scrollY === before) break;
  }
  window.scrollTo(0, 0);
}

async function waitForImages(maxMs) {
  const end = Date.now() + maxMs;
  const busy = () => [...document.images].some((img) => !img.complete);
  while (busy() && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
}

async function readImages({ decodable, decodeMaxMs }) {
  // The srcset and sizes the browser used: the first matching <source> in a <picture>, else the <img>
  const chosenSrcset = (img) => {
    const picture = img.parentElement?.tagName === 'PICTURE' ? img.parentElement : null;
    if (picture) {
      for (const source of picture.querySelectorAll(':scope > source')) {
        if (!source.getAttribute('srcset')) continue;
        if (source.media && !matchMedia(source.media).matches) continue;
        if (source.type && !decodable.includes(source.type.trim().toLowerCase())) continue;
        return { srcset: source.getAttribute('srcset'), sizes: source.getAttribute('sizes') };
      }
    }
    return { srcset: img.getAttribute('srcset'), sizes: img.getAttribute('sizes') };
  };

  // With srcset, naturalWidth is "density-corrected": a 1600px file picked for an
  // 800px slot reports 800. Decode the file on its own to get its real pixels.
  const filePixels = (url) =>
    new Promise((resolve) => {
      const probe = new Image();
      const done = (size) => {
        clearTimeout(timer);
        resolve(size);
      };
      const timer = setTimeout(() => done(null), decodeMaxMs);
      probe.onload = () => done(probe.naturalWidth > 0 ? { width: probe.naturalWidth, height: probe.naturalHeight } : null);
      probe.onerror = () => done(null);
      probe.src = url;
    });

  const images = [];
  const pending = [];
  let notLoaded = 0;
  for (const img of document.images) {
    const url = img.currentSrc || img.src;
    if (!url || url.startsWith('data:') || /\.svg(\?|#|$)/i.test(url)) continue;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue; // hidden
    if (!img.complete || img.naturalWidth === 0) {
      notLoaded++;
      continue;
    }
    const style = getComputedStyle(img);
    const px = (prop) => parseFloat(style[prop]) || 0;
    // Content box: the image is drawn inside padding and border, not over them
    const boxWidth = rect.width - px('paddingLeft') - px('paddingRight') - px('borderLeftWidth') - px('borderRightWidth');
    const boxHeight = rect.height - px('paddingTop') - px('paddingBottom') - px('borderTopWidth') - px('borderBottomWidth');
    if (boxWidth <= 0 || boxHeight <= 0) continue;
    const { srcset, sizes } = chosenSrcset(img);
    const entry = {
      url,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      boxWidth,
      boxHeight,
      objectFit: style.objectFit,
      srcset: srcset || null,
      sizes: sizes ?? null,
    };
    images.push(entry);
    if (srcset) {
      pending.push(
        filePixels(url).then((size) => {
          if (size) Object.assign(entry, { naturalWidth: size.width, naturalHeight: size.height });
        }),
      );
    }
  }
  await Promise.all(pending);
  return { images, notLoaded };
}

/**
 * A normal Chrome user agent for the viewport. Some sites pick markup and image
 * sizes by user agent, so the mobile run has to look like a phone, the same way
 * Lighthouse's device emulation does.
 * @param {{mobile:boolean}} viewport
 * @param {string} browserVersion e.g. "155.0.7012.3"
 */
function userAgentFor(viewport, browserVersion) {
  const chrome = `Chrome/${browserVersion.split('.')[0]}.0.0.0`;
  return viewport.mobile
    ? `Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) ${chrome} Mobile Safari/537.36`
    : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ${chrome} Safari/537.36`;
}

/**
 * Open the page at one viewport size and return raw image data.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {{name:string, width:number, height:number, dpr:number, mobile:boolean}} viewport
 * @param {{timeout:number}} options
 */
export async function collectViewport(browser, url, viewport, { timeout }) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    userAgent: userAgentFor(viewport, browser.version()),
  });
  try {
    const page = await context.newPage();

    // Bytes on the wire per image URL, read from the network so cross-origin
    // images count too. A redirected image is stored under every URL in its
    // chain, because currentSrc is the URL before the redirect.
    const bytesByUrl = new Map();
    const pending = [];
    page.on('requestfinished', (request) => {
      if (request.resourceType() !== 'image' || request.redirectedTo()) return;
      pending.push(
        request.sizes().then(
          ({ responseBodySize }) => {
            for (let r = request; r; r = r.redirectedFrom()) bytesByUrl.set(r.url(), responseBodySize);
          },
          () => {},
        ),
      );
    });

    let response;
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout });
    } catch (err) {
      if (err.name === 'TimeoutError') {
        throw new ToolError(`The page did not finish loading within ${timeout} ms (${viewport.name} viewport). Try a larger --timeout.`);
      }
      throw new ToolError(`Could not open ${url}: ${firstLine(err)}`);
    }
    if (response && response.status() >= 400) throw new ToolError(`${url} returned HTTP ${response.status()}.`);

    // A script that spins after load would block page.evaluate forever. Each step
    // gets the time it can take on a healthy page plus --timeout, then gives up.
    const step = (promise, expectedMs = 0) =>
      withDeadline(
        promise,
        expectedMs + timeout,
        `The page stopped responding after it loaded (${viewport.name} viewport). A script on it may be stuck. Try a larger --timeout.`,
      );

    // Read LCP before scrolling, so scrolling cannot change it
    await page.waitForTimeout(1000);
    const lcp = await step(page.evaluate(readLcp), 100);

    await step(page.evaluate(scrollThrough, { maxSteps: SCROLL_MAX_STEPS, maxMs: SCROLL_MAX_MS }), SCROLL_MAX_MS + 250);
    await step(page.evaluate(waitForImages, SETTLE_MAX_MS), SETTLE_MAX_MS + 100);
    const { images, notLoaded } = await step(
      page.evaluate(readImages, { decodable: DECODABLE, decodeMaxMs: DECODE_MAX_MS }),
      DECODE_MAX_MS + 100,
    );

    await step(
      (async () => {
        while (pending.length) await Promise.all(pending.splice(0));
      })(),
    );
    return { images, notLoaded, lcp, bytesByUrl };
  } finally {
    await context.close();
  }
}
