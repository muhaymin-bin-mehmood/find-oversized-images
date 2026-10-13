/**
 * Pair each image's measurements across viewports.
 *
 * The join key cannot be the URL: with srcset, the file the browser picks changes
 * with the viewport by design, so the same image has a different URL in each run.
 * The raw srcset (or src) attribute does not change, so that is the identity, with
 * the dom path separating images that share one attribute.
 *
 * @param {{name:string, width:number, dpr:number, images:object[]}[]} viewports
 * @returns {object[]} one entry per image
 */
export function joinViewports(viewports) {
  const names = viewports.map((vp) => vp.name);
  const entries = new Map();

  for (const vp of viewports) {
    for (const image of vp.images) {
      const key = `${image.identity}\u0000${image.domPath}`;
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          identity: image.identity,
          domPath: image.domPath,
          from: image.from,
          srcsetAttr: image.srcset ?? null,
          sizesAttr: image.sizes ?? null,
          file: image.file,
          objectFit: image.objectFit,
          url: image.url,
          perViewport: Object.fromEntries(names.map((n) => [n, null])),
          partial: false,
          oversizedAt: [],
        };
        entries.set(key, entry);
      }
      entry.perViewport[vp.name] = {
        viewportWidth: vp.width,
        boxWidth: image.shown.width,
        dpr: vp.dpr,
        needed: image.needed,
      };
      if (image.oversized) entry.oversizedAt.push(vp.name);
    }
  }

  for (const entry of entries.values()) {
    entry.partial = names.some((n) => entry.perViewport[n] === null);
    // Keep the declared viewport order, not the order images were seen in
    entry.oversizedAt = names.filter((n) => entry.oversizedAt.includes(n));
  }
  return [...entries.values()];
}
