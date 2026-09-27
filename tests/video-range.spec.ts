import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { VIDEO_FIXTURE_NAME } from '../playwright.worker.config';
import { wranglerConfig } from './source';
import {
  UNSATISFIABLE,
  WHOLE_FILE,
  parseRange,
  sliceStream,
} from '../src/lib/byte-range';
import {
  isVideoRequest,
  serveVideo,
  VIDEO_PATH_PREFIX,
} from '../src/lib/video-range';

/*
 * Safari and iOS need a 206 for a Range before playing video; Workers static assets
 * send the whole file. Not dead code. Runs under playwright.worker.config.ts.
 */

const VIDEO_DIR = 'public/videos';
const SIZE = 5_000;

/* Copied into the build by playwright.worker.config.ts; no real video ships. */
const FIXTURE_PATH = `tests/fixtures/${VIDEO_FIXTURE_NAME}`;

const chunked = (
  bytes: Uint8Array,
  chunk: number,
): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      for (let at = 0; at < bytes.length; at += chunk) {
        controller.enqueue(bytes.subarray(at, at + chunk));
      }
      controller.close();
    },
  });

test.describe('parseRange', () => {
  test('reads a closed, an open and a suffix range', () => {
    expect(parseRange('bytes=0-99', SIZE)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=4900-', SIZE)).toEqual({ start: 4900, end: 4999 });
    expect(parseRange('bytes=-100', SIZE)).toEqual({ start: 4900, end: 4999 });
  });

  test('clamps an end past the file and a suffix longer than it', () => {
    expect(parseRange('bytes=10-999999', SIZE)).toEqual({
      start: 10,
      end: 4999,
    });
    expect(parseRange('bytes=-999999', SIZE)).toEqual({ start: 0, end: 4999 });
  });

  test('refuses a start past the end, and an empty suffix', () => {
    expect(parseRange(`bytes=${SIZE}-`, SIZE)).toBe(UNSATISFIABLE);
    expect(parseRange('bytes=-0', SIZE)).toBe(UNSATISFIABLE);
  });

  test('ignores what it does not serve rather than refusing it', () => {
    for (const header of [
      null,
      'bytes=0-1,5-6',
      'items=0-1',
      'bytes=-',
      'bytes=9-3',
      'nonsense',
    ]) {
      expect(parseRange(header, SIZE), String(header)).toBe(WHOLE_FILE);
    }
  });
});

test.describe('sliceStream', () => {
  const collect = async (
    stream: ReadableStream<Uint8Array>,
  ): Promise<number[]> => [
    ...new Uint8Array(await new Response(stream).arrayBuffer()),
  ];

  const source = Uint8Array.from({ length: 100 }, (_, index) => index);

  test('returns exactly the range, across chunk boundaries', async () => {
    const CHUNK = 7;
    for (const [start, end] of [
      [0, 0],
      [0, 99],
      [6, 7],
      [50, 63],
      [99, 99],
    ] as const) {
      expect(
        await collect(sliceStream(chunked(source, CHUNK), { start, end })),
        `${start}-${end}`,
      ).toEqual([...source.subarray(start, end + 1)]);
    }
  });
});

test.describe('serveVideo, against an in-memory file', () => {
  const FAKE_URL = 'https://example.com/videos/fake.mp4';
  const fake = Uint8Array.from({ length: SIZE }, (_, index) => index % 251);
  /* Streamed in pieces, as the ASSETS binding does, so offsets cross chunks. */
  const ASSET_CHUNK = 64;

  // Node lacks both Worker globals; restored after, as later specs share this process.
  const WORKER_GLOBALS = ['__VIDEO_SIZES__', 'FixedLengthStream'] as const;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  test.beforeAll(() => {
    for (const name of WORKER_GLOBALS) {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    }
    Object.assign(globalThis, {
      __VIDEO_SIZES__: { '/videos/fake.mp4': SIZE },
      FixedLengthStream: class {
        readonly readable: ReadableStream<Uint8Array>;
        readonly writable: WritableStream<Uint8Array>;
        constructor() {
          ({ readable: this.readable, writable: this.writable } =
            new TransformStream<Uint8Array, Uint8Array>());
        }
      },
    });
  });
  test.afterAll(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  const assets = {
    fetch: async (): Promise<Response> =>
      new Response(chunked(fake, ASSET_CHUNK), {
        headers: { 'Content-Type': 'video/mp4', ETag: '"fake"' },
      }),
  };

  const get = (headers: Record<string, string> = {}, method = 'GET') =>
    serveVideo(new Request(FAKE_URL, { method, headers }), assets);

  test('no Range is the whole file, advertising ranges', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Length')).toBe(String(SIZE));
  });

  for (const [header, start, end] of [
    ['bytes=0-1', 0, 1],
    ['bytes=1000-1999', 1000, 1999],
    ['bytes=-500', SIZE - 500, SIZE - 1],
    [`bytes=${SIZE - 10}-`, SIZE - 10, SIZE - 1],
  ] as const) {
    test(`${header} is a 206 with those bytes`, async () => {
      const response = await get({ Range: header });
      expect(response.status).toBe(206);
      expect(response.headers.get('Content-Range')).toBe(
        `bytes ${start}-${end}/${SIZE}`,
      );
      expect(response.headers.get('Content-Length')).toBe(
        String(end - start + 1),
      );
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        fake.subarray(start, end + 1),
      );
    });
  }

  test('past the end is a 416 naming the size', async () => {
    const response = await get({ Range: `bytes=${SIZE}-` });
    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe(`bytes */${SIZE}`);
  });

  test('a stale If-Range, and a HEAD, behave', async () => {
    expect(
      (await get({ Range: 'bytes=0-1', 'If-Range': '"old"' })).status,
    ).toBe(200);
    const head = await get({ Range: 'bytes=0-9' }, 'HEAD');
    expect(head.status).toBe(206);
    expect(head.body).toBeNull();
  });
});

