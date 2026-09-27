import { expect, test } from './test';
import { captureConsole } from './console-capture';
import { rateLimitKey } from '../src/lib/rate-limit-key';
import { readCappedForm } from '../src/lib/request-body';
import { FORM_MEDIA_TYPE, MAX_BODY_BYTES } from '../src/lib/contact-form';
import { NODE } from './tags';

/**
 * Body cap, media type and rate-limit key, called directly for cases HTTP cannot
 * reach (a stream that errors, a failing digest). tests/contact.spec.ts covers HTTP.
 */

const postedWith = (
  body: BodyInit | null,
  contentType: string = FORM_MEDIA_TYPE,
): Request =>
  new Request('https://example.com/contact/send/', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });

const read = (request: Request) =>
  readCappedForm(request, MAX_BODY_BYTES, FORM_MEDIA_TYPE);

test.describe('what the endpoint will read', NODE, () => {
  test('a body within the cap is read as fields', async () => {
    const result = await read(postedWith('name=Ada&message=Hello%20there'));

    expect(result.kind).toBe('form');
    if (result.kind !== 'form') return;
    expect(result.form.get('name')).toBe('Ada');
    expect(result.form.get('message')).toBe('Hello there');
  });

  test('one byte over the cap is refused', async () => {
    expect(
      (await read(postedWith('x'.repeat(MAX_BODY_BYTES + 1)))).kind,
      'a body one byte over the cap was read.',
    ).toBe('too-large');
  });

  test('a body exactly at the cap is read', async () => {
    expect(
      (await read(postedWith('x'.repeat(MAX_BODY_BYTES)))).kind,
      'a body of exactly the cap was refused.',
    ).toBe('form');
  });

  /* A dropped connection must not reject out of the route as a 500. */
  test('a stream that errors partway is unreadable rather than fatal', async () => {
    const failing = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('name=Ada'));
        controller.error(new Error('connection lost'));
      },
    });

    const request = new Request('https://example.com/contact/send/', {
      method: 'POST',
      headers: { 'content-type': FORM_MEDIA_TYPE },
      body: failing,
      // @ts-expect-error duplex is required for a stream body and is not yet in the DOM types
      duplex: 'half',
    });

    expect(
      (await readCappedForm(request, MAX_BODY_BYTES, FORM_MEDIA_TYPE)).kind,
    ).toBe('unreadable');
  });

  test('another media type is refused without reading the body', async () => {
    expect(
      (await read(postedWith('{"name":"Ada"}', 'application/json'))).kind,
    ).toBe('unsupported');
    expect(
      (await read(postedWith('name=Ada', 'multipart/form-data; boundary=x')))
        .kind,
    ).toBe('unsupported');
  });

  test('the media type is read without its parameters and without case', async () => {
    expect(
      (await read(postedWith('name=Ada', 'Application/X-WWW-Form-Urlencoded')))
        .kind,
      'the media type must match case-insensitively.',
    ).toBe('form');
    expect(
      (await read(postedWith('name=Ada', `${FORM_MEDIA_TYPE}; charset=UTF-8`)))
        .kind,
    ).toBe('form');
  });
});

test.describe('the rate-limit key', NODE, () => {
  const withDigest = async <T>(
    digest: SubtleCrypto['digest'],
    run: () => Promise<T>,
  ): Promise<{ value: T; logged: string[] }> => {
    const realDigest = crypto.subtle.digest;
    crypto.subtle.digest = digest;
    try {
      const { value, logged } = await captureConsole(['warn'], run);
      return { value, logged: logged.warn };
    } finally {
      crypto.subtle.digest = realDigest;
    }
  };

  test('a digest that fails gives no key, and says so once', async () => {
    const { value, logged } = await withDigest(
      () => Promise.reject(new Error('digest unavailable')),
      () =>
        rateLimitKey(
          new Request('https://example.com/contact/send/', {
            method: 'POST',
            headers: { 'CF-Connecting-IP': '203.0.113.4' },
          }),
        ),
    );

    expect(
      value,
      'a failed digest should yield a null key, not a rejection.',
    ).toBeNull();
    expect(logged).toEqual([
      'contact: rate-limit key not computed: digest unavailable',
    ]);
  });
});
