/**
 * @typedef {object} Candidate
 * @property {string} url
 * @property {number|null} w  width descriptor, e.g. 400 for "400w"
 * @property {number|null} x  density descriptor, e.g. 2 for "2x"; 1 when there is none
 */

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

/**
 * Parse a srcset attribute the way browsers do (simplified HTML spec algorithm).
 * URLs may contain commas, so a candidate ends at whitespace, not at a comma.
 * Candidates with descriptors we cannot read are dropped, as browsers drop them.
 * @param {string|null|undefined} srcset
 * @returns {Candidate[]}
 */
export function parseSrcset(srcset) {
  const s = srcset ?? '';
  const out = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && (isSpace(s[i]) || s[i] === ',')) i++;
    if (i >= s.length) break;

    let start = i;
    while (i < s.length && !isSpace(s[i])) i++;
    let url = s.slice(start, i);
    let descriptors = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, ''); // "a.jpg," ends the candidate with no descriptors
    } else {
      start = i;
      let depth = 0;
      while (i < s.length && !(s[i] === ',' && depth === 0)) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')') depth = Math.max(0, depth - 1);
        i++;
      }
      descriptors = s.slice(start, i).trim();
      i++; // past the comma
    }
    if (!url) continue;

    const candidate = readDescriptors(descriptors);
    if (candidate) out.push({ url, ...candidate });
  }
  return out;
}

function readDescriptors(text) {
  if (text === '') return { w: null, x: 1 };
  let w = null;
  let x = null;
  for (const d of text.split(/\s+/)) {
    const m = /^(\d+(?:\.\d+)?)([wx])$/.exec(d);
    if (!m) {
      if (/^\d+h$/.test(d)) continue; // height descriptors are allowed and ignored
      return null;
    }
    const n = Number(m[1]);
    if (!(n > 0)) return null;
    if (m[2] === 'w') {
      if (w !== null || !Number.isInteger(n)) return null;
      w = n;
    } else {
      if (x !== null) return null;
      x = n;
    }
  }
  if (w !== null && x !== null) return null;
  return w !== null ? { w, x: null } : { w: null, x: x ?? 1 };
}