test.describe('the Worker serves /videos/* with byte ranges', () => {
  const VIDEO_URL = `/videos/${VIDEO_FIXTURE_NAME}`;
  const file = readFileSync(FIXTURE_PATH);

  test('the build records every video at its size on disk', () => {
    // A stale __VIDEO_SIZES__ entry would cut a ranged video short or 416 it.
    const entry = readFileSync('dist/server/entry.mjs', 'utf8');
    const videos = [
      [VIDEO_FIXTURE_NAME, FIXTURE_PATH],
      ...(existsSync(VIDEO_DIR)
        ? readdirSync(VIDEO_DIR).map((name) => [name, join(VIDEO_DIR, name)])
        : []),
    ];

    for (const [name, path] of videos) {
      const recorded = new RegExp(
        // The minifier may write 5000 as 5e3, so the whole numeric literal is read.
        `"/videos/${name!.replaceAll('.', '\\.')}":\\s*([\\d.e+]+)`,
      ).exec(entry);
      expect(
        Number(recorded?.[1]),
        `${name} is not recorded in the Worker bundle`,
      ).toBe(statSync(path!).size);
    }
  });

  test('a request with no Range gets the whole file and advertises ranges', async ({
    request,
  }) => {
    const response = await request.get(VIDEO_URL);
    expect(response.status()).toBe(200);
    expect(response.headers()['accept-ranges']).toBe('bytes');
    expect(Number(response.headers()['content-length'])).toBe(file.length);
  });

  for (const [header, start, end] of [
    ['bytes=0-1', 0, 1],
    ['bytes=1000-1999', 1000, 1999],
    ['bytes=-500', file.length - 500, file.length - 1],
    [`bytes=${file.length - 10}-`, file.length - 10, file.length - 1],
  ] as const) {
    test(`${header} is a 206 with those bytes and their length`, async ({
      request,
    }) => {
      const response = await request.get(VIDEO_URL, {
        headers: { Range: header },
      });
      const headers = response.headers();

      expect(response.status()).toBe(206);
      expect(headers['content-range']).toBe(
        `bytes ${start}-${end}/${file.length}`,
      );
      expect(Number(headers['content-length'])).toBe(end - start + 1);
      expect(
        Buffer.compare(await response.body(), file.subarray(start, end + 1)),
      ).toBe(0);
    });
  }

  test('a range past the end is a 416 naming the size', async ({ request }) => {
    const response = await request.get(VIDEO_URL, {
      headers: { Range: `bytes=${file.length}-` },
    });
    expect(response.status()).toBe(416);
    expect(response.headers()['content-range']).toBe(`bytes */${file.length}`);
  });

  test('a stale If-Range gets the whole file', async ({ request }) => {
    const response = await request.get(VIDEO_URL, {
      headers: { Range: 'bytes=0-1', 'If-Range': '"not-this-file"' },
    });
    expect(response.status()).toBe(200);
  });

  test('a ranged response keeps the site headers from public/_headers', async ({
    request,
  }) => {
    const response = await request.get(VIDEO_URL, {
      headers: { Range: 'bytes=0-1' },
    });
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toContain("default-src 'self'");
  });
});

/* Without both, a video request reaches the asset layer, which answers ranges with 200. */
test.describe('video routing', () => {
  test('isVideoRequest takes /videos/ paths and nothing else', () => {
    const at = (path: string) =>
      isVideoRequest(new Request(`https://x.test${path}`));
    expect(at('/videos/talk.webm')).toBe(true);
    expect(at('/videos/')).toBe(true);
    expect(at('/video/talk.webm')).toBe(false);
    expect(at('/blog/videos/')).toBe(false);
  });

  test('wrangler.jsonc runs the Worker first for the video path', () => {
    const config = wranglerConfig<{
      assets?: { run_worker_first?: string[] };
    }>();
    expect(config.assets?.run_worker_first ?? []).toContain(
      `${VIDEO_PATH_PREFIX}*`,
    );
  });
});
