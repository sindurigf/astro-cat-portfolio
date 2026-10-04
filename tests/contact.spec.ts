import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from './test';
import {
  FORM_MEDIA_TYPE,
  LIMITS,
  MAX_BODY_BYTES,
  RETENTION_DAYS,
} from '../src/lib/contact-form';
import {
  NOTIFICATION_SENDER,
  notificationFor,
} from '../src/lib/contact-notification';
import { retentionCutoff } from '../src/lib/contact-retention';
import { RESEND_AFTER_MS } from '../src/lib/contact-resend';
import { NOTIFY_TO } from '../playwright.worker.config';
import { request as httpRequest } from 'node:http';
import { headersFor, parseHeadersFile } from './policy-server';
import type { APIResponse } from '@playwright/test';
import { CONTACT_FORM_ON } from '../src/lib/contact';

const FORM_OFF = 'contact.form is none in src/site.config.ts';
import { DAY_MS } from '../src/lib/time';
import { wranglerConfig } from './source';
import { timedScan } from './axe';
import { obscuredReport, readObscured } from './obscured';
import { settleFocusScroll, tabWalk } from './tab-walk';
import { DESKTOP_VIEWPORT, REFLOW_VIEWPORT } from './wcag';

/**
 * `/contact/send/`, the only on-demand route. Runs under
 * playwright.worker.config.ts: `astro preview` serves the Worker with local D1.
 * The Worker sets its own headers because public/_headers skips Worker responses.
 */

const ENDPOINT = '/contact/send/';

/* The local send_email simulator writes each text body here, one directory per run. */
const EMAIL_TEXT_ROOT = '.wrangler/tmp/email';

/* Local only: wrangler and astro preview expose the cron handler here. */
const SCHEDULED_HANDLER = '/cdn-cgi/handler/scheduled';

const POLL = { intervals: [250], timeout: 5_000 };

const capturedEmailTexts = (): string[] =>
  existsSync(EMAIL_TEXT_ROOT)
    ? readdirSync(EMAIL_TEXT_ROOT).flatMap((run) => {
        const dir = join(EMAIL_TEXT_ROOT, run, 'email-text');
        return existsSync(dir)
          ? readdirSync(dir).map((file) =>
              readFileSync(join(dir, file), 'utf8'),
            )
          : [];
      })
    : [];

const emailWith = (token: string): string | undefined =>
  capturedEmailTexts().find((text) => text.includes(token));

const localD1 = (sql: string): string =>
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'MESSAGES_DB',
      '--local',
      '--json',
      '--command',
      sql,
    ],
    { encoding: 'utf8' },
  );

interface WranglerConfig {
  send_email?: { name: string; allowed_sender_addresses?: string[] }[];
  triggers?: { crons?: string[] };
  ratelimits?: {
    name: string;
    simple?: { limit: number; period: number };
  }[];
}

/* Well past the wrangler.jsonc limit, so the assertion is not on the boundary. */
const RATE_LIMIT_ATTEMPTS = 12;

/* The limit /privacy and the not-sent message state; "about" because Cloudflare's binding is approximate. */
const RATE_LIMIT_BINDING = 'CONTACT_RATE_LIMIT';
const RATE_LIMIT_SUBMISSIONS = 5;
const RATE_LIMIT_PERIOD_SECONDS = 60;

const NUMBER_WORDS: Readonly<Record<number, string>> = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
};
/* Cloudflare's simple rate limit takes a period of 10 or 60 seconds; the copy is written for 60. */
const PERIOD_WORDS: Readonly<Record<number, string>> = { 60: 'a minute' };

const wordFor = (
  words: Readonly<Record<number, string>>,
  value: number,
): string => {
  const word = words[value];
  if (word === undefined) {
    throw new Error(`no copy word for ${value}; add it and update the copy.`);
  }
  return word;
};

const RATE_LIMIT_WORDS = `about ${wordFor(NUMBER_WORDS, RATE_LIMIT_SUBMISSIONS)}`;
const RATE_LIMIT_PERIOD_WORDS = wordFor(
  PERIOD_WORDS,
  RATE_LIMIT_PERIOD_SECONDS,
);

const collapseSpace = (html: string): string => html.replace(/\s+/g, ' ');

/* Enough of a real submission that only the cap can be what refuses it. */
const FIELDS_PREFIX = 'name=Ada&email=ada%40example.com&message=';

