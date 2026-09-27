import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Loader, LoaderContext } from 'astro/loaders';
import { cardGroups, DECK_FILE, splitDeck, type SourceSlide } from './slides';
import { errorMessage } from './errors';

/* Set by the loader; a slide setting one fails instead of being overwritten. */
const DERIVED_KEYS = ['deck', 'number', 'title'] as const;

/*
 * One entry per slide, id `<deck>/<number>`. Not the glob loader: parsed whole,
 * `---` becomes a thematic break before any plugin sees it.
 */
export const talkLoader = ({ base }: { base: string }): Loader => ({
  name: 'talk-loader',
  load: async (context) => {
    const root = fileURLToPath(context.config.root);
    const dir = join(root, base);

    const loadAll = async () => {
      context.store.clear();
      if (!existsSync(dir)) return;
      const decks = await readdir(dir, { withFileTypes: true });
      for (const entry of decks) {
        const file = join(dir, entry.name, DECK_FILE);
        if (entry.isDirectory() && existsSync(file)) {
          await loadDeck(context, root, entry.name, file);
        }
      }
    };

    await loadAll();
    context.watcher?.on('change', (changed) => {
      if (!changed.startsWith(dir)) return;
      loadAll().catch((error: unknown) =>
        context.logger.error(`talk decks not reloaded: ${errorMessage(error)}`),
      );
    });
  },
});

/* Cross-slide rules: a slide before the first part would skip a level. */
const checkDeck = (
  slides: ReadonlyArray<{ number: number; data: Record<string, unknown> }>,
  fail: (number: number, message: string) => Error,
) => {
  for (const { number, data } of slides) {
    const isCover = data.layout === 'cover';
    if (number === 1 && !isCover) {
      throw fail(number, 'is the cover, so it needs layout: cover.');
    }
    if (number !== 1 && isCover) {
      throw fail(number, 'uses layout: cover, which only slide 1 can.');
    }
    if (number === 1 && typeof data.info !== 'string') {
      throw fail(
        number,
        'needs info: in the opening frontmatter. It is the page description.',
      );
    }
    if (number !== 1 && data.info !== undefined) {
      throw fail(number, 'sets info, which belongs to slide 1.');
    }
    if (number === 2 && data.part === undefined) {
      throw fail(
        number,
        'comes before any part:. The first slide after the cover opens a part.',
      );
    }
    if (data.layout === 'section' && data.part === undefined) {
      throw fail(number, 'uses layout: section, which opens a part: name it.');
    }
  }
};

const loadDeck = async (
  context: LoaderContext,
  root: string,
  deck: string,
  file: string,
) => {
  const source = await readFile(file, 'utf8');
  const label = relative(root, file).split(sep).join('/');
  const fail = (number: number, message: string) =>
    new Error(`${label}, slide ${number}: ${message}`);

  const parsed: Array<{ slide: SourceSlide; data: Record<string, unknown> }> =
    [];
  for (const slide of splitDeck(source, label)) {
    const body = cardGroups(slide.body);
    const markdown =
      slide.frontmatter === undefined
        ? body
        : `---\n${slide.frontmatter}\n---\n\n${body}`;
    const rendered = await context.renderMarkdown(markdown, {
      fileURL: pathToFileURL(file),
    });
    if (slide.number === 1 && rendered.metadata?.imagePaths?.length) {
      throw fail(
        slide.number,
        'has an image. The cover is the page hero, which shows its text only.',
      );
    }
    const id = `${deck}/${String(slide.number).padStart(2, '0')}`;
    const settings = rendered.metadata?.frontmatter ?? {};
    for (const key of DERIVED_KEYS) {
      if (key in settings) {
        throw fail(
          slide.number,
          `sets ${key}:, which the loader derives. The slide's # heading is ` +
            'its title.',
        );
      }
    }
    const data = await context.parseData({
      id,
      data: {
        ...settings,
        deck,
        number: slide.number,
        title: slide.title,
      },
    });
    parsed.push({ slide, data });
    context.store.set({
      id,
      data,
      filePath: label,
      digest: context.generateDigest(`${slide.frontmatter}\n${slide.body}`),
      rendered,
      assetImports: rendered.metadata?.imagePaths,
    });
  }

  checkDeck(
    parsed.map(({ slide, data }) => ({ number: slide.number, data })),
    fail,
  );
};
