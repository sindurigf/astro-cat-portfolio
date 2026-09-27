import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { expect, test } from './test';
import { linkListItem } from '../src/plugins/link-list-item.mjs';
import { postFigure } from '../src/plugins/post-figure.mjs';
import { NODE } from './tags';

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

const POST_URL = pathToFileURL(resolve('src/content/blog/sample-post.md'));
const TALK_URL = pathToFileURL(
  resolve('src/content/talks/sample-talk/slides.md'),
);
const PHOTO = '../../assets/blog/sample-post/cover.jpg';

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

  test("a post's first image loads with priority, and no other image does", async () => {
    const plugin = postFigure({ fileURL: POST_URL });
    const images = [1, 2].map(() => el('img', [], { src: PHOTO, alt: 'x' }));
    const root = el(
      'root',
      images.map((img) => el('p', [text('in '), img])),
    );
    for (const img of images) {
      await plugin.element.visit(img, contextFor(root, POST_URL));
    }
    expect(
      images.map((img) => img.properties?.priority === true),
      'only the first image of a post should be fetched eagerly and first.',
    ).toEqual([true, false]);
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
