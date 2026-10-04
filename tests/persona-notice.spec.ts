import { expect, test } from './test';
import { gotoSettled } from './settle';
import { NODE } from './tags';
import {
  PERSONA_NOTICE_ID,
  SAMPLE_PERSONA,
  personaNotice,
} from '../src/lib/persona';

/** The sample persona's ownership notice: first on /credits, linked from /, gone with the persona. */

test('no persona renders no notice', NODE, () => {
  expect(personaNotice(null)).toBeNull();
});

test('a persona renders its tribute and its rights', NODE, () => {
  const persona = { tribute: 'A tribute.', rights: 'Owned elsewhere.' };
  expect(personaNotice(persona)).toBe('A tribute. Owned elsewhere.');
});

test.describe('with the shipped sample persona', () => {
  test.skip(SAMPLE_PERSONA === null, 'no sample persona is configured');

  test('the notice is the first paragraph on /credits', async ({ page }) => {
    await gotoSettled(page, '/credits');
    const first = page.locator('main p').first();
    await expect(first).toHaveId(PERSONA_NOTICE_ID);
    await expect(first).toHaveText(personaNotice(SAMPLE_PERSONA)!);
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
