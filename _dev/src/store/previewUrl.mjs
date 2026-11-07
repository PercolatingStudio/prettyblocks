export function withPrettyBlocksMode(value, baseUrl, currentUrl = baseUrl) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const shop = baseUrl ? new URL(baseUrl) : undefined;
    const base = currentUrl ? new URL(currentUrl, shop) : shop;
    const url = new URL(value, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    // Keep the shop-relative /path convention from #261 on subdirectory shops,
    // without adding the shop directory twice to an already prefixed URL.
    if (shop && url.origin === shop.origin && /^\/(?!\/)/.test(value)) {
      const directory = shop.pathname.replace(/\/$/, '');
      if (directory && url.pathname !== directory && !url.pathname.startsWith(directory + '/')) {
        url.pathname = directory + url.pathname;
      }
    }

    // Combination fragments must stay intact; the edit flag belongs to the query.
    url.searchParams.set('prettyblocks', '1');
    return url.href;
  } catch {
    return null;
  }
}
