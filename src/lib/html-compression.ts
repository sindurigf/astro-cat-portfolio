import type { AssetsBinding } from './video-range';

/*
 * `no-transform` on pages keeps Cloudflare from compressing them
 * (ARCHITECTURE.md#rules-and-caching), so the Worker gzips the largest itself.
 * Each path is also in `run_worker_first` in wrangler.jsonc.
 */
export const COMPRESSED_PAGE_PATHS: ReadonlySet<string> = new Set([
  '/about/',
  '/brand/',
]);

const GZIP = 'gzip';
const ANY_CODING = '*';
const READ_METHODS = new Set(['GET', 'HEAD']);
const HTTP_OK = 200;
const WEAK_PREFIX = 'W/';

/* Workers-only: the body is gzip already, so the runtime must not encode it again. */
type WorkerResponseInit = ResponseInit & { encodeBody: 'manual' };

export const isCompressedPage = (request: Request): boolean =>
  COMPRESSED_PAGE_PATHS.has(new URL(request.url).pathname);

const qualityOf = (parameters: string[]): number => {
  const q = parameters.find((parameter) => parameter.trim().startsWith('q='));
  if (q === undefined) return 1;
  const value = Number(q.trim().slice(2));
  return Number.isFinite(value) ? value : 0;
};

/** RFC 9110 section 12.5.3: gzip listed above q=0, or `*` above q=0 with gzip unlisted. */
export const acceptsGzip = (acceptEncoding: string | null): boolean => {
  if (acceptEncoding === null) return false;
  const codings = new Map<string, number>();
  for (const entry of acceptEncoding.split(',')) {
    const [name = '', ...parameters] = entry.split(';');
    codings.set(name.trim().toLowerCase(), qualityOf(parameters));
  }
  const gzip = codings.get(GZIP) ?? codings.get(ANY_CODING);
  return gzip !== undefined && gzip > 0;
};

/* RFC 9110 section 8.8.3: a strong ETag names one encoding; the gzip body gets a weak one. */
const weak = (etag: string): string =>
  etag.startsWith(WEAK_PREFIX) ? etag : `${WEAK_PREFIX}${etag}`;

/* The asset layer compares strongly, so a weak validator from the gzip body would never match. */
const strongValidators = (ifNoneMatch: string): string =>
  ifNoneMatch.replaceAll(WEAK_PREFIX, '');

const identityRequest = (request: Request): Request => {
  const headers = new Headers(request.headers);
  headers.delete('Accept-Encoding');
  const ifNoneMatch = headers.get('If-None-Match');
  if (ifNoneMatch !== null) {
    headers.set('If-None-Match', strongValidators(ifNoneMatch));
  }
  return new Request(request.url, { method: request.method, headers });
};

const isHtml = (response: Response): boolean =>
  response.headers.get('Content-Type')?.startsWith('text/html') ?? false;

export const serveCompressedPage = async (
  request: Request,
  assets: AssetsBinding,
): Promise<Response> => {
  const gzip =
    READ_METHODS.has(request.method) &&
    acceptsGzip(request.headers.get('Accept-Encoding'));
  const asset = await assets.fetch(gzip ? identityRequest(request) : request);
  const headers = new Headers(asset.headers);
  headers.append('Vary', 'Accept-Encoding');
  if (!gzip) return new Response(asset.body, { status: asset.status, headers });

  const etag = headers.get('ETag');
  if (etag !== null) headers.set('ETag', weak(etag));
  if (asset.status !== HTTP_OK || !isHtml(asset)) {
    return new Response(asset.body, { status: asset.status, headers });
  }

  headers.set('Content-Encoding', GZIP);
  headers.delete('Content-Length');
  const init: WorkerResponseInit = {
    status: asset.status,
    headers,
    encodeBody: 'manual',
  };
  return new Response(
    asset.body?.pipeThrough(new CompressionStream(GZIP)) ?? null,
    init,
  );
};