/* Written per chunk, so the cap is crossed by several rather than one. */
const CHUNK = 4096;

/* Where the 503 test moves the messages table while it runs. */
const MESSAGES_ASIDE = 'messages_unavailable';
const SENT = '/contact/sent/';
const FORM = '/contact/';

/** Fields with a standing hint: email (what it is for) and message (its length). */
const HINTED_FIELDS = ['contact-email', 'contact-message'];

/** Far above the error page's tab stops; reaching it fails the walk as a trap. */
const MAX_PAGE_STOPS = 100;

/** A body that passes every rule in contact-form.ts. */
const validFields = (): Record<string, string> => ({
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  message: 'x'.repeat(LIMITS.bodyMin + 20),
});

/** The title starts with "Error: " (SC 3.3.1) and, like the h1, names the cause (SC 2.4.2). */
const expectTitledAndHeaded = (html: string, heading: string) => {
  expect(html, `the page title is not "Error: ${heading}"`).toContain(
    `<title>Error: ${heading} `,
  );
  expect(html, `the h1 is not "${heading}"`).toMatch(
    new RegExp(`<h1[^>]*>\\s*${heading}\\s*</h1>`),
  );
};

const expectTypedValuesKept = (
  html: string,
  typed: Record<'name' | 'email' | 'message', string>,
): void => {
  expect(
    html,
    'the rejected submission lost the name that was typed.',
  ).toContain(`value="${typed.name}"`);
  expect(
    html,
    'the rejected submission lost the email address that was typed.',
  ).toContain(`value="${typed.email}"`);
  expect(
    html,
    'the rejected submission lost the message body that was typed.',
  ).toContain(typed.message);
};

/*
 * Cloudflare applies public/_headers to static assets only, so every response
 * the Worker builds, whatever its status, carries the `/*` headers itself.
 */
/* Cache-Control is route-specific: error pages add `no-store`, asserted where they render. */
const ROUTE_SPECIFIC = new Set(['cache-control']);

const expectSiteHeaders = (response: APIResponse, what: string): void => {
  const expected = headersFor(
    parseHeadersFile(readFileSync('public/_headers', 'utf8')),
    ENDPOINT,
  );
  expect(
    expected.size,
    'no global headers parsed from public/_headers',
  ).toBeGreaterThan(0);
  const sent = response.headers();
  expect(
    [...expected]
      .filter(([name]) => !ROUTE_SPECIFIC.has(name.toLowerCase()))
      .filter(([name, value]) => sent[name.toLowerCase()] !== value)
      .map(([name]) => `${name}: ${sent[name.toLowerCase()] ?? '(absent)'}`),
    `the ${what} (${response.status()}) does not send what public/_headers ` +
      `sets on every path`,
  ).toEqual([]);
};

/*
 * Browser headers `request.post` omits. `Origin`: Astro's CSRF check 403s without it.
 * `Sec-Fetch-Mode: navigate`: Cloudflare answers navigations from the asset layer
 * (405) unless `run_worker_first` is set. `CF-Connecting-IP`: one rate limit per request.
 */
let requestCount = 0;
const sameOrigin = (baseURL: string) => ({
  'CF-Connecting-IP': `198.51.100.${(requestCount++ % 254) + 1}`,
  origin: baseURL,
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
  'sec-fetch-site': 'same-origin',
  accept: 'text/html,application/xhtml+xml',
});

/* Serial: the tests share the store and the rate limiter. */
test.describe.configure({ mode: 'serial' });

test.describe('with no contact form', () => {
  test.skip(CONTACT_FORM_ON, 'contact.form is on in src/site.config.ts');

  test('the send route answers 404 to a GET and a POST', async ({
    request,
    baseURL,
  }) => {
    const url = `${baseURL}/contact/send/`;
    const get = await request.get(url, { maxRedirects: 0 });
    /* Same-origin, as a browser sends it; Astro refuses a cross-site POST with 403. */
    const post = await request.post(url, {
      headers: { 'Content-Type': FORM_MEDIA_TYPE, Origin: baseURL! },
      data: new URLSearchParams(validFields()).toString(),
      maxRedirects: 0,
    });
    expect(get.status(), 'a GET reached a form that does not exist').toBe(404);
    expect(post.status(), 'a POST reached a form that does not exist').toBe(
      404,
    );
  });

  test('/contact shows the email address and no form', async ({ page }) => {
    await page.goto(FORM);
    await expect(page.locator('main form')).toHaveCount(0);
    await expect(page.locator('main a[href^="mailto:"]').first()).toBeVisible();
  });
});

