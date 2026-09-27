import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { DIST_DIR } from './routes';
import { configuredSite } from './source';
import { NODE } from './tags';
import { DAY_MS } from '../src/lib/time';
import { CONTACT_EMAIL } from '../src/lib/contact';

/**
 * /.well-known/security.txt, per https://www.rfc-editor.org/rfc/rfc9116.
 * The expiry check fails EXPIRY_WARNING_DAYS early, so it can go red on a day
 * nobody changed a line: a build-time `now + 1 year` would defeat the field.
 */

const SECURITY_TXT = join(DIST_DIR, '.well-known', 'security.txt');
const CONTACT_MODULE = 'src/lib/contact.ts';
const SECURITY_POLICY = 'SECURITY.md';

// When it fires, confirm the mailbox is read and move EXPIRES. Never widen.
const EXPIRY_WARNING_DAYS = 60;

/** RFC 9116 section 2.5.5: Expires is RECOMMENDED to be less than a year into the future. */
const lessThanAYearAfter = (now: Date, expires: Date): boolean => {
  const yearLater = new Date(now);
  yearLater.setUTCFullYear(yearLater.getUTCFullYear() + 1);
  return expires.getTime() < yearLater.getTime();
};

const securityTxt = (): string => {
  expect(
    existsSync(SECURITY_TXT),
    `${SECURITY_TXT} was not built by src/pages/.well-known/security.txt.ts.`,
  ).toBe(true);

  return readFileSync(SECURITY_TXT, 'utf8');
};

const contactEmail = (): string => CONTACT_EMAIL;

/** One field's value, by name. RFC 9116 fields are `Name: value` lines. */
const field = (source: string, name: string): string | null => {
  const match = new RegExp(`^${name}:\\s*(.+)$`, 'im').exec(source);
  return match ? match[1]!.trim() : null;
};

test.describe('security.txt', NODE, () => {
  test('declares the two fields RFC 9116 requires', () => {
    const source = securityTxt();

    expect(
      field(source, 'Contact'),
      'RFC 9116 requires Contact.',
    ).not.toBeNull();

    expect(
      field(source, 'Expires'),
      'RFC 9116 requires Expires.',
    ).not.toBeNull();
  });

  test('the contact is the address the site publishes', () => {
    const declared = field(securityTxt(), 'Contact');
    const email = contactEmail();

    // RFC 9116 wants a `mailto:` URI, not a bare address.
    expect(
      declared,
      `security.txt offers ${declared}, the site publishes ${email}.`,
    ).toBe(`mailto:${email}`);
  });

  test('SECURITY.md names the site contact address', () => {
    expect(existsSync(SECURITY_POLICY), `${SECURITY_POLICY} is missing.`).toBe(
      true,
    );
    const email = contactEmail();

    expect(
      readFileSync(SECURITY_POLICY, 'utf8'),
      `${SECURITY_POLICY} and ${CONTACT_MODULE} disagree: ${SECURITY_POLICY} does not name ${email}.`,
    ).toContain(email);
  });

  test('the published commitment has not lapsed', () => {
    const declared = field(securityTxt(), 'Expires')!;
    const expires = new Date(declared);

    expect(
      Number.isNaN(expires.getTime()),
      `Expires reads "${declared}", not an ISO 8601 timestamp.`,
    ).toBe(false);

    const daysLeft = Math.floor((expires.getTime() - Date.now()) / DAY_MS);

    expect(
      daysLeft,
      daysLeft < 0
        ? `security.txt EXPIRED ${-daysLeft} days ago, on ${declared}; move EXPIRES forward.`
        : `security.txt expires in ${daysLeft} days, on ${declared}; move EXPIRES forward.`,
    ).toBeGreaterThan(EXPIRY_WARNING_DAYS);
  });

  test('the commitment is less than a year out, as RFC 9116 recommends', () => {
    const declared = field(securityTxt(), 'Expires')!;

    expect(
      lessThanAYearAfter(new Date(), new Date(declared)),
      `Expires is ${declared}; RFC 9116 recommends less than a year ahead.`,
    ).toBe(true);
  });

  test('an expiry exactly a year out is not less than a year', () => {
    const now = new Date('2026-01-01T00:00:00Z');

    expect(lessThanAYearAfter(now, new Date('2027-01-01T00:00:00Z'))).toBe(
      false,
    );
    expect(lessThanAYearAfter(now, new Date('2026-12-31T23:59:59Z'))).toBe(
      true,
    );
  });

  test('the canonical URL is absolute and ours', () => {
    const declared = field(securityTxt(), 'Canonical');
    expect(declared, 'security.txt declares no Canonical').not.toBeNull();

    const site = configuredSite();

    expect(
      declared,
      `Canonical reads "${declared}"; RFC 9116 requires an absolute URI.`,
    ).toBe(`${site}/.well-known/security.txt`);
  });
});
