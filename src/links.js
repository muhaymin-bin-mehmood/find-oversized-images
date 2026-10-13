const ESC = '\x1b';

/**
 * Whether the terminal turns OSC 8 sequences into clickable links. The classic
 * Windows console (cmd.exe without Windows Terminal) does not, so it stays off
 * unless the terminal is one we know. FORCE_HYPERLINK=0 or 1 overrides.
 * @param {{env: Record<string, string|undefined>, isTTY: boolean}} target
 */
export function supportsHyperlinks({ env, isTTY }) {
  if (env.FORCE_HYPERLINK !== undefined && env.FORCE_HYPERLINK !== '') return env.FORCE_HYPERLINK !== '0';
  if (!isTTY) return false;
  if (env.WT_SESSION || env.KITTY_WINDOW_ID || env.DOMTERM) return true;
  if (['vscode', 'iTerm.app', 'WezTerm', 'ghostty'].includes(env.TERM_PROGRAM)) return true;
  return Number(env.VTE_VERSION) >= 5000;
}

/** Text that opens `url` when clicked. Anything but an http(s) URL is left as plain text. */
export function hyperlink(text, url) {
  let href;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return text;
    href = u.href.replace(/[\x00-\x1f\x7f]/g, ''); // nothing that could end the sequence early
  } catch {
    return text;
  }
  const ST = `${ESC}\\`; // string terminator
  return `${ESC}]8;;${href}${ST}${text}${ESC}]8;;${ST}`;
}
