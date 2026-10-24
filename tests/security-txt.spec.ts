import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { builtHtml, DIST_DIR } from './routes';
import { configuredSite } from './source';
import { NODE } from './tags';
import { DAY_MS } from '../src/lib/time';
import {
  CONTACT_EMAIL,
  SECURITY_CONTACT,
  securityContactFor,
} from '../src/lib/contact';
import { securityTxt as securityTxtFor } from '../src/pages/.well-known/[file]';

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

/* Stands in while the build has no contact, so the fields are still checked. */
const SAMPLE_CONTACT = 'mailto:security@notexample.com';
const CONTACT = SECURITY_CONTACT ?? SAMPLE_CONTACT;

/** What the endpoint writes. Not read from dist/: no file is built without a contact. */
const securityTxt = (): string =>
  securityTxtFor(new URL(configuredSite()), CONTACT);

const contactEmail = (): string => CONTACT_EMAIL;

/** One field's value, by name. RFC 9116 fields are `Name: value` lines. */
const field = (source: string, name: string): string | null => {
  return (
    new RegExp(`^${name}:\\s*(.+)$`, 'im').exec(source)?.[1]?.trim() ?? null
  );
};

test.describe('security.txt', NODE, () => {
  test('is published exactly when there is a contact that works', () => {
    const published = SECURITY_CONTACT !== null;

    expect(
      existsSync(SECURITY_TXT),
      published
        ? `${SECURITY_TXT} was not built by src/pages/.well-known/[file].ts.`
        : `${SECURITY_TXT} is built with no contact: ${CONTACT_EMAIL} is a placeholder no mail reaches (RFC 9116 section 2.5.3).`,
    ).toBe(published);

    if (published) {
      expect(readFileSync(SECURITY_TXT, 'utf8')).toBe(securityTxt());
    }
  });

  test('offers SECURITY_CONTACT when set, else a real person.email, else nothing', () => {
    expect(
      securityContactFor(
        'https://notexample.com/security',
        'jane@notexample.com',
      ),
    ).toBe('https://notexample.com/security');
    expect(securityContactFor(null, 'jane@notexample.com')).toBe(
      'mailto:jane@notexample.com',
    );
    expect(securityContactFor(null, 'hello@example.com')).toBeNull();
    expect(securityContactFor(null, 'hello@EXAMPLE.com')).toBeNull();
    expect(securityContactFor(null, 'hello@example.com.')).toBeNull();
    expect(securityContactFor(null, 'hello@example.com..')).toBeNull();
    expect(
      securityContactFor('mailto:security@notexample.com', 'hello@example.com'),
    ).toBe('mailto:security@notexample.com');
  });

  test('no built page or llms.txt points at a file that is not there', () => {
    test.skip(SECURITY_CONTACT !== null, 'security.txt is published');

    const mentions = [...builtHtml()]
      .filter(([, html]) => html.includes('security.txt'))
      .map(([route]) => route);
    expect(mentions, 'page(s) naming a security.txt that is not built').toEqual(
      [],
    );
    expect(readFileSync(join(DIST_DIR, 'llms.txt'), 'utf8')).not.toContain(
      'security.txt',
    );
  });

  for (const formOn of [true, false]) {
    test(`the Worker routes end in a full stop, with semicolons between, contact form ${formOn ? 'on' : 'off'}`, () => {
      const text = securityTxtFor(new URL(configuredSite()), CONTACT, formOn);
      const list = text
        .slice(text.indexOf('runs code for:\n') + 'runs code for:\n'.length)
        .split('\n')
        .filter((line) => line.startsWith('#   '));
      /* A route starts with its path, or is the daily job. */
      const routes = list.filter((line) => /^# {3}(\/|a daily job)/.test(line));

      expect(routes.length, 'no Worker route is listed').toBeGreaterThan(0);
      expect(list.at(-1), 'the last route does not end the sentence').toMatch(
        /\.$/,
      );
      expect(
        list.filter((line) => line.endsWith(';')).length,
        'every route but the last should end with a semicolon.',
      ).toBe(routes.length - 1);
      expect(
        text.includes('/contact/send/'),
        'the contact endpoint is listed exactly when it ships',
      ).toBe(formOn);
    });
  }

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

  test('the contact is the one configured', () => {
    expect(field(securityTxt(), 'Contact')).toBe(CONTACT);
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
