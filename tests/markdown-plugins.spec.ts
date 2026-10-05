import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, test } from './test';
import { linkListItem } from '../src/plugins/link-list-item.mjs';
import { captionChildren, postFigure } from '../src/plugins/post-figure.mjs';
import {
  PHOTOGRAPHERS,
  SCREENSHOT_SOURCES,
  type LicensedPhoto,
} from '../src/lib/credits';
import { NODE } from './tags';
import { BLOG_CONTENT_DIR, TALKS_DIR } from './routes';
import { DECK_FILE } from '../src/lib/slides';

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

const el = (tagName: string, children: Node[] = [], properties = {}): Node => ({
  type: 'element',
  tagName,
  properties,
  children,
});
const text = (value: string): Node => ({ type: 'text', value });

/* The visitor context the content pipeline hands a plugin, over a real tree. */
const contextFor = (root: Node, fileURL?: URL) => {
  const parents = new Map<Node, Node>();
  const index = (node: Node) =>
    node.children?.forEach((child) => {
      parents.set(child, node);
      index(child);
    });
  index(root);
  const textContent = (node: Node): string =>
    node.type === 'text'
      ? (node.value ?? '')
      : (node.children ?? []).map(textContent).join('');
  return {
    fileURL,
    parent: (node: Node) => parents.get(node),
    textContent,
    setProperty: (node: Node, key: string, value: unknown) => {
      node.properties = { ...(node.properties ?? {}), [key]: value };
    },
    replaceNode: (old: Node, replacement: Node) => {
      const parent = parents.get(old)!;
      parent.children = parent.children!.map((c) =>
        c === old ? replacement : c,
      );
      parents.set(replacement, parent);
    },
  };
};

const marked = (li: Node) =>
  ((li.properties?.className as string[] | undefined) ?? []).length > 0;

test.describe('link-list-item', NODE, () => {
  test('marks a list item that is only a link, through bold', () => {
    const link = el('a', [text('Astro')], { href: '/' });
    const li = el('li', [el('strong', [link])]);
    linkListItem.element.visit(link, contextFor(el('ul', [li])));
    expect(marked(li)).toBe(true);
  });

  test('leaves a list item whose link sits in a sentence', () => {
    const link = el('a', [text('Astro')], { href: '/' });
    const li = el('li', [text('I work on '), link, text(' daily.')]);
    linkListItem.element.visit(link, contextFor(el('ul', [li])));
    expect(marked(li), 'a link in a sentence takes the inline exception').toBe(
      false,
    );
  });
});

/* Paths only, unless passed as `fileURL`: then the plugin reads the post for a `cover`. */
const POST_URL = pathToFileURL(resolve(BLOG_CONTENT_DIR, 'any-post.md'));
const TALK_URL = pathToFileURL(resolve(TALKS_DIR, 'any-deck', DECK_FILE));
/* A post opens on its cover, if it has one; the priority tests need both kinds. */
const postFile = (frontmatter: string): URL => {
  const file = join(mkdtempSync(join(tmpdir(), 'post-figure-')), 'post.md');
  writeFileSync(file, `---\n${frontmatter}\n---\n\nBody.\n`);
  return pathToFileURL(file);
};
const UNCOVERED_POST_URL = postFile("title: 'No cover'");
const COVERED_POST_URL = postFile("title: 'Cover'\ncover: './cover.jpg'");
const PHOTO = relative(
  dirname(fileURLToPath(POST_URL)),
  resolve('tests/fixtures/photo-4x3.png'),
);
const PORTRAIT_PHOTO = relative(
  dirname(fileURLToPath(POST_URL)),
  resolve('tests/fixtures/photo-3x4.png'),
);

