import { pathToFileURL } from 'node:url';
import type { LoaderContext } from 'astro/loaders';
import { expect, test } from './test';
import { fixture } from './check-fixture';
import { NODE } from './tags';
import { talkLoader } from '../src/lib/talk-loader';
import { DECK_FILE } from '../src/lib/slides';

/** Build correctness: a slide cannot set the fields the loader derives. */

const DERIVED = ['deck', 'number', 'title'] as const;

const loadWithFrontmatter = async (
  frontmatter: Record<string, unknown>,
): Promise<void> => {
  const root = fixture({
    [`src/content/talks/deck/${DECK_FILE}`]:
      '---\nlayout: cover\ninfo: A description of the talk.\n---\n\n# Cover\n',
  });
  const context = {
    config: { root: pathToFileURL(`${root}/`) },
    store: { clear: () => undefined, set: () => true },
    watcher: undefined,
    generateDigest: (value: string) => value,
    parseData: async ({ data }: { data: unknown }) => data,
    renderMarkdown: async () => ({
      html: '',
      metadata: { imagePaths: [], frontmatter },
    }),
  } as unknown as LoaderContext;
  await talkLoader({ base: 'src/content/talks' }).load(context);
};

test.describe('talk loader derived fields', NODE, () => {
  for (const key of DERIVED) {
    test(`fails a slide that sets ${key} and names the file and slide`, async () => {
      await expect(
        loadWithFrontmatter({
          layout: 'cover',
          info: 'A description of the talk.',
          [key]: 'x',
        }),
      ).rejects.toThrow(
        `src/content/talks/deck/${DECK_FILE}, slide 1: sets ${key}:, which the loader derives.`,
      );
    });
  }
});
