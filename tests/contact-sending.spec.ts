import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { gotoSettled } from './settle';
import { PHONE_VIEWPORT } from './wcag';
import { LIMITS } from '../src/lib/contact-form';
import { CONTACT_FORM_ON } from '../src/lib/contact';

test.skip(!CONTACT_FORM_ON, 'contact.form is none in src/site.config.ts');

/** A filled form submitted once, left in the sending state by a 204 answer. */
const sendOnce = async (page: Page) => {
  const posts = { count: 0 };
  await page.route('**/contact/send/', async (route) => {
    posts.count += 1;
    await route.fulfill({ status: 204 });
  });

  await gotoSettled(page, '/contact/');
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel('Message').fill('A message long enough to send.');

  const form = page.locator('form[data-contact-form]');
  const button = form.getByRole('button', { name: /send/i });
  const status = form.getByRole('status');
  const label = (await button.textContent())?.trim() ?? '';

  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveText('Sending');
  return { button, status, label, posts };
};

/** The form is ready again: its label, no `aria-disabled`, no status, and Enter posts. */
const expectReadyToResend = async (
  page: Page,
  { button, status, label, posts }: Awaited<ReturnType<typeof sendOnce>>,
  message: string,
) => {
  await expect(button, message).toHaveText(label);
  await expect(button).not.toHaveAttribute('aria-disabled');
  await expect(status).toHaveText('');

  await button.focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => posts.count, 'the form stayed blocked after it was reset')
    .toBe(2);
};

/** A 204 answer leaves the page in place, so it stays in the sending state. */
test('sending blocks a second submit and says so', async ({ page }) => {
  let posts = 0;
  await page.route('**/contact/send/', async (route) => {
    posts += 1;
    await route.fulfill({ status: 204 });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoSettled(page, '/contact/');
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel('Message').fill('A message long enough to send.');

  const form = page.locator('form[data-contact-form]');
  const button = form.getByRole('button', { name: /send/i });
  const status = form.getByRole('status');

  /* The region exists, empty, before anything is written to it. */
  await expect(status).toHaveCount(1);
  await expect(status).toHaveText('');

  await button.focus();
  await page.keyboard.press('Enter');

  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await expect(button).toHaveText('Sending');
  await expect(status).toHaveText('Sending your message.');
  await expect(
    page.locator('[aria-busy="true"]'),
    'a busy ancestor lets a screen reader hold back the status message',
  ).toHaveCount(0);
  /* Still focusable and still in the accessibility tree. */
  await expect(button).toBeFocused();
  await expect(button).not.toHaveAttribute('disabled');

  /* A window listener runs after the form's own, so it sees whether the second submit was stopped. */
  await page.evaluate(() => {
    const w = window as unknown as { submits: boolean[] };
    w.submits = [];
    window.addEventListener('submit', (event) =>
      w.submits.push(event.defaultPrevented),
    );
  });
  await page.keyboard.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { submits: boolean[] }).submits,
      ),
    )
    .toEqual([true]);
  expect(posts, 'a second press sent a second request').toBe(1);
});

/* Offline, a native post lands on the browser error page and loses the message. */
test('offline, the form keeps the message and says it was not sent', async ({
  page,
  context,
}) => {
  let posts = 0;
  await page.route('**/contact/send/', async (route) => {
    posts += 1;
    await route.fulfill({ status: 204 });
  });

  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoSettled(page, '/contact/');
  const typed = 'A message typed while the connection dropped.';
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel('Message').fill(typed);

  await context.setOffline(true);
  const form = page.locator('form[data-contact-form]');
  await form.getByRole('button', { name: /send/i }).click();

  const status = form.getByRole('status');
  await expect(status).toHaveText(/offline/i);
  await expect(status).toHaveText(/not been sent/i);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByLabel('Message')).toHaveValue(typed);
  expect(posts, 'the post went out while offline').toBe(0);
  await context.setOffline(false);
});

/*
 * SC 3.3.1, 4.1.3: offline, the status under the button is often below the fold.
 * Focus stays in the field, so the page scrolls to the status only when the
 * control stays in view below the sticky header. Name to the status never
 * fits; Send, right above it, always does. Enter in the Message adds a line.
 */
