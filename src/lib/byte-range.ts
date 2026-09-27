/*
 * Single `bytes` ranges only. Multi-range and malformed headers get 200 with
 * the whole file, which RFC 9110 allows; a 416 would break playback.
 */

export interface ByteRange {
  start: number;
  /** Inclusive, as in `Content-Range`. */
  end: number;
}

export const WHOLE_FILE = 'whole-file';

export const UNSATISFIABLE = 'unsatisfiable';

type RangeResult = ByteRange | typeof WHOLE_FILE | typeof UNSATISFIABLE;

const SINGLE_BYTE_RANGE = /^bytes=(\d*)-(\d*)$/;

/* `bytes=-500`: the final 500 bytes. */
const suffixRange = (last: string, size: number): RangeResult => {
  const suffix = Number(last);
  if (suffix === 0) return UNSATISFIABLE;
  return { start: Math.max(0, size - suffix), end: size - 1 };
};

export const parseRange = (
  header: string | null,
  size: number,
): RangeResult => {
  if (header === null || size <= 0) return WHOLE_FILE;

  const match = SINGLE_BYTE_RANGE.exec(header.trim());
  if (match === null) return WHOLE_FILE;

  const [, first = '', last = ''] = match;
  if (first === '' && last === '') return WHOLE_FILE;

  if (first === '') return suffixRange(last, size);

  const lastByte = size - 1;
  const start = Number(first);
  if (start > lastByte) return UNSATISFIABLE;

  /* `bytes=500-`: from 500 to the end. */
  if (last === '') return { start, end: lastByte };

  const end = Number(last);
  if (end < start) return WHOLE_FILE;

  return { start, end: Math.min(end, lastByte) };
};

export const contentRange = ({ start, end }: ByteRange, size: number): string =>
  `bytes ${start}-${end}/${size}`;

export const unsatisfiedRange = (size: number): string => `bytes */${size}`;

/** Streams the range without buffering, then cancels `source`. */
export const sliceStream = (
  source: ReadableStream<Uint8Array>,
  { start, end }: ByteRange,
): ReadableStream<Uint8Array> => {
  const reader = source.getReader();
  let position = 0;

  return new ReadableStream<Uint8Array>({
    /* `pull` is not re-called if it enqueues nothing: skip within one call. */
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          controller.close();
          return;
        }

        const chunkStart = position;
        const chunkEnd = position + value.byteLength - 1;
        position += value.byteLength;

        const overlaps = chunkEnd >= start && chunkStart <= end;
        if (overlaps) {
          controller.enqueue(
            value.subarray(
              Math.max(0, start - chunkStart),
              Math.min(value.byteLength, end - chunkStart + 1),
            ),
          );
        }

        if (chunkEnd >= end) {
          controller.close();
          await reader.cancel();
          return;
        }

        if (overlaps) return;
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
};
