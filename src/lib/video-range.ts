import { errorMessage } from './errors';
import {
  type ByteRange,
  UNSATISFIABLE,
  WHOLE_FILE,
  contentRange,
  parseRange,
  sliceStream,
  unsatisfiedRange,
} from './byte-range';

/*
 * Workers static assets answer `Range` with 200; Safari and iOS need 206, so
 * `run_worker_first` routes /videos/ here. Not dead code.
 */

export const VIDEO_PATH_PREFIX = '/videos/';

/* From astro.config.mjs: ASSETS streams without a Content-Length. */
declare const __VIDEO_SIZES__: Readonly<Record<string, number>>;

/* Sets Content-Length on a stream; Safari rejects a chunked 206. */
declare const FixedLengthStream: new (length: number) => {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
};

const withLength = (
  body: ReadableStream<Uint8Array>,
  length: number,
): ReadableStream<Uint8Array> => {
  const { readable, writable } = new FixedLengthStream(length);
  body.pipeTo(writable).catch((error: unknown) => {
    console.error('video range: stream failed:', errorMessage(error));
  });
  return readable;
};

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

const HTTP_PARTIAL_CONTENT = 206;
const HTTP_RANGE_NOT_SATISFIABLE = 416;
const READ_METHODS = new Set(['GET', 'HEAD']);

export const isVideoRequest = (request: Request): boolean =>
  new URL(request.url).pathname.startsWith(VIDEO_PATH_PREFIX);

/* Drops Range and Accept-Encoding so offsets count raw, uncompressed bytes. */
const assetRequest = (request: Request): Request => {
  const headers = new Headers();
  for (const name of ['If-None-Match', 'If-Modified-Since']) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Request(request.url, { method: 'GET', headers });
};

const rangeStillValid = (request: Request, asset: Response): boolean => {
  const ifRange = request.headers.get('If-Range');
  if (ifRange === null) return true;
  return ifRange === asset.headers.get('ETag');
};

type Body = ReadableStream<Uint8Array>;

const drained = async (body: Body): Promise<null> => {
  await body.cancel();
  return null;
};

const wholeFile = async (
  asset: Response,
  body: Body,
  headers: Headers,
  size: number,
  isHead: boolean,
): Promise<Response> =>
  new Response(isHead ? await drained(body) : withLength(body, size), {
    status: asset.status,
    headers,
  });

const unsatisfiable = async (
  body: Body,
  headers: Headers,
  size: number,
): Promise<Response> => {
  await drained(body);
  headers.set('Content-Range', unsatisfiedRange(size));
  headers.delete('Content-Length');
  return new Response(null, { status: HTTP_RANGE_NOT_SATISFIABLE, headers });
};

const partial = async (
  body: Body,
  headers: Headers,
  range: ByteRange,
  size: number,
  isHead: boolean,
): Promise<Response> => {
  const length = range.end - range.start + 1;
  headers.set('Content-Range', contentRange(range, size));
  headers.set('Content-Length', String(length));
  return new Response(
    isHead ? await drained(body) : withLength(sliceStream(body, range), length),
    { status: HTTP_PARTIAL_CONTENT, headers },
  );
};

export const serveVideo = async (
  request: Request,
  assets: AssetsBinding,
): Promise<Response> => {
  if (!READ_METHODS.has(request.method)) return assets.fetch(request);

  const asset = await assets.fetch(assetRequest(request));
  const isHead = request.method === 'HEAD';

  const size = __VIDEO_SIZES__[new URL(request.url).pathname] ?? 0;
  const { body } = asset;
  if (!asset.ok || body === null || size <= 0) return asset;

  const headers = new Headers(asset.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(size));

  const range = rangeStillValid(request, asset)
    ? parseRange(request.headers.get('Range'), size)
    : WHOLE_FILE;

  if (range === WHOLE_FILE) {
    return wholeFile(asset, body, headers, size, isHead);
  }
  if (range === UNSATISFIABLE) return unsatisfiable(body, headers, size);
  return partial(body, headers, range, size, isHead);
};