for (const viewport of [{ width: 1280, height: 720 }, PHONE_VIEWPORT]) {
  for (const { label, fits } of [
    { label: 'Name', fits: false },
    { label: 'Send Message', fits: true },
  ]) {
    test(`offline at ${viewport.width}x${viewport.height}, Enter in ${label} keeps the field in view${fits ? ' and brings the status into view' : ''}`, async ({
      page,
      context,
    }) => {
      await page.route('**/contact/send/', (route) =>
        route.fulfill({ status: 204 }),
      );
      await page.setViewportSize(viewport);
      await gotoSettled(page, '/contact/');
      await page.getByLabel('Name').fill('Ada Lovelace');
      await page.getByLabel('Email').fill('ada@example.com');
      await page
        .getByLabel('Message')
        .fill('A message typed while the connection dropped.');

      const field =
        label === 'Name'
          ? page.getByLabel(label)
          : page.getByRole('button', { name: label });
      const status = page
        .locator('form[data-contact-form]')
        .getByRole('status');
      await field.focus();
      await field.evaluate((element) => {
        element.scrollIntoView({ block: 'end' });
        /* Send sits just above the status: nudge until the status is past the fold. */
        const below = document.querySelector('[data-contact-status]')!;
        const past = below.getBoundingClientRect().top - window.innerHeight;
        if (past <= 0) window.scrollBy(0, past - 1);
      });
      expect(
        await status.evaluate(
          (element) => element.getBoundingClientRect().top > window.innerHeight,
        ),
        'the setup did not put the status below the fold',
      ).toBe(true);
      const scrolledBefore = await page.evaluate(() => window.scrollY);

      await context.setOffline(true);
      await page.keyboard.press('Enter');
      await expect(status).toHaveText(/offline/i);

      const placed = await field.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const header = document
          .querySelector('header')!
          .getBoundingClientRect();
        return {
          belowHeader: box.top >= header.bottom,
          onScreen: box.bottom <= window.innerHeight,
        };
      });
      expect(placed.belowHeader, 'the field went under the sticky header').toBe(
        true,
      );
      expect(placed.onScreen, 'the field went below the fold').toBe(true);
      await expect(
        field,
        'the offline notice moved focus off the field',
      ).toBeFocused();

      if (fits) {
        await expect(status, 'the status stayed out of view').toBeInViewport();
      } else {
        expect(
          await page.evaluate(() => window.scrollY),
          'the page moved without room to show the status',
        ).toBe(scrolledBefore);
      }
      await context.setOffline(false);
    });
  }
}

test('offline, the status clears once the browser is back online', async ({
  page,
  context,
}) => {
  await page.route('**/contact/send/', (route) =>
    route.fulfill({ status: 204 }),
  );
  await gotoSettled(page, '/contact/');
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill('ada@example.com');
  await page
    .getByLabel('Message')
    .fill('A message typed while the connection dropped.');
  const status = page.locator('form[data-contact-form]').getByRole('status');

  await context.setOffline(true);
  await page.getByLabel('Name').press('Enter');
  await expect(status).toHaveText(/offline/i);
  await context.setOffline(false);
  await expect(status, 'the offline notice outlived the connection').toHaveText(
    '',
  );
});

test('the message field states its limits and keeps pasted text past them', async ({
  page,
}) => {
  await gotoSettled(page, '/contact/');
  const message = page.getByLabel('Message');
  await expect(message).toHaveAccessibleDescription(
    new RegExp(`${LIMITS.bodyMin}.*${LIMITS.bodyMax} characters`),
  );

  const pasted = 'x'.repeat(LIMITS.bodyMax + 1);
  await message.fill(pasted);
  await expect(
    message,
    'text past the limit was cut silently instead of named by the server',
  ).toHaveValue(pasted);
});

test('a page restored from the back-forward cache can send again', async ({
  page,
}) => {
  const sent = await sendOnce(page);

  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    ),
  );

  await expectReadyToResend(
    page,
    sent,
    'a form restored from the back-forward cache stayed on Sending',
  );
});

test('Esc during a send, which stops the post, lets the form send again', async ({
  page,
}) => {
  const sent = await sendOnce(page);

  await page.keyboard.press('Escape');

  await expectReadyToResend(page, sent, 'the form stayed on Sending after Esc');
});

test('a stopped post reported by the Navigation API lets the form send again', async ({
  page,
}) => {
  test.skip(
    !(await page.evaluate(() => 'navigation' in window)),
    'no Navigation API in this engine',
  );
  const sent = await sendOnce(page);

  await page.evaluate(() =>
    window.navigation.dispatchEvent(new ErrorEvent('navigateerror')),
  );

  await expectReadyToResend(
    page,
    sent,
    'the form stayed on Sending after the Stop button',
  );
});
