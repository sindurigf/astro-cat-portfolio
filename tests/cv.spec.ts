import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { DIST_DIR } from './routes';
import { NODE } from './tags';
import { CV_PATH as CONFIGURED_CV } from '../src/lib/profiles';
import { SITE_LANGUAGE } from '../src/lib/site-language';

/**
 * The CV PDF set by `person.cv`. Leftover export metadata is invisible on the
 * page, so the assertions are on the bytes. `/Title` must stay (PDF/UA,
 * SC 2.4.2).
 */
const CV_PATH = (CONFIGURED_CV ?? '').replace(/^\//, '');
const NO_CV = 'no CV is set in src/site.config.ts';
const BYTES_PER_KB = 1024;

const builtCv = () => join(DIST_DIR, CV_PATH);

/** The whole file as bytes, latin1 so every byte survives as one character. */
const cvBytes = () => readFileSync(builtCv(), 'latin1');

/**
 * The /Info dictionary only: `/Title` also occurs in the outline and structure
 * elements. Absence checks stay whole-file, since a leak anywhere counts.
 */
const infoDict = (bytes: string): string => {
  const ref = /\/Info\s+(\d+)\s+(\d+)\s*R/.exec(bytes);
  if (!ref) throw new Error('no /Info reference in the trailer');

  /* Not preceded by a digit, so object 2 is never found inside "12 0 obj". */
  const header = new RegExp(`(?<!\\d)${ref[1]}\\s+${ref[2]}\\s+obj\\b`).exec(
    bytes,
  );
  const end = header ? bytes.indexOf('endobj', header.index) : -1;
  if (!header || end === -1) throw new Error(`object ${ref[1]} not found`);

  return bytes.slice(header.index, end);
};

const cvInfoDict = () => infoDict(cvBytes());

test(
  'the /Info lookup finds its own object, not one whose number ends in it',
  NODE,
  () => {
    const bytes =
      '12 0 obj\n<< /Title (object 12) >>\nendobj\n' +
      '2 0 obj\n<< /Title (object 2) >>\nendobj\n' +
      'trailer\n<< /Info 2 0 R >>';

    expect(infoDict(bytes)).toContain('(object 2)');
  },
);

test.describe('the CV file', () => {
  test.skip(CONFIGURED_CV === null, NO_CV);
  test('is in the build, where the button points', NODE, () => {
    expect(
      existsSync(builtCv()),
      `${builtCv()} is missing, so /career's CV button is a 404.`,
    ).toBe(true);
  });

  test(
    'carries none of the identifying metadata the export came with',
    NODE,
    () => {
      const bytes = cvBytes();

      const forbidden: readonly [string, string][] = [
        ['/Author', 'an author name'],
        ['/Producer', 'the producing application'],
        ['/Creator', 'the creating application'],
        ['/Keywords', 'keywords, often template ids'],
        ['dc:creator', 'the XMP copy of the author name'],
        ['xmp:CreatorTool', 'the XMP copy of the creating application'],
        ['pdf:Producer', 'the XMP copy of the producing application'],
        ['pdf:Keywords', 'the XMP copy of the keywords'],
      ];

      for (const [field, what] of forbidden) {
        expect(
          bytes.includes(field),
          `${CV_PATH} still carries ${field} (${what}); strip it before publishing.`,
        ).toBe(false);
      }
    },
  );

  test('keeps the document title a reader needs', NODE, () => {
    expect(
      /\/Title\s*\((.+?)\)/.test(cvInfoDict()),
      `${CV_PATH} has no /Title in its information dictionary (SC 2.4.2).`,
    ).toBe(true);
  });

  test('declares the language its text is actually written in', NODE, () => {
    const language = SITE_LANGUAGE.split('-')[0]!;
    expect(
      new RegExp(`/Lang\\s*\\(${language}\\b`, 'i').test(cvBytes()),
      `${CV_PATH} does not declare /Lang (${language}), the site's language (SC 3.1.1).`,
    ).toBe(true);
  });

  test('is a tagged PDF', NODE, () => {
    expect(
      cvBytes().includes('StructTreeRoot'),
      `${CV_PATH} has no structure tree, so it is not a tagged PDF.`,
    ).toBe(true);
  });
});

test.describe('the CV link on /career', () => {
  test.skip(CONFIGURED_CV === null, NO_CV);
  test('names the format and the real size of the file', async ({ page }) => {
    await page.goto('/career');

    const link = page.getByRole('link', { name: /download my cv/i });
    await expect(link).toHaveAttribute('href', `/${CV_PATH}`);

    const expectedKb = Math.round(statSync(builtCv()).size / BYTES_PER_KB);

    await expect(
      link,
      `the label must name the format and the file's measured size.`,
    ).toHaveText(new RegExp(`\\(PDF,\\s*${expectedKb}\\s*KB\\)`, 'i'));
  });
});

test('with no CV configured, /career offers no download', async ({ page }) => {
  test.skip(CONFIGURED_CV !== null, 'a CV is set in src/site.config.ts');
  await page.goto('/career');
  await expect(page.getByRole('link', { name: /download my cv/i })).toHaveCount(
    0,
  );
  await expect(page.locator('a[href$=".pdf"]')).toHaveCount(0);
});
