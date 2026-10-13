import { groupFindings } from './group.js';
import { hyperlink } from './links.js';

/** Bytes as "559 KB" or "3.2 MB". null means the browser could not tell us. */
export function formatBytes(bytes) {
  if (bytes == null) return 'unknown';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** Last path segment of an image URL, cut to 40 characters. */
export function shortName(url) {
  let name;
  try {
    const u = new URL(url);
    name = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
  } catch {
    name = url;
  }
  return name.length > 40 ? `${name.slice(0, 37)}...` : name;
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Columns: extra, unused, file, shown, size, est. save, image. Numbers are right-aligned.
const RIGHT = [true, true, false, false, true, true, false];

// The last column is never padded, so it may hold link escape codes
function table(rows) {
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)));
  return rows.map((r) =>
    r
      .map((cell, col) => (col === r.length - 1 ? cell : RIGHT[col] ? cell.padStart(widths[col]) : cell.padEnd(widths[col])))
      .join('  ')
      .trimEnd(),
  );
}

function imageCell(group, links) {
  const [first] = group.images;
  const name = links ? hyperlink(shortName(first.url), first.url) : shortName(first.url);
  let cell = group.images.length > 1 ? `${group.images.length} images, e.g. ${name}` : name;
  if (group.images.length === 1 && first.count > 1) cell += `  x${first.count}`;
  if (group.isLcp) cell += '  <- LCP';
  return cell;
}

function formatViewport(vp, threshold, { all, links }) {
  let header = `${capitalize(vp.name)} ${vp.width}x${vp.height} @${vp.dpr}x   ${vp.imageCount} images, ${vp.totals.oversized} oversized`;
  if (vp.notLoaded > 0) header += `, ${vp.notLoaded} not loaded`;
  if (vp.lcp && !vp.lcp.isImage) header += ', LCP: not an <img>';

  const flagged = vp.images.filter((i) => i.oversized);
  if (flagged.length === 0) return `${header}\n  No images at or above ${threshold}x.`;

  const groups = all ? flagged.flatMap((i) => groupFindings([i])) : groupFindings(flagged);
  const rows = [['extra', 'unused', 'file', 'shown', 'size', 'est. save', 'image']];
  for (const g of groups) {
    rows.push([
      `${g.extra.toFixed(1)}x`,
      `${Math.round(g.unusedPixels * 100)}%`,
      `${g.file.width}x${g.file.height}`,
      `${g.shown.width}x${g.shown.height}`,
      formatBytes(g.bytes),
      g.estSavingBytes == null ? '-' : `~${formatBytes(g.estSavingBytes)}`,
      imageCell(g, links),
    ]);
  }

  const [head, ...body] = table(rows);
  const lines = [header, `  ${head}`];
  body.forEach((line, k) => {
    lines.push(`  ${line}`);
    if (groups[k].fix) lines.push(`    Fix: ${groups[k].fix.advice}`);
  });
  lines.push(`  Total: ~${formatBytes(vp.totals.estSavingBytes)} could be saved (estimate, conservative)`);
  const unknown = flagged.filter((i) => i.bytes === null).length;
  if (unknown === 1) lines.push('  1 oversized image had no size info and is not in the total.');
  if (unknown > 1) lines.push(`  ${unknown} oversized images had no size info and are not in the total.`);
  return lines.join('\n');
}

/**
 * Human-readable report.
 * @param {object} report
 * @param {{all?: boolean, links?: boolean}} [options] all: one row per image instead of
 *   grouping; links: make image names clickable (OSC 8) in terminals that support it
 */
export function formatTable(report, { all = false, links = false } = {}) {
  const sections = report.viewports.map((vp) => formatViewport(vp, report.threshold, { all, links }));
  return `${report.url}\n\n${sections.join('\n\n')}\n`;
}

/** Machine-readable report. */
export function formatJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
