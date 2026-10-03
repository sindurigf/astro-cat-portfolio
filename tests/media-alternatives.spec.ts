import { expect, test } from './test';
import { builtHtml } from './routes';
import { NODE } from './tags';

/*
 * No video or audio is published, so SC 1.2.x and 1.4.7 do not apply. This fails
 * the first one without its alternatives; markup: ACCESSIBILITY.md section 9, Media.
 */

const VIDEO_ALTERNATIVES = [
  'transcript',
  'sign-language',
  'extended-description',
] as const;
const AUDIO_ALTERNATIVES = ['transcript'] as const;

const idOf = (tag: string): string | null =>
  /\sid=["']([^"']+)["']/.exec(tag)?.[1] ?? null;

const hasAlternative = (html: string, id: string, kind: string): boolean =>
  [...html.matchAll(/<a\b[^>]*>/g)].some(
    ([tag]) =>
      tag.includes(`data-media-for="${id}"`) &&
      tag.includes(`data-media-alternative="${kind}"`),
  );

/** What a page's media lacks, one line per gap; empty when it has no media. */
const mediaGaps = (html: string): string[] => {
  const gaps: string[] = [];

  for (const [element, tag, body] of html.matchAll(
    /(<video\b[^>]*>)([\s\S]*?)<\/video>/g,
  )) {
    const id = idOf(tag!);
    if (!id) {
      gaps.push(`${element.slice(0, 60)}: no id for its alternatives`);
      continue;
    }
    if (!/<track\b[^>]*kind=["']captions["']/.test(body!)) {
      gaps.push(`video#${id}: no captions track (SC 1.2.2)`);
    }
    for (const kind of VIDEO_ALTERNATIVES) {
      if (!hasAlternative(html, id, kind)) {
        gaps.push(`video#${id}: no ${kind} link`);
      }
    }
  }

  for (const [element, tag] of html.matchAll(/(<audio\b[^>]*>)/g)) {
    const id = idOf(tag!);
    if (!id) {
      gaps.push(`${element.slice(0, 60)}: no id for its alternatives`);
      continue;
    }
    for (const kind of AUDIO_ALTERNATIVES) {
      if (!hasAlternative(html, id, kind)) {
        gaps.push(`audio#${id}: no ${kind} link`);
      }
    }
    if (!tag!.includes('data-background-audio-checked')) {
      gaps.push(`audio#${id}: background sound not checked (SC 1.4.7)`);
    }
  }

  for (const [tag] of html.matchAll(/<iframe\b[^>]*>/g)) {
    gaps.push(`${tag.slice(0, 60)}: an embedded player cannot be checked`);
  }

  return gaps;
};

const BARE_VIDEO =
  '<main><video id="talk" src="/videos/talk.mp4"></video></main>';

const COMPLETE_VIDEO = `<main>
  <video id="talk" src="/videos/talk.mp4" controls>
    <track kind="captions" src="/videos/talk.vtt" srclang="en" label="English">
  </video>
  <a href="/videos/talk-transcript/" data-media-for="talk" data-media-alternative="transcript">Transcript</a>
  <a href="/videos/talk-sign/" data-media-for="talk" data-media-alternative="sign-language">Sign language version</a>
  <a href="/videos/talk-described/" data-media-for="talk" data-media-alternative="extended-description">Described version</a>
</main>`;

test.describe('time-based media (SC 1.2.6 to 1.2.8, 1.4.7)', NODE, () => {
  test('a bare video fails the check', () => {
    expect(mediaGaps(BARE_VIDEO)).toEqual([
      'video#talk: no captions track (SC 1.2.2)',
      'video#talk: no transcript link',
      'video#talk: no sign-language link',
      'video#talk: no extended-description link',
    ]);
  });

  test('a video with every alternative passes the check', () => {
    expect(mediaGaps(COMPLETE_VIDEO)).toEqual([]);
  });

  test('no built page has media without its alternatives', () => {
    const pages = builtHtml();
    expect(pages.size, 'no built pages to check').toBeGreaterThan(0);
    const gaps = [...pages].flatMap(([route, html]) =>
      mediaGaps(html).map((gap) => `${route}: ${gap}`),
    );
    expect(gaps, 'media published without its alternatives').toEqual([]);
  });
});