test.describe('the contact endpoint', () => {
  test.skip(!CONTACT_FORM_ON, FORM_OFF);

  /* A killed 503 test strands the table its `finally` would have restored. */
  test.beforeAll(() => {
    const stranded = localD1(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${MESSAGES_ASIDE}'`,
    ).includes(`"${MESSAGES_ASIDE}"`);
    if (stranded) {
      throw new Error(
        `Local D1 still holds ${MESSAGES_ASIDE}, left by an interrupted 503 ` +
          'test. Restore it with: npx wrangler d1 execute MESSAGES_DB --local ' +
          `--command "DROP TABLE messages; ALTER TABLE ${MESSAGES_ASIDE} RENAME TO messages"`,
      );
    }
    /* A run stores about twenty messages; kept, they trip HOURLY_NOTIFY_LIMIT on a rerun within the hour. */
    localD1('DELETE FROM messages');
  });

  test('a GET is sent back to the form', async ({ request, baseURL }) => {
    const response = await request.get(ENDPOINT, {
      maxRedirects: 0,
      headers: sameOrigin(baseURL!),
    });

    expect(
      response.status(),
      'a GET to /contact/send/ should redirect to the form.',
    ).toBe(303);
    expect(response.headers()['location']).toContain(FORM);
    expectSiteHeaders(response, 'redirect to the form');
  });

  /* Astro's checkOrigin answers before send.astro runs; nothing is stored or mailed. */
  for (const [label, origin] of [
    ['another origin', 'https://attacker.example'],
    ['no origin', undefined],
  ] as const) {
    test(`a form post from ${label} is refused and stores nothing`, async ({
      request,
      baseURL,
    }) => {
      const marker = `Cross-origin check ${crypto.randomUUID()}`;
      const { origin: _same, ...headers } = sameOrigin(baseURL!);
      const response = await request.post(ENDPOINT, {
        form: { ...validFields(), message: marker },
        maxRedirects: 0,
        headers: origin
          ? { ...headers, origin, 'sec-fetch-site': 'cross-site' }
          : headers,
      });
      expect(response.status()).toBe(403);
      expect(response.headers()['location']).toBeUndefined();
      expectSiteHeaders(response, 'cross-origin refusal');
      expect(
        localD1(`SELECT id FROM messages WHERE body = '${marker}'`),
        'a refused post was stored',
      ).not.toContain('"id"');
    });
  }

  test('a valid submission redirects to the confirmation', async ({
    request,
    baseURL,
  }) => {
    const response = await request.post(ENDPOINT, {
      form: validFields(),
      maxRedirects: 0,
      headers: sameOrigin(baseURL!),
    });

    expect(
      response.status(),
      'a valid submission should answer 303 so a refresh cannot resubmit it.',
    ).toBe(303);
    expect(response.headers()['location']).toContain(SENT);
    expectSiteHeaders(response, 'redirect to the confirmation');
  });

  test('a rejected submission answers 422 and keeps what was typed', async ({
    request,
    baseURL,
  }) => {
    const typed = {
      name: 'Ada Lovelace',
      email: 'not-an-address',
      message: 'too short',
    };

    const response = await request.post(ENDPOINT, {
      form: typed,
      maxRedirects: 0,
      headers: sameOrigin(baseURL!),
    });

    expect(response.status(), 'a rejected submission should answer 422.').toBe(
      422,
    );

    const html = await response.text();

    expect(
      html,
      'the rejected submission should render an error summary.',
    ).toContain('problems with this form');
    expectTitledAndHeaded(html, 'Check your message');

    expectTypedValuesKept(html, typed);

    expect(html, 'a failing control should carry aria-invalid.').toContain(
      'aria-invalid="true"',
    );

    /* Each summary link must point at an id that exists. */
    const summaryTargets = [...html.matchAll(/href="#(contact-[a-z]+)"/g)].map(
      ([, id]) => id,
    );
    expect(
      summaryTargets.length,
      'the error summary should link to each failing field.',
    ).toBeGreaterThan(0);
    for (const id of summaryTargets) {
      expect(
        html,
        `the error summary links to #${id}, and nothing on the page has that id.`,
      ).toContain(`id="${id}"`);
    }

    /* `required` alone is invisible to a sighted reader (SC 3.3.2). */
    expect(
      html.match(
        /<label[^>]*for="contact-(?:name|email|message)"[^>]*>[^<]*<span[^>]*>\(required\)<\/span>/g,
      )?.length,
      'every required field should say "(required)" inside its label.',
    ).toBe(3);
  });

  test('a filled honeypot is answered exactly like a success', async ({
    request,
    baseURL,
  }) => {
    const success = await request.post(ENDPOINT, {
      form: validFields(),
      maxRedirects: 0,
      headers: sameOrigin(baseURL!),
    });

    const trapped = await request.post(ENDPOINT, {
      form: { ...validFields(), website: 'https://spam.example' },
      maxRedirects: 0,
      headers: sameOrigin(baseURL!),
    });

    expect(
      success.status(),
      'a valid submission should answer 303 so a refresh cannot resubmit it.',
    ).toBe(303);
    /* Must be indistinguishable: a bot told which check caught it can adapt. */
    expect(
      trapped.status(),
      'a filled honeypot should answer with the same status as a success.',
    ).toBe(success.status());
    expect(trapped.headers()['location']).toBe(success.headers()['location']);
  });

  test('repeated submissions from one address are rate limited', async ({
    request,
    baseURL,
  }) => {
    /*
     * Cloudflare sets CF-Connecting-IP at the edge; locally it is honoured as
     * sent. 198.18.0.0/15 stays clear of the browser tests' TEST-NET-3 address.
     */
    const address = `198.18.0.${Math.floor(Math.random() * 254) + 1}`;
    const headers = { ...sameOrigin(baseURL!), 'CF-Connecting-IP': address };

    const statuses: number[] = [];
    for (let attempt = 0; attempt < RATE_LIMIT_ATTEMPTS; attempt += 1) {
      const response = await request.post(ENDPOINT, {
        form: validFields(),
        maxRedirects: 0,
        headers,
      });
      statuses.push(response.status());
    }

    expect(
      statuses,
      `${RATE_LIMIT_ATTEMPTS} submissions from one address were never limited: ${statuses.join(', ')}.`,
    ).toContain(429);
  });

  /* A not-sent answer uses the autofocused error summary, which is what announces it. */
  const expectNotSentSummary = (html: string) => {
    expect(
      html,
      'no focused error summary saying the message was not sent',
    ).toMatch(
      /<div class="error-summary"[^>]*autofocus[^>]*>\s*<h2[^>]*>\s*Your message was not sent\s*<\/h2>/,
    );
  };

  /* The 429 page says try again, so the text must still be there. TEST-NET-1 range. */
  test('a rate-limited submission keeps what was typed', async ({
    request,
    baseURL,
  }) => {
    const address = `192.0.2.${Math.floor(Math.random() * 254) + 1}`;
    const headers = { ...sameOrigin(baseURL!), 'CF-Connecting-IP': address };
    const typed = {
      name: 'Grace Hopper',
      email: 'grace@example.com',
      message: `Rate limit check ${crypto.randomUUID()}`,
    };

    let html: string | undefined;
    for (let attempt = 0; attempt < RATE_LIMIT_ATTEMPTS; attempt += 1) {
      const response = await request.post(ENDPOINT, {
        form: typed,
        maxRedirects: 0,
        headers,
      });
      if (response.status() === 429) {
        expectSiteHeaders(response, 'rate-limited page');
        html = await response.text();
        break;
      }
    }

    expect(
      html,
      `no 429 after ${RATE_LIMIT_ATTEMPTS} submissions from one address.`,
    ).toBeDefined();
    expectTypedValuesKept(html!, typed);
    expectNotSentSummary(html!);
    expectTitledAndHeaded(html!, 'Too many messages');
    expect(
      collapseSpace(html!),
      `the not-sent message does not state the limit as "${RATE_LIMIT_WORDS} messages ${RATE_LIMIT_PERIOD_WORDS}".`,
    ).toContain(`${RATE_LIMIT_WORDS} messages ${RATE_LIMIT_PERIOD_WORDS}`);
  });

  /* D1 failure induced by moving the table aside for one request. */
  test('a submission that cannot be stored answers 503 and keeps what was typed', async ({
    request,
    baseURL,
  }) => {
    const typed = {
      name: 'Katherine Johnson',
      email: 'katherine@example.com',
      message: `Storage failure check ${crypto.randomUUID()}`,
    };

    localD1(`ALTER TABLE messages RENAME TO ${MESSAGES_ASIDE}`);
    try {
      const response = await request.post(ENDPOINT, {
        form: typed,
        maxRedirects: 0,
        headers: sameOrigin(baseURL!),
      });

      expect(
        response.status(),
        'a message that could not be stored should answer 503.',
      ).toBe(503);
      expectSiteHeaders(response, 'storage-failure page');

      const html = await response.text();
      expect(html).toContain('Your message could not be saved');
      expectTypedValuesKept(html, typed);
      expectNotSentSummary(html);
      expectTitledAndHeaded(html, 'Message not saved');
    } finally {
      localD1(`ALTER TABLE ${MESSAGES_ASIDE} RENAME TO messages`);
    }
  });

  test('a stored message is emailed to the owner', async ({
    request,
    baseURL,
  }) => {
    const token = crypto.randomUUID();
    const response = await request.post(ENDPOINT, {
      form: { ...validFields(), message: `Notification check ${token}` },
      maxRedirects: 0,
      headers: sameOrigin(baseURL!),
    });
    expect(response.status()).toBe(303);

    await expect
      .poll(() => emailWith(token), {
        ...POLL,
        message:
          'a valid submission was stored but no notification email was sent.',
      })
      .toBeDefined();
    expect(emailWith(token)).toContain(
      `From: ${validFields().name} <${validFields().email}>`,
    );

    const unmarked = localD1(
      `SELECT id FROM messages WHERE body = 'Notification check ${token}' ` +
        'AND notified_at IS NULL',
    );
    expect(
      JSON.parse(unmarked)[0].results,
      'the notification went out but the row was not marked, so the daily ' +
        'resend would email it a second time.',
    ).toEqual([]);
  });

  test('the daily job resends a notification that never went out', async ({
    request,
  }) => {
    const token = crypto.randomUUID();
    const id = `unsent-${token}`;
    localD1(
      'INSERT INTO messages (id, name, email, body, created_at) VALUES ' +
        `('${id}', 'Unsent', 'unsent@example.com', 'Resend check ${token}', ` +
        `${Date.now() - 2 * RESEND_AFTER_MS})`,
    );

    expect((await request.get(SCHEDULED_HANDLER)).status()).toBe(200);

    await expect
      .poll(() => emailWith(token), {
        ...POLL,
        message:
          'a stored message whose notification failed was not resent by the ' +
          'daily job, so the owner never learns it arrived.',
      })
      .toBeDefined();

    await expect
      .poll(
        () =>
          localD1(
            `SELECT id FROM messages WHERE id = '${id}' AND notified_at IS NOT NULL`,
          ),
        {
          ...POLL,
          message:
            'the resent notification was not marked, so it is emailed every day.',
        },
      )
      .toContain(id);
  });

  test('the notification replies to the sender and keeps headers on one line', () => {
    const message = notificationFor(
      {
        name: 'Ada\r\nBcc: victim@example.com',
        email: 'ada@example.com',
        body: 'Hello there, Robin.',
      },
      NOTIFY_TO,
      new Date(0),
    );

    expect(
      message.replyTo,
      'Reply-To should be the sender, so replying from the inbox reaches them.',
    ).toBe('ada@example.com');
    expect(
      message.subject,
      'a name carrying a line break must not start a new header in the subject.',
    ).toBe('Contact form: Ada Bcc: victim@example.com');
    expect(message.to).toBe(NOTIFY_TO);

    const unicodeBreaks = notificationFor(
      {
        name: 'Ada\u0085Bcc\u2028Eve\u2029',
        email: 'ada@example.com',
        body: 'Hi.',
      },
      NOTIFY_TO,
      new Date(0),
    );
    expect(
      unicodeBreaks.subject,
      'a C1 control or Unicode line separator in the name reached the subject.',
    ).toBe('Contact form: Ada Bcc Eve');
  });

  test('the notification sender is the one wrangler.jsonc allows', () => {
    const binding = wranglerConfig<WranglerConfig>().send_email?.find(
      (entry) => entry.name === 'CONTACT_MAILER',
    );

    expect(
      binding?.allowed_sender_addresses,
      'the send_email binding rejects any sender it does not list.',
    ).toEqual([NOTIFICATION_SENDER.email]);
  });

  /* `isRateLimited` fails open without the binding, so only this catches its removal. */
  test('wrangler.jsonc still declares the rate limit /privacy promises', () => {
    const binding = wranglerConfig<WranglerConfig>().ratelimits?.find(
      (entry) => entry.name === RATE_LIMIT_BINDING,
    );

    expect(
      binding,
      `no ${RATE_LIMIT_BINDING} binding in wrangler.jsonc.`,
    ).toBeDefined();
    expect(
      binding?.simple,
      `/privacy promises ${RATE_LIMIT_SUBMISSIONS} submissions ${RATE_LIMIT_PERIOD_WORDS} per address.`,
    ).toEqual({
      limit: RATE_LIMIT_SUBMISSIONS,
      period: RATE_LIMIT_PERIOD_SECONDS,
    });
  });

  test('/privacy states the wrangler.jsonc rate limit', async ({ request }) => {
    const privacy = await request.get('/privacy/');

    expect(privacy.status()).toBe(200);
    expect(
      collapseSpace(await privacy.text()),
      `/privacy does not state the limit as "${RATE_LIMIT_WORDS} ${RATE_LIMIT_PERIOD_WORDS}".`,
    ).toContain(`${RATE_LIMIT_WORDS} ${RATE_LIMIT_PERIOD_WORDS}`);
  });

  /* The body is counted as it streams, so these really post past the cap. */
  test('a body over the cap is refused', async ({ request, baseURL }) => {
    const response = await request.post(ENDPOINT, {
      data: `${FIELDS_PREFIX}${'x'.repeat(MAX_BODY_BYTES)}`,
      headers: {
        ...sameOrigin(baseURL!),
        'content-type': FORM_MEDIA_TYPE,
      },
      maxRedirects: 0,
    });

    expect(response.status(), 'a body larger than the cap was accepted.').toBe(
      413,
    );
    expectSiteHeaders(response, 'too-large response');
  });

  /* Chunked is why the cap cannot be a `Content-Length` check. */
  test('a chunked body with no Content-Length is refused at the same cap', async ({
    baseURL,
  }) => {
    /* `localhost` is IPv6 on CI and IPv4 locally, and Origin must match Host. */
    const served = new URL(baseURL!);

    const sent = await new Promise<{ status: number; length?: string }>(
      (resolve, reject) => {
        const outgoing = httpRequest(
          {
            host: served.hostname,
            port: served.port,
            path: ENDPOINT,
            method: 'POST',
            headers: {
              'content-type': FORM_MEDIA_TYPE,
              'transfer-encoding': 'chunked',
              origin: served.origin,
              'sec-fetch-mode': 'navigate',
              'sec-fetch-dest': 'document',
              'sec-fetch-site': 'same-origin',
              accept: 'text/html',
            },
          },
          (incoming) => {
            incoming.resume();
            resolve({
              status: incoming.statusCode ?? 0,
              length: outgoing.getHeader('content-length') as
                string | undefined,
            });
          },
        );
        outgoing.on('error', reject);
        outgoing.write(FIELDS_PREFIX);
        for (let written = 0; written <= MAX_BODY_BYTES; written += CHUNK) {
          outgoing.write('x'.repeat(CHUNK));
        }
        outgoing.end();
      },
    );

    expect(
      sent.length,
      'the request carried a Content-Length, so it is not chunked.',
    ).toBeUndefined();
    expect(sent.status, 'a chunked body ran past the cap unrefused.').toBe(413);
  });

  test('a body in another media type is not read', async ({
    request,
    baseURL,
  }) => {
    const response = await request.post(ENDPOINT, {
      data: JSON.stringify(validFields()),
      headers: { ...sameOrigin(baseURL!), 'content-type': 'application/json' },
      maxRedirects: 0,
    });

    expect(response.status(), 'a JSON body was read.').toBe(303);
    expect(response.headers()['location']).toContain(FORM);
  });

  /* `,` and `;` separate addresses in `Reply-To`; `type="email"` refuses them anyway. */
  test('an address carrying a second recipient is rejected', async ({
    request,
    baseURL,
  }) => {
    /* One `@`, so the shape check passes with the separator in the local part. */
    for (const email of ['ada,victim@example.com', 'ada;victim@example.com']) {
      const response = await request.post(ENDPOINT, {
        form: { ...validFields(), email },
        maxRedirects: 0,
        headers: sameOrigin(baseURL!),
      });

      expect(
        response.status(),
        `${email} was accepted as a single address.`,
      ).toBe(422);
    }
  });

  test('a submission at the field limits is still accepted', async ({
    request,
    baseURL,
  }) => {
    const response = await request.post(ENDPOINT, {
      form: {
        name: 'n'.repeat(LIMITS.nameMax),
        email: `${'a'.repeat(LIMITS.emailMax - '@example.com'.length)}@example.com`,
        message: 'm'.repeat(LIMITS.bodyMax),
      },
      maxRedirects: 0,
      headers: sameOrigin(baseURL!),
    });

    expect(
      response.status(),
      'the largest submission the form allows was refused.',
    ).toBe(303);
  });

  test('the retention sweep deletes only expired messages', async ({
    request,
  }) => {
    expect(
      wranglerConfig<WranglerConfig>().triggers?.crons?.length,
      `no cron trigger in wrangler.jsonc for the ${RETENTION_DAYS}-day retention sweep.`,
    ).toBeGreaterThan(0);

    const now = Date.now();
    const expired = `expired-${crypto.randomUUID()}`;
    const current = `current-${crypto.randomUUID()}`;
    localD1(
      'INSERT INTO messages (id, name, email, body, created_at) VALUES ' +
        `('${expired}', 'Old', 'old@example.com', 'expired', ${retentionCutoff(now) - DAY_MS}), ` +
        `('${current}', 'New', 'new@example.com', 'current', ${retentionCutoff(now) + DAY_MS})`,
    );

    expect((await request.get(SCHEDULED_HANDLER)).status()).toBe(200);

    const remaining = () =>
      localD1(
        `SELECT id FROM messages WHERE id IN ('${expired}', '${current}')`,
      );

    await expect
      .poll(remaining, {
        ...POLL,
        message: `a message older than ${RETENTION_DAYS} days survived the sweep.`,
      })
      .not.toContain(expired);
    expect(
      remaining(),
      'the sweep deleted a message still inside the retention period.',
    ).toContain(current);
  });

  test("the response carries the site's security headers", async ({
    request,
    baseURL,
  }) => {
    /* Cloudflare applies public/_headers to assets only, not Worker responses. */
    const response = await request.post(ENDPOINT, {
      form: { name: '', email: '', message: '' },
      maxRedirects: 0,
      headers: sameOrigin(baseURL!),
    });

    expect(response.status()).toBe(422);
    expectSiteHeaders(response, 'rejected-submission page');
    expect(
      response.headers()['cache-control'],
      'the error page repeats what was typed, so no cache may keep it.',
    ).toContain('no-store');
    expect(
      response.headers()['content-security-policy'],
      'the on-demand route is missing its CSP.',
    ).toContain("default-src 'self'");
  });
});

