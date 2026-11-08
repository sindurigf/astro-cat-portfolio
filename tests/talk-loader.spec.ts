import { expect, test } from './test';
import { fixture } from './check-fixture';
import { NODE } from './tags';
import { checkDeck, talkLoader } from '../src/lib/talk-loader';
import { DECK_FILE } from '../src/lib/slides';
import type { LoaderContext } from 'astro/loaders';
import { pathToFileURL } from 'node:url';

/** Build correctness: the loader's cross-slide rules fail the build with a message naming the slide. */

type Slide = { number: number; data: Record<string, unknown> };

const COVER: Slide = {
  number: 1,
  data: { layout: 'cover', info: 'A description of the talk.' },
};
const PART_OPENER: Slide = {
  number: 2,
  data: { layout: 'section', part: 'Part 1' },
};

const fail = (number: number, message: string) =>
  new Error(`deck, slide ${number}: ${message}`);

const messageOf = (slides: Slide[]): string | undefined => {
  try {
    checkDeck(slides, fail);
  } catch (error) {
    return (error as Error).message;
  }
  return undefined;
};

test.describe('talk loader cross-slide rules', NODE, () => {
  test('accepts a cover, then a part opener, then slides', () => {
    expect(
      messageOf([COVER, PART_OPENER, { number: 3, data: {} }]),
    ).toBeUndefined();
  });

  test('rejects a deck whose slide 1 is not the cover', () => {
    expect(messageOf([{ number: 1, data: { info: 'x' } }])).toBe(
      'deck, slide 1: is the cover, so it needs layout: cover.',
    );
  });

  test('rejects a cover that is not slide 1', () => {
    expect(
      messageOf([COVER, PART_OPENER, { number: 3, data: { layout: 'cover' } }]),
    ).toBe('deck, slide 3: uses layout: cover, which only slide 1 can.');
  });

  test('rejects a cover without info', () => {
    expect(messageOf([{ number: 1, data: { layout: 'cover' } }])).toBe(
      'deck, slide 1: needs info: in the opening frontmatter. It is the page description.',
    );
  });

  test('rejects info on a slide after the cover', () => {
    expect(
      messageOf([COVER, PART_OPENER, { number: 3, data: { info: 'x' } }]),
    ).toBe('deck, slide 3: sets info, which belongs to slide 1.');
  });

  test('rejects slide 2 without a part', () => {
    expect(messageOf([COVER, { number: 2, data: {} }])).toBe(
      'deck, slide 2: comes before any part:. The first slide after the cover opens a part.',
    );
  });

  test('rejects a section slide without a part', () => {
    expect(
      messageOf([
        COVER,
        PART_OPENER,
        { number: 3, data: { layout: 'section' } },
      ]),
    ).toBe('deck, slide 3: uses layout: section, which opens a part: name it.');
  });
});

const COVER_MARKDOWN = (body: string) =>
  `---\nlayout: cover\ninfo: A description of the talk.\n---\n\n# Cover\n\n${body}\n`;

/** Runs the loader on one deck, with a renderer that reports an image path for any `![`. */
const loadCover = async (body: string): Promise<void> => {
  const root = fixture({
    [`src/content/talks/deck/${DECK_FILE}`]: COVER_MARKDOWN(body),
  });
  const context = {
    config: { root: pathToFileURL(`${root}/`) },
    store: { clear: () => undefined, set: () => true },
    watcher: undefined,
    generateDigest: (value: string) => value,
    parseData: async ({ data }: { data: unknown }) => data,
    renderMarkdown: async (markdown: string) => ({
      html: '',
      metadata: {
        imagePaths: markdown.includes('![') ? ['./cover.png'] : [],
        frontmatter: { layout: 'cover', info: 'A description of the talk.' },
      },
    }),
  } as unknown as LoaderContext;
  await talkLoader({ base: 'src/content/talks' }).load(context);
};

test.describe('talk loader cover image', NODE, () => {
  test('fails a cover that holds an image and names the file and slide', async () => {
    await expect(loadCover('![A cat](./cover.png)')).rejects.toThrow(
      `src/content/talks/deck/${DECK_FILE}, slide 1: has an image. The cover is the page hero, which shows its text only.`,
    );
  });

  test('accepts a cover with text only', async () => {
    await loadCover('Just words.');
  });
});
