import { errorMessage } from './errors';

type BodyResult =
  | { kind: 'form'; form: FormData }
  | { kind: 'unsupported' }
  | { kind: 'too-large' }
  | { kind: 'unreadable' };

const mediaTypeOf = (header: string | null): string =>
  (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

/**
 * Counts bytes as they stream, not from `Content-Length`, which chunked
 * requests omit and any client can misstate.
 */
export const readCappedForm = async (
  request: Request,
  maxBytes: number,
  mediaType: string,
): Promise<BodyResult> => {
  if (mediaTypeOf(request.headers.get('content-type')) !== mediaType) {
    return { kind: 'unsupported' };
  }

  const body = request.body;
  if (body === null) return { kind: 'form', form: new FormData() };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let seen = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      seen += value.byteLength;
      if (seen > maxBytes) {
        await reader.cancel();
        return { kind: 'too-large' };
      }
      chunks.push(value);
    }
  } catch (error) {
    console.warn('contact: request body not read:', errorMessage(error));
    return { kind: 'unreadable' };
  }

  const bytes = new Uint8Array(seen);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }

  const form = new FormData();
  for (const [field, value] of new URLSearchParams(
    new TextDecoder().decode(bytes),
  )) {
    form.append(field, value);
  }
  return { kind: 'form', form };
};