/*
 * The error pages only exist as Worker responses, so the route scans never see
 * them. 422 and 503 cover both summaries; 429 shares the 503 one.
 */
test.describe('the contact error pages in a browser', () => {
  test.skip(!CONTACT_FORM_ON, FORM_OFF);

  /* TEST-NET-3: its own rate-limit key, apart from the request tests above. */
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.7' });
  });

  const submit = async (
    page: Page,
    typed: Record<'name' | 'email' | 'message', string>,
  ) => {
    await page.goto(FORM);
    await page.getByLabel('Name').fill(typed.name);
    await page.getByLabel('Email').fill(typed.email);
    await page.getByLabel('Message').fill(typed.message);
    await page.locator('form[data-contact-form] [type=submit]').click();
  };

  /* SC 3.3.6: nothing typed is lost, so a mistake costs one correction. */
  const expectTypedKept = async (page: Page, typed: Record<string, string>) => {
    await expect(page.getByLabel('Name')).toHaveValue(typed.name!);
    await expect(page.getByLabel('Email')).toHaveValue(typed.email!);
    await expect(page.getByLabel('Message')).toHaveValue(typed.message!);
  };

  const expectSummaryFocusedAndClean = async (page: Page, label: string) => {
    await expect(
      page.locator('.error-summary'),
      `focus should land on the ${label} summary so it is read first (SC 3.3.1)`,
    ).toBeFocused();
    const { violations } = await timedScan(page, label);
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
      `axe found WCAG 2.2 AA violations on the ${label} page`,
    ).toEqual([]);
  };

  /* SC 3.3.5 Help: each field's hint stays shown and tied to it beside its error. */
  const expectHelpBesideFields = async (page: Page, label: string) => {
    const missing = await page
      .locator('form[data-contact-form] .field-control')
      .evaluateAll(
        (controls, hinted) =>
          controls.flatMap((control) => {
            const ids = (control.getAttribute('aria-describedby') ?? '')
              .split(/\s+/)
              .filter(Boolean);
            const described = ids
              .map((id) => document.getElementById(id))
              .filter((el) => el?.checkVisibility() && el.textContent?.trim());
            const invalid = control.getAttribute('aria-invalid') === 'true';
            const needed =
              (hinted.includes(control.id) ? 1 : 0) + (invalid ? 1 : 0);
            return described.length >= needed && described.length === ids.length
              ? []
              : [
                  `#${control.id}: ${described.length} of ${needed} shown and tied`,
                ];
          }),
        HINTED_FIELDS,
      );
    expect(
      missing,
      `the ${label} page drops a hint or error from a field`,
    ).toEqual([]);
  };

  /* SC 2.4.12: Tab from the summary, Shift+Tab from the last footer link; no stop is even partly covered. */
  const WALKS = [
    { key: 'Tab', start: (page: Page) => page.locator('.error-summary') },
    {
      key: 'Shift+Tab',
      start: (page: Page) => page.locator('footer a').last(),
    },
  ] as const;

  const expectFocusUncovered = async (page: Page, label: string) => {
    for (const viewport of [REFLOW_VIEWPORT, DESKTOP_VIEWPORT]) {
      for (const { key, start } of WALKS) {
        await page.setViewportSize(viewport);
        await start(page).focus();
        const stops = await tabWalk(page, () => readObscured(page), {
          key,
          max: MAX_PAGE_STOPS,
          settle: () => settleFocusScroll(page),
        });
        expect(
          stops.length,
          `the ${label} page ${key} walk found no stops`,
        ).toBeGreaterThan(1);
        expect(
          obscuredReport(stops),
          `the ${label} page at ${viewport.width}px, ${key}, has focused controls partly hidden`,
        ).toEqual([]);
      }
    }
  };

  /* On-demand pages point images at /_image, which only the Worker serves. */
  const expectEveryImageLoaded = async (page: Page, label: string) => {
    await expect
      .poll(
        () =>
          page
            .locator('img')
            .evaluateAll((images) =>
              (images as HTMLImageElement[])
                .filter((img) => !img.complete || img.naturalWidth === 0)
                .map((img) => img.currentSrc || img.src),
            ),
        { message: `the ${label} page has images that did not load` },
      )
      .toEqual([]);
  };

  test('the rejected-submission page', async ({ page }) => {
    const typed = {
      name: 'Ada Lovelace',
      email: 'not-an-address',
      message: 'too short',
    };
    await submit(page, typed);
    await expect(
      page.getByText(/problems? with this form/),
      'the submission was not rejected as invalid, so the 422 page was never scanned',
    ).toBeVisible();
    await expect(page).toHaveTitle(/^Error: Check your message /);
    await expectSummaryFocusedAndClean(page, 'rejected-submission');
    await expectEveryImageLoaded(page, 'rejected-submission');
    await expectTypedKept(page, typed);
    await expectHelpBesideFields(page, 'rejected-submission');
    await expectFocusUncovered(page, 'rejected-submission');
  });

  test('the storage-failure page', async ({ page }) => {
    localD1(`ALTER TABLE messages RENAME TO ${MESSAGES_ASIDE}`);
    try {
      await submit(page, validFields());
      await expect(
        page.getByText('Your message could not be saved'),
      ).toBeVisible();
      await expectSummaryFocusedAndClean(page, 'storage-failure');
      await expectEveryImageLoaded(page, 'storage-failure');
      await expectTypedKept(page, validFields());
      await expectHelpBesideFields(page, 'storage-failure');
      await expectFocusUncovered(page, 'storage-failure');
    } finally {
      localD1(`ALTER TABLE ${MESSAGES_ASIDE} RENAME TO messages`);
    }
  });
});
