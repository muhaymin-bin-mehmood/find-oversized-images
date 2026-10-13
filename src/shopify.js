/** Shopify's image CDN resizes any file on request with a width= parameter. */
export function isShopifyCdn(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'cdn.shopify.com' || u.pathname.includes('/cdn/shop/');
  } catch {
    return false;
  }
}

/** The same Shopify URL at a given width. Other parameters are kept; height is dropped. */
export function shopifyUrl(url, width) {
  const u = new URL(url);
  u.searchParams.delete('height');
  u.searchParams.set('width', String(width));
  return u.href;
}

/** A name for a file that does not exist yet: hero.jpg at 400 becomes hero-400.jpg. */
export function placeholderName(url, width) {
  let path = url;
  try {
    path = new URL(url, 'https://example.invalid').pathname;
  } catch {}
  const base = path.split('/').filter(Boolean).pop() || 'image';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '.jpg';
  return `${stem}-${width}${ext}`;
}
