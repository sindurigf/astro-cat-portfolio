import { expect, test } from './test';
import { rateLimitKey } from '../src/lib/rate-limit-key';
import { NODE } from './tags';

/**
 * The contact form's rate-limit key from `CF-Connecting-IP`: the /64 for IPv6,
 * since a host usually holds a whole /64, and the full address for IPv4.
 * One shared key at 5 a minute would lock the form for everyone.
 */

const keyFor = (address: string | null): Promise<string | null> =>
  rateLimitKey(
    new Request('https://example.com/contact/send/', {
      method: 'POST',
      headers: address === null ? {} : { 'CF-Connecting-IP': address },
    }),
  );

test.describe('the rate-limit key', NODE, () => {
  test('two IPv6 addresses in the same /64 share a key', async () => {
    const first = await keyFor('2001:db8:1:2::1');
    expect(first, 'an IPv6 address got no key.').not.toBeNull();

    expect(
      await keyFor('2001:db8:1:2:ffff:ffff:ffff:ffff'),
      'two addresses in one /64 got different keys.',
    ).toBe(first);
    expect(
      await keyFor('2001:0db8:0001:0002:0000:0000:0000:0005'),
      'the same /64 written without compression got a different key.',
    ).toBe(first);
  });

  test('IPv6 addresses in different /64s get different keys', async () => {
    expect(await keyFor('2001:db8:1:3::1')).not.toBe(
      await keyFor('2001:db8:1:2::1'),
    );
  });

  test('IPv4 addresses differing in the last octet get different keys', async () => {
    expect(
      await keyFor('203.0.113.2'),
      'two IPv4 senders shared a key: one of them could lock the other out.',
    ).not.toBe(await keyFor('203.0.113.1'));
  });

  test('an IPv4-mapped IPv6 address is keyed as its IPv4 address', async () => {
    expect(
      await keyFor('::ffff:203.0.113.7'),
      '::ffff:203.0.113.7 and 203.0.113.7 are one sender and got two keys.',
    ).toBe(await keyFor('203.0.113.7'));

    // Mapped addresses share their first 64 bits, so a /64 key merges them.
    expect(
      await keyFor('::ffff:203.0.113.8'),
      'two mapped IPv4 addresses shared a key.',
    ).not.toBe(await keyFor('::ffff:203.0.113.7'));
  });

  test('a missing or empty header is not rate limited under a shared key', async () => {
    expect(await keyFor(null)).toBeNull();
    expect(await keyFor('')).toBeNull();
    expect(await keyFor('   ')).toBeNull();
  });

  test('a malformed header keeps a key of its own', async () => {
    const malformed = await keyFor('not-an-address');

    expect(
      malformed,
      'a header that does not parse got no key, so it is never limited.',
    ).not.toBeNull();
    expect(malformed).not.toBe(await keyFor('also-not-an-address'));
    expect(malformed).not.toBe(await keyFor('203.0.113.1'));
  });
});
