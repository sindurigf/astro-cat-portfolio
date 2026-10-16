import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { builtHtml, DIST_DIR } from './routes';
import {
  FEED_LANGUAGE,
  OG_LOCALE,
  SITE_LANGUAGE,
} from '../src/lib/site-language';
import { NODE } from './tags';
import { SITE_CONFIG, validateSiteConfig } from '../src/site.config';
import { MOTTO_LANGUAGE } from '../src/lib/site';
import { LD_JSON } from './html';

/** Screen readers read <html lang>, search engines `inLanguage`, feed readers `<language>`: all must agree. */

const HTML_LANG = /<html[^>]*\blang="([^"]*)"/;
const OG_LOCALE_TAG = /<meta property="og:locale" content="([^"]*)"/;

const inLanguages = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(inLanguages);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      key === 'inLanguage' && typeof inner === 'string'
        ? [inner]
        : inLanguages(inner),
    );
  }
  return [];
};

test.describe('the site declares one language everywhere', NODE, () => {
  test('every page says it in <html lang> and og:locale', () => {
    const wrong: string[] = [];

    for (const [route, html] of builtHtml()) {
      const lang = HTML_LANG.exec(html)?.[1];
      if (lang !== SITE_LANGUAGE) wrong.push(`${route} <html lang="${lang}">`);

      const locale = OG_LOCALE_TAG.exec(html)?.[1];
      if (locale !== undefined && locale !== OG_LOCALE) {
        wrong.push(`${route} og:locale="${locale}"`);
      }
    }

    expect(wrong, `Every page should declare ${SITE_LANGUAGE}.`).toEqual([]);
  });

  test('the structured data says it on every node that names a language', () => {
    const wrong: string[] = [];
    let named = 0;

    for (const [route, html] of builtHtml()) {
      const block = LD_JSON.exec(html)?.[1];
      if (block === undefined) continue;
      for (const language of inLanguages(JSON.parse(block))) {
        named += 1;
        if (language !== SITE_LANGUAGE) {
          wrong.push(`${route} inLanguage "${language}"`);
        }
      }
    }

    expect(named, 'no structured-data node names a language').toBeGreaterThan(
      0,
    );
    expect(wrong).toEqual([]);
  });

  test('the feed says it', () => {
    const feed = readFileSync(join(DIST_DIR, 'rss.xml'), 'utf8');

    expect(
      /<language>([^<]*)<\/language>/.exec(feed)?.[1],
      'The feed declares a different language from the pages it lists.',
    ).toBe(FEED_LANGUAGE);
  });
});

/* SC 3.1.2: the motto's lang is read aloud in that language, so it must name one. */
test.describe('the motto declares a real language', NODE, () => {
  const withMottoLang = (lang: string) =>
    validateSiteConfig({
      ...SITE_CONFIG,
      site: { ...SITE_CONFIG.site, motto: { ...SITE_CONFIG.site.motto, lang } },
    });

  test('motto.lang must be a canonical tag for a known language', () => {
    for (const [lang, why] of [
      ['not a tag', 'is not a BCP 47 tag'],
      ['LA', 'is not in canonical BCP 47 form'],
      ['zz', 'names no language this runtime knows'],
    ] as const) {
      expect(() => withMottoLang(lang), lang).toThrow(`site.motto.lang ${why}`);
    }
    expect(() => withMottoLang('la')).not.toThrow();
  });

  test('a motto in the site language takes no meaning, since "English for …" says nothing', () => {
    const motto = (lang: string, meaning: string | null) =>
      validateSiteConfig({
        ...SITE_CONFIG,
        site: {
          ...SITE_CONFIG.site,
          locale: 'en-US',
          motto: { text: 'Read the Stones', lang, meaning },
        },
      });

    expect(() => motto('en', 'read the stones')).toThrow(
      'site.motto.meaning must be null',
    );
    expect(() => motto('en-GB', 'read the stones')).toThrow(
      'site.motto.meaning must be null',
    );
    expect(() => motto('en', null)).not.toThrow();
    expect(() => motto('la', 'read the stones')).not.toThrow();
  });

  test('/about names the motto language and meaning from the config', () => {
    const about = builtHtml().get('/about')!;
    const { meaning } = SITE_CONFIG.site.motto;
    test.skip(meaning === null, 'the motto has no translation to state');

    expect(
      about,
      `/about does not say "${MOTTO_LANGUAGE} for “${meaning}”".`,
    ).toContain(`${MOTTO_LANGUAGE} for &ldquo;${meaning}&rdquo;`);
  });
});
