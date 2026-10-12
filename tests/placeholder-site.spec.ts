import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { expect, test } from './test';
import { NODE } from './tags';
import { placeholderSiteNotice } from '../src/lib/example-host';
import { placeholderSite } from '../scripts/placeholder-site.mjs';

/* SEO: a site deployed with the shipped `site.url` is canonical to another domain on every page. */

const PLACEHOLDERS = [
  'https://example.com',
  'https://www.example.org',
  'https://example.net',
  'https://site.example',
];
const REAL = ['https://notexample.com', 'https://example.dev'];
const CHECK_COULD_NOT_RUN = 2;

const warningsFor = (siteUrl: string): string[] => {
  const warnings: string[] = [];
  placeholderSite(siteUrl).hooks['astro:build:start']({
    logger: { warn: (message: string) => warnings.push(message) },
  });
  return warnings;
};

/** Runs the live check with a `curl` that records each call and reaches nothing. */
const runLiveCheck = (
  siteUrl: string,
): { status: number | null; stderr: string; requests: string } => {
  const bin = mkdtempSync(join(tmpdir(), 'check-live-'));
  const calls = join(bin, 'calls');
  const curl = join(bin, 'curl');
  writeFileSync(curl, `#!/bin/sh\necho "$@" >> "${calls}"\nexit 7\n`);
  chmodSync(curl, 0o755);
  try {
    const { status, stderr } = spawnSync('sh', ['scripts/check-live.sh'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}`,
        SITE_URL: siteUrl,
        CHECK_LIVE_SKIP_D1: '1',
      },
    });
    return {
      status,
      stderr,
      requests: existsSync(calls) ? readFileSync(calls, 'utf8') : '',
    };
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
};

test.describe('a placeholder site.url', NODE, () => {
  test('is named for every RFC 2606 host and for no other', () => {
    for (const url of PLACEHOLDERS) {
      expect(placeholderSiteNotice(url), url).toContain(url);
    }
    for (const url of REAL) {
      expect(placeholderSiteNotice(url), url).toBeNull();
    }
  });

  test('warns in the build, and a real origin does not', () => {
    for (const url of PLACEHOLDERS) {
      expect(warningsFor(url), `${url} built without a warning.`).toHaveLength(
        1,
      );
    }
    for (const url of REAL) {
      expect(warningsFor(url), `${url} is not a placeholder.`).toEqual([]);
    }
  });

  test('stops the live check before it requests anything', () => {
    const { status, stderr, requests } = runLiveCheck('');

    expect(
      stderr,
      'the check does not say site.url is a placeholder.',
    ).toContain('site.url is still the placeholder');
    expect(status).toBe(CHECK_COULD_NOT_RUN);
    expect(requests, 'the check fetched from the placeholder origin.').toBe('');
  });

  test('does not stop the live check of a real origin', () => {
    const { stderr, requests } = runLiveCheck('https://notexample.com');

    expect(stderr).not.toContain('placeholder');
    /* Past this guard: at its first request, or at the next guard (tests/statement-guard.spec.ts). */
    expect(
      requests.includes('https://notexample.com') ||
        stderr.includes('ACCESSIBILITY.md'),
      'the check stopped before its first request.',
    ).toBe(true);
  });
});
