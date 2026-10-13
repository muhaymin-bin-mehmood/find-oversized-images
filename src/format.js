/** Bytes as "559 KB" or "3.2 MB". null means the browser could not tell us. */
export function formatBytes(bytes) {
  if (bytes == null) return 'unknown';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function shortName(url) {
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

function table(rows) {
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)));
  return rows.map((r) =>
    r
      .map((cell, col) => (col === r.length - 1 ? cell : RIGHT[col] ? cell.padStart(widths[col]) : cell.padEnd(widths[col])))
      .join('  ')
      .trimEnd(),
  );
}

function formatViewport(vp, threshold) {
  let header = `${capitalize(vp.name)} ${vp.width}x${vp.height} @${vp.dpr}x   ${vp.imageCount} images, ${vp.totals.oversized} oversized`;
  if (vp.notLoaded > 0) header += `, ${vp.notLoaded} not loaded`;
  if (vp.lcp && !vp.lcp.isImage) header += ', LCP: not an <img>';

  const flagged = vp.images.filter((i) => i.oversized);
  if (flagged.length === 0) return `${header}\n  No images at or above ${threshold}x.`;

  const rows = [['extra', 'unused', 'file', 'shown', 'size', 'est. save', 'image']];
  for (const i of flagged) {
    let name = shortName(i.url);
    if (i.count > 1) name += `  x${i.count}`;
    if (i.isLcp) name += '  <- LCP';
    rows.push([
      `${i.extra.toFixed(1)}x`,
      `${Math.round(i.unusedPixels * 100)}%`,
      `${i.file.width}x${i.file.height}`,
      `${i.shown.width}x${i.shown.height}`,
      formatBytes(i.bytes),
      i.estSavingBytes == null ? '-' : `~${formatBytes(i.estSavingBytes)}`,
      name,
    ]);
  }

  const lines = [header, ...table(rows).map((l) => `  ${l}`)];
  lines.push(`  Total: ~${formatBytes(vp.totals.estSavingBytes)} could be saved (estimate, conservative)`);
  const unknown = flagged.filter((i) => i.bytes === null).length;
  if (unknown === 1) lines.push('  1 oversized image had no size info and is not in the total.');
  if (unknown > 1) lines.push(`  ${unknown} oversized images had no size info and are not in the total.`);
  return lines.join('\n');
}

/** Human-readable report. */
export function formatTable(report) {
  const sections = report.viewports.map((vp) => formatViewport(vp, report.threshold));
  return `${report.url}\n\n${sections.join('\n\n')}\n`;
}

/** Machine-readable report. */
export function formatJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
