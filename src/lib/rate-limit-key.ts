import { errorMessage } from './errors';
import { isoDate } from './time';

/*
 * IPv6 is keyed on the /64: one host usually owns all of it. Wider would group
 * different customers of one provider behind one key.
 */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV4_OCTET_MAX = 255;
const IPV6_GROUPS = 8;
const IPV6_PREFIX_GROUPS = 4;
const IPV6_GROUP = /^[0-9a-f]{1,4}$/i;
const HEX = 16;
const HEX_DIGITS_PER_BYTE = 2;
const BITS_PER_OCTET = 8;
const OCTET_MASK = 0xff;

/* `::ffff:0:0/96`: an IPv4 address carried in IPv6 notation. */
const IPV4_MAPPED_PREFIX = '0:0:0:0:0:ffff';
const IPV4_MAPPED_PREFIX_GROUPS = 6;

const parseIpv4 = (text: string): string | null => {
  const octets = IPV4.exec(text)?.slice(1).map(Number);
  return octets?.every((octet) => octet <= IPV4_OCTET_MAX)
    ? octets.join('.')
    : null;
};

/** Two IPv6 groups spelling an IPv4 address, as in `::ffff:1.2.3.4`. */
const ipv4AsGroups = (ipv4: string): string => {
  const [a = 0, b = 0, c = 0, d = 0] = ipv4.split('.').map(Number);
  return [(a << BITS_PER_OCTET) | b, (c << BITS_PER_OCTET) | d]
    .map((group) => group.toString(HEX))
    .join(':');
};

/** Eight normalized groups. Accepts `::`, a zone and a dotted-quad tail. */
const parseIpv6 = (text: string): string[] | null => {
  const [unzoned = ''] = text.split('%');
  const tailStart = unzoned.lastIndexOf(':') + 1;
  const tail = unzoned.slice(tailStart);
  let address = unzoned;
  if (tail.includes('.')) {
    const ipv4 = parseIpv4(tail);
    if (ipv4 === null) return null;
    address = unzoned.slice(0, tailStart) + ipv4AsGroups(ipv4);
  }

  const halves = address.split('::');
  if (halves.length > 2) return null;
  const groupsOf = (part: string): string[] =>
    part === '' ? [] : part.split(':');
  const left = groupsOf(halves[0] ?? '');
  const right = halves.length === 2 ? groupsOf(halves[1] ?? '') : [];
  const missing = IPV6_GROUPS - left.length - right.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;

  const groups = [...left, ...Array<string>(missing).fill('0'), ...right];
  return groups.every((group) => IPV6_GROUP.test(group))
    ? groups.map((group) => parseInt(group, HEX).toString(HEX))
    : null;
};

const mappedIpv4 = (groups: string[]): string =>
  groups
    .slice(IPV4_MAPPED_PREFIX_GROUPS)
    .flatMap((group) => {
      const value = parseInt(group, HEX);
      return [value >> BITS_PER_OCTET, value & OCTET_MASK];
    })
    .join('.');

/*
 * Mapped IPv6 keys on the IPv4 address: all mapped addresses share one /64.
 * No header gives null, so one keyless client cannot lock out the rest.
 * Unparsed text is still limited, so a new edge format cannot disable it.
 */
const limitSubject = (header: string | null): string | null => {
  const text = header?.trim() ?? '';
  if (text === '') return null;

  const ipv4 = parseIpv4(text);
  if (ipv4 !== null) return ipv4;

  const groups = text.includes(':') ? parseIpv6(text) : null;
  if (groups === null) return `unparsed:${text}`;

  return groups.slice(0, IPV4_MAPPED_PREFIX_GROUPS).join(':') ===
    IPV4_MAPPED_PREFIX
    ? mappedIpv4(groups)
    : `${groups.slice(0, IPV6_PREFIX_GROUPS).join(':')}::/64`;
};

/**
 * SHA-256 of sender and date, rotating daily. Not anonymization: an IPv4
 * address is recoverable by brute force, as /privacy says. Null on no address
 * or a failed digest, so the form fails open instead of answering 500.
 */
export const rateLimitKey = async (
  request: Request,
): Promise<string | null> => {
  const subject = limitSubject(request.headers.get('CF-Connecting-IP'));
  if (subject === null) return null;

  const day = isoDate(new Date());

  try {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${subject}:${day}`),
    );

    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(HEX).padStart(HEX_DIGITS_PER_BYTE, '0'))
      .join('');
  } catch (error) {
    console.warn('contact: rate-limit key not computed:', errorMessage(error));
    return null;
  }
};
