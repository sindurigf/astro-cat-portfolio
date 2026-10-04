import { expect, test } from './test';
import { gotoSettled } from './settle';
import { NODE } from './tags';
import {
  PERSONA_NOTICE_ID,
  PERSONA_SOURCES_ID,
  SAMPLE_PERSONA,
  personaNotice,
} from '../src/lib/persona';

/** The sample persona's ownership notice and story sources: first on /credits, linked from /, gone with the persona. */

test('no persona renders no notice', NODE, () => {
  expect(personaNotice(null)).toBeNull();
});

test('a persona renders its tribute and its rights', NODE, () => {
  const persona = {
    tribute: 'A tribute.',
    rights: 'Owned elsewhere.',
    sources: [],
  };
  expect(personaNotice(persona)).toBe('A tribute. Owned elsewhere.');
});

test.describe('with the shipped sample persona', () => {
  test.skip(SAMPLE_PERSONA === null, 'no sample persona is configured');

  test('the notice is the first paragraph on /credits', async ({ page }) => {
    await gotoSettled(page, '/credits');
    const first = page.locator('main p').first();
    await expect(first).toHaveId(PERSONA_NOTICE_ID);
    await expect(first).toContainText(personaNotice(SAMPLE_PERSONA)!);
  });

  test('the homepage names the tribute and links the notice', async ({
    page,
  }) => {
    await gotoSettled(page, '/');
    const link = page.locator(`main a[href="/credits/#${PERSONA_NOTICE_ID}"]`);
    await expect(link).toHaveCount(1);
    await expect(link.locator('xpath=..')).toContainText(
      SAMPLE_PERSONA!.tribute,
    );
  });
});

test.describe('the sample persona sources', () => {
  test.skip(SAMPLE_PERSONA === null, 'no sample persona is configured');
  const sources = SAMPLE_PERSONA?.sources ?? [];

  test('every source has its own link name and address', NODE, () => {
    expect(sources.length, 'the persona cites no sources').toBeGreaterThan(0);
    const names = sources.map((source) => source.wiki.name);
    const hrefs = sources.map((source) => source.wiki.href);
    expect(new Set(names).size, 'two sources share a link name').toBe(
      names.length,
    );
    expect(new Set(hrefs).size, 'two sources share an address').toBe(
      hrefs.length,
    );
  });

  test('every source cites at least one chapter', NODE, () => {
    for (const { story, chapters } of sources) {
      expect(chapters, `${story} cites no chapter`).toMatch(/\bchapters? \d+/);
    }
  });

  for (const route of ['/about', '/blog/sample-post', '/blog/sample-talk']) {
    test(`${route} lists every source under Sources`, async ({ page }) => {
      await gotoSettled(page, route);
      await expect(page.locator(`#${PERSONA_SOURCES_ID}`)).toHaveCount(1);
      for (const { wiki } of sources) {
        await expect(
          page.locator(`main a[href="${wiki.href}"]`, { hasText: wiki.name }),
        ).toHaveCount(1);
      }
    });
  }
});
