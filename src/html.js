import { formatBytes, shortName } from './format.js';
import { groupFindings } from './group.js';

const THUMBS_SHOWN = 12;
const AUDITOR_URL = 'https://batchset.com/tools/website-image-auditor';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** The URL if it is http(s), else null. Everything from the page is untrusted. */
function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function thumb(image) {
  const href = safeUrl(image.url);
  const name = esc(shortName(image.url));
  const meta = `${image.file.width}x${image.file.height} &middot; ${esc(formatBytes(image.bytes))}${image.count > 1 ? ` &middot; used ${image.count}x` : ''}`;
  const picture = href
    ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"><img src="${esc(href)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`
    : '<span class="nopreview">no preview</span>';
  return `<li>${picture}<span class="name" title="${esc(image.url)}">${name}</span><span class="meta">${meta}</span></li>`;
}

function groupHtml(g) {
  const n = g.images.length;
  const save = g.estSavingBytes == null ? '' : ` &middot; ~${esc(formatBytes(g.estSavingBytes))} could be saved`;
  const head =
    `<span class="extra">${g.extra.toFixed(1)}x</span> ` +
    `<span>${n === 1 ? '1 image' : `${n} images`}: file ${g.file.width}x${g.file.height}, shown at ${g.shown.width}x${g.shown.height}, ${Math.round(g.unusedPixels * 100)}% of pixels unused</span>` +
    `<span class="sizes">${esc(formatBytes(g.bytes))}${save}</span>` +
    (g.isLcp ? ' <span class="badge">LCP</span>' : '');
  const fix = g.fix ? `<p class="fix"><b>Fix:</b> ${esc(g.fix.advice)}</p>` : '';
  const shown = g.images.slice(0, THUMBS_SHOWN).map(thumb).join('');
  const rest = g.images.slice(THUMBS_SHOWN);
  const more = rest.length ? `<details><summary>Show ${rest.length} more</summary><ul class="thumbs">${rest.map(thumb).join('')}</ul></details>` : '';
  return `<article class="group"><div class="head">${head}</div>${fix}<ul class="thumbs">${shown}</ul>${more}</article>`;
}

function viewportHtml(vp, threshold) {
  const title = `<h2>${esc(capitalize(vp.name))} ${vp.width}x${vp.height} @${vp.dpr}x</h2>`;
  const flagged = vp.images.filter((i) => i.oversized);
  let summary = `<b>${vp.totals.oversized}</b> oversized of ${vp.imageCount} images`;
  if (vp.notLoaded > 0) summary += ` &middot; ${vp.notLoaded} not loaded`;
  if (flagged.length) summary += ` &middot; about <b>${esc(formatBytes(vp.totals.estSavingBytes))}</b> could be saved (estimate, conservative)`;
  const lcpNote = vp.lcp && !vp.lcp.isImage ? '<p class="note">The Largest Contentful Paint element is not an &lt;img&gt;.</p>' : '';
  const body = flagged.length ? groupFindings(flagged).map(groupHtml).join('') : `<p class="ok">No images at or above ${esc(threshold)}x.</p>`;
  return `<section>${title}<p class="summary">${summary}</p>${lcpNote}${body}</section>`;
}

const STYLE = `
:root{--bg:#F7F4EE;--card:#FFFFFF;--text:#1A1A1A;--muted:#5b5b55;--line:#E6E3DA;--accent:#0E483A;--accent-soft:#e3ece6;--thumb:#efece5}
@media (prefers-color-scheme:dark){:root{--bg:#0A2924;--card:#10332d;--text:#FFFFFF;--muted:#b7c4c0;--line:#22453f;--accent:#7CA98B;--accent-soft:#17403a;--thumb:#0d2f29}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 48px}
a{color:var(--accent)}
h1{font-size:24px;margin:0 0 4px}
h2{font-size:18px;margin:32px 0 4px}
.url{word-break:break-all;margin:0}
.meta-line,.note,.summary{color:var(--muted);margin:4px 0}
.summary b{color:var(--text)}
.group{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin:14px 0}
.head{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline}
.extra{font-weight:700;color:var(--accent);font-size:18px}
.sizes{color:var(--muted)}
.badge{background:var(--accent);color:var(--bg);border-radius:6px;padding:0 6px;font-size:12px;font-weight:700}
.fix{background:var(--accent-soft);border-radius:8px;padding:8px 10px;margin:10px 0}
.thumbs{list-style:none;padding:0;margin:10px 0 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.thumbs li{display:flex;flex-direction:column;gap:2px;min-width:0}
.thumbs img,.nopreview{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:var(--thumb);border:1px solid var(--line);border-radius:8px}
.nopreview{display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px}
.name{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.thumbs .meta{font-size:12px;color:var(--muted)}
details summary{cursor:pointer;margin-top:10px;color:var(--accent)}
.ok{color:var(--muted)}
footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
`;

/**
 * A self-contained HTML report: no scripts, images load from their own hosts.
 * @param {object} report
 * @param {{generatedAt?: Date}} [options]
 */
export function formatHtml(report, { generatedAt = new Date() } = {}) {
  const pageUrl = safeUrl(report.url);
  let host = report.url;
  try {
    host = new URL(report.url).host;
  } catch {}
  const urlLine = pageUrl ? `<a href="${esc(pageUrl)}" rel="noopener noreferrer">${esc(pageUrl)}</a>` : esc(report.url);
  const date = generatedAt.toISOString().slice(0, 16).replace('T', ' ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https:; style-src 'unsafe-inline'">
<meta name="referrer" content="no-referrer">
<title>Oversized images on ${esc(host)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header>
<h1>Oversized images</h1>
<p class="url">${urlLine}</p>
<p class="meta-line">Checked ${esc(date)} UTC with find-oversized-images ${esc(report.version)}. Images whose file is ${esc(report.threshold)}x or more wider than the screen can use are listed. Click an image to open the file.</p>
</header>
${report.viewports.map((vp) => viewportHtml(vp, report.threshold)).join('\n')}
<footer>Want the files fixed, not just listed? The free <a href="${AUDITOR_URL}">Website Image Auditor</a> optimizes flagged images in your browser.</footer>
</main>
</body>
</html>
`;
}