test.describe('post-figure', NODE, () => {
  test('a captioned photo alone in its paragraph becomes a figure with a credit', async () => {
    const img = el('img', [], {
      src: PHOTO,
      alt: 'Two friends',
      title: 'Photo: Someone',
    });
    const p = el('p', [img]);
    const root = el('root', [p]);
    await postFigure().element.visit(img, contextFor(root, POST_URL));
    const figure = root.children![0]!;
    expect(figure.tagName).toBe('figure');
    const caption = figure.children!.find((c) => c.tagName === 'figcaption');
    expect(caption, 'the title became no caption').toBeDefined();
  });

  for (const [prefix, name, href] of [
    ['Photo: ', 'Licence and credit', PHOTOGRAPHERS['Licence and credit']],
    ['Screenshot: ', 'Example Project', SCREENSHOT_SOURCES['Example Project']],
  ] as const) {
    test(`a "${prefix}${name}" caption links the listed source`, async () => {
      const img = el('img', [], {
        src: PHOTO,
        alt: 'x',
        title: `${prefix}${name}`,
      });
      const root = el('root', [el('p', [img])]);
      await postFigure().element.visit(img, contextFor(root, POST_URL));
      const caption = root.children![0]!.children!.find(
        (c) => c.tagName === 'figcaption',
      )!;
      const anchor = caption.children!.find((c) => c.tagName === 'a');
      expect(anchor?.properties?.href, `${name} is not linked`).toBe(href);
    });
  }

  test('a Creative Commons photo credits its source, licence and changes', () => {
    const photo: LicensedPhoto = {
      photographer: 'Licence and credit',
      title: 'A Fixture Photo',
      source: 'https://photos.example/fixture',
      sourceName: 'Photos Example',
      licence: 'Creative Commons Attribution 4.0',
      licenceHref: 'https://creativecommons.org/licenses/by/4.0/',
      changes: 'cropped',
    };
    const nodes: Node[] = captionChildren(
      'Photo: Licence and credit',
      '../../assets/blog/x/cc-fixture.jpg',
      { 'cc-fixture': photo },
    );
    const textOf = (node: Node): string =>
      node.type === 'text'
        ? String(node.value)
        : (node.children ?? []).map(textOf).join('');
    expect(
      nodes.map(textOf).join(''),
      'the caption does not name the source, licence and changes',
    ).toBe(
      'Photo: Licence and credit (A Fixture Photo on Photos Example, Creative Commons Attribution 4.0, cropped)',
    );
    expect(
      nodes
        .filter((node) => node.tagName === 'a')
        .map((a) => a.properties?.href),
      'the photographer, source and licence are not all linked',
    ).toEqual([
      PHOTOGRAPHERS['Licence and credit'],
      photo.source,
      photo.licenceHref,
    ]);
  });

  test('a photo not in LICENSED_PHOTOS gets no licence text', () => {
    expect(
      captionChildren('Photo: Licence and credit', 'other.jpg', {}).length,
      'a licence was added to an unlicensed photo',
    ).toBe(2);
  });

  test('a credit naming an unlisted source stays plain text', async () => {
    const img = el('img', [], {
      src: PHOTO,
      alt: 'x',
      title: 'Screenshot: Nobody Listed',
    });
    const root = el('root', [el('p', [img])]);
    await postFigure().element.visit(img, contextFor(root, POST_URL));
    const caption = root.children![0]!.children!.find(
      (c) => c.tagName === 'figcaption',
    )!;
    expect(
      caption.children!.some((c) => c.tagName === 'a'),
      'an unlisted source was linked',
    ).toBe(false);
  });

  test('an uncaptioned photo alone in a post paragraph still becomes a figure', async () => {
    const img = el('img', [], { src: PHOTO, alt: 'Two friends' });
    const root = el('root', [el('p', [img])]);
    await postFigure().element.visit(img, contextFor(root, POST_URL));
    const figure = root.children![0]!;
    expect(figure.tagName).toBe('figure');
    expect(
      figure.children!.some((c) => c.tagName === 'figcaption'),
      'an empty caption was added',
    ).toBe(false);
  });

  test('a portrait figure is marked and sized to the measure, a landscape to the page', async () => {
    const figureFor = async (src: string) => {
      const img = el('img', [], { src, alt: 'x', title: 'Photo: Someone' });
      const root = el('root', [el('p', [img])]);
      await postFigure().element.visit(img, contextFor(root, POST_URL));
      return root.children![0]!;
    };
    const sizesOf = (figure: Awaited<ReturnType<typeof figureFor>>) =>
      String(figure.children![0]!.children![1]!.properties?.sizes);
    const portrait = await figureFor(PORTRAIT_PHOTO);
    const landscape = await figureFor(PHOTO);
    expect(portrait.properties?.className).toEqual(['figure-portrait']);
    expect(landscape.properties?.className).toBeUndefined();
    expect(sizesOf(portrait), 'a portrait slot passes the measure').toContain(
      '36rem)',
    );
    expect(sizesOf(portrait)).not.toContain('80rem');
    expect(
      sizesOf(landscape),
      'a landscape slot stops at the measure',
    ).toContain('80rem');
  });

  test('an image inside a sentence keeps its paragraph and its title', async () => {
    const img = el('img', [], { src: PHOTO, alt: 'x', title: 'kept' });
    const p = el('p', [text('See '), img, text(' here.')]);
    const root = el('root', [p]);
    await postFigure().element.visit(img, contextFor(root, POST_URL));
    expect(root.children![0]).toBe(p);
    expect(img.properties?.sizes).toBeTruthy();
  });

  test('a talk slide photo takes the slide column sizes, a post photo the post column', async () => {
    const sizes = async (url: URL) => {
      const img = el('img', [], { src: PHOTO, alt: 'x' });
      const p = el('p', [text('in '), img]);
      await postFigure().element.visit(img, contextFor(el('root', [p]), url));
      return String(img.properties?.sizes);
    };
    const post = await sizes(POST_URL);
    const talk = await sizes(TALK_URL);
    expect(talk).not.toBe(post);
    expect(talk).toContain('55vh');
  });

  const priorities = async (url: URL): Promise<boolean[]> => {
    const plugin = postFigure({ fileURL: url });
    const images = [1, 2].map(() => el('img', [], { src: PHOTO, alt: 'x' }));
    const root = el(
      'root',
      images.map((img) => el('p', [text('in '), img])),
    );
    for (const img of images) {
      await plugin.element.visit(img, contextFor(root, url));
    }
    return images.map((img) => img.properties?.priority === true);
  };

  test("a post's first image loads with priority, and no other image does", async () => {
    expect(
      await priorities(UNCOVERED_POST_URL),
      'only the first image of a post should be fetched eagerly and first.',
    ).toEqual([true, false]);
  });

  test('a post with a cover gives none of its body images priority', async () => {
    expect(
      await priorities(COVERED_POST_URL),
      'the cover is the first image; a body image would compete with it.',
    ).toEqual([false, false]);
  });

  test('a talk slide image never takes priority', async () => {
    const img = el('img', [], { src: PHOTO, alt: 'x' });
    const root = el('root', [el('p', [text('in '), img])]);
    await postFigure({ fileURL: TALK_URL }).element.visit(
      img,
      contextFor(root, TALK_URL),
    );
    expect(
      img.properties?.priority,
      'each slide compiles alone, so every slide would claim priority.',
    ).toBeUndefined();
  });
});
