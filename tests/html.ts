/** A request for a raster image, as the failed-photo tests abort it. */
export const IMAGE_REQUEST = /\.(webp|avif|jpe?g|png|gif)(\?|$)/;

/** The first JSON-LD block, with any attribute order or quoting. */
export const LD_JSON =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i;

/** A <meta>'s content by `name` or `property`, in any attribute order; null when absent. */
export const metaContent = (html: string, key: string): string | null => {
  const escaped = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const keyAttr = new RegExp(`\\s(?:property|name)=["']${escaped}["']`, 'i');
  const tag = html.match(/<meta\b[^>]*>/gi)?.find((t) => keyAttr.test(t));
  if (!tag) return null;
  return /\scontent=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
};
