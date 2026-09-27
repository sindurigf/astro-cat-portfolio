import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { builtPages, deckOf, DIST_DIR, TALK_ROUTES, TALKS_DIR } from './routes';
import { cardGroups, DECK_FILE, splitDeck } from '../src/lib/slides';
import { NODE } from './tags';

/**
 * `splitDeck` is shared with the loader, so a lost slide would vanish on both
 * sides; the fixtures below pin it to fixed inputs. Reads dist/ and src/ inside
 * test bodies only; see tests/routes.ts.
 */

interface Slide {
  id: string;
  level: number;
  text: string;
  part: string;
}

const decode = (html: string): string =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/* A line match suffices: the loader's schema allows only flat strings. */
const setting = (yaml: string | undefined, key: string): string | undefined => {
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(yaml ?? '');
  return match?.[1].trim().replace(/^'(.*)'$/, '$1');
};

/** The cover is an h1; every other slide an h2 with its label. */
const expectedSlides = (source: string, file: string): Slide[] => {
  let part = '';
  return splitDeck(source, file).map((slide) => {
    part = setting(slide.frontmatter, 'part') ?? part;
    const label = setting(slide.frontmatter, 'label');
    return {
      id: `slide-${slide.number}`,
      level: slide.number === 1 ? 1 : 2,
      text: label === undefined ? slide.title : `${label}: ${slide.title}`,
      part,
    };
  });
};

const builtSlides = (route: string): Slide[] => {
  const page = builtPages().find((p) => p.route === route);
  expect(page, `${route} is not in the build.`).toBeDefined();
  const html = readFileSync(page!.file, 'utf8');
  const main = /<main[\s\S]*?<\/main>/.exec(html)?.[0] ?? '';
  return [
    ...main.matchAll(
      /<section\b([^>]*)>[\s\S]*?<h([1-6])[^>]*>([\s\S]*?)<\/h\2>/g,
    ),
  ].map(([, attributes, level, inner]) => ({
    id: /\bid="([^"]*)"/.exec(attributes)?.[1] ?? '',
    level: Number(level),
    text: decode(inner).replace(/ :/, ':'),
    part: decode(/\bdata-part="([^"]*)"/.exec(attributes)?.[1] ?? ''),
  }));
};

const describeSlide = ({ id, level, text, part }: Slide): string =>
  `#${id} h${level} '${text}'${part ? ` in '${part}'` : ''}`;

const builtText = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return builtText(path);
    return /\.(html|js|css|txt|xml|json)$/.test(entry.name) ? [path] : [];
  });

test.describe('a talk slideshow', NODE, () => {
  for (const route of TALK_ROUTES) {
    const file = join(TALKS_DIR, deckOf(route), DECK_FILE);

    test(`${route} has every slide of ${file}, in order`, () => {
      const expected = expectedSlides(readFileSync(file, 'utf8'), file);
      const actual = builtSlides(route);

      const first = expected.findIndex(
        (slide, i) =>
          actual[i] === undefined ||
          describeSlide(slide) !== describeSlide(actual[i]),
      );
      expect(
        first,
        first === -1
          ? ''
          : `${route} departs from ${file} at slide ${first + 1}: expected ` +
              `${describeSlide(expected[first])}, found ` +
              `${actual[first] ? describeSlide(actual[first]) : 'nothing'}.`,
      ).toBe(-1);
      expect(
        actual.length,
        `${route} has ${actual.length - expected.length} slide(s) that ` +
          `${file} does not: ${actual
            .slice(expected.length)
            .map(describeSlide)
            .join(', ')}.`,
      ).toBe(expected.length);
    });

    /* Speaker notes belong only in the source, read by the dev server's presenter view. */
    test(`${route} publishes none of the speaker notes in ${file}`, () => {
      const notes = splitDeck(readFileSync(file, 'utf8'), file)
        .map((slide) => slide.note)
        .filter((note): note is string => Boolean(note));
      const published = builtText(DIST_DIR).flatMap((path) => {
        const text = readFileSync(path, 'utf8');
        return notes
          .filter((note) => text.includes(note))
          .map((note) => `"${note.slice(0, 40)}…" in ${path}`);
      });
      expect(published, 'a speaker note reached the build').toEqual([]);
    });
  }
});

/* Each case is a Slidev rule or a refusal the page depends on. */
test.describe('splitDeck', NODE, () => {
  const FILE = 'fixture.md';
  const COVER = '---\nlayout: cover\n---\n\n# Cover\n';
  const split = (rest: string) => splitDeck(`${COVER}\n---\n\n${rest}`, FILE);

  test('a --- inside a fenced code block does not end the slide', () => {
    const slides = split('# Code\n\n```yaml\n---\nkey: value\n```\n');
    expect(slides.map((s) => s.title)).toEqual(['Cover', 'Code']);
  });

  test('a --- inside an HTML comment does not end the slide', () => {
    const slides = split('# Noted\n\nText\n\n<!--\nline\n---\nline\n-->\n');
    expect(slides.map((s) => s.title)).toEqual(['Cover', 'Noted']);
    expect(slides[1].note).toBe('line\n---\nline');
  });

  test("a slide's trailing comment is its note, not its body", () => {
    const [, slide] = split('# Noted\n\nText\n\n<!-- say this -->\n');
    expect(slide.note).toBe('say this');
    expect(slide.body).toBe('Text');
  });

  test('a ```yaml block at the top of a slide is its settings', () => {
    const [, slide] = split("```yaml\npart: 'Part 1'\n```\n\n# Titled\n");
    expect(slide.frontmatter).toBe("part: 'Part 1'");
    expect(slide.title).toBe('Titled');
  });

  test('the opening frontmatter belongs to slide 1', () => {
    const [cover] = split('# Next\n');
    expect(cover.frontmatter).toBe('layout: cover');
  });

  const refusals: Array<[string, string, RegExp]> = [
    [
      'settings between --- lines after the first slide',
      '# One\n\n---\nlayout: section\n---\n\n# Two\n',
      /Prettier/,
    ],
    [
      'a v-click directive',
      '# Reveal\n\n<div v-click>Later</div>\n',
      /v-click/,
    ],
    ['a Vue component', '# Tweet\n\n<Tweet id="1" />\n', /Vue component/],
    ['a ::slot:: marker', '# Columns\n\nLeft\n\n::right::\n\nRight\n', /slot/],
    [
      'a comment that is not the trailing note',
      '# Hidden\n\n<!-- aside -->\n\nText\n',
      /not its trailing speaker note/,
    ],
    [
      'an earlier comment beside a trailing note',
      '# Two comments\n\n<!-- aside -->\n\nText\n\n<!-- note -->\n',
      /not its trailing speaker note/,
    ],
    ['a second heading', '# Two\n\n## Column\n', /second heading/],
    ['no # heading', 'Just text\n', /does not open with a # heading/],
    ['an import', '```yaml\nsrc: ./other.md\n```\n\n# Imported\n', /src:/],
  ];
  for (const [what, slide, message] of refusals) {
    test(`refuses ${what}, naming the file, slide and line`, () => {
      expect(() => split(slide)).toThrow(message);
      expect(() => split(slide)).toThrow(
        /^fixture\.md, slide \d+ \(line \d+\)/,
      );
    });
  }
});

test.describe('cardGroups', NODE, () => {
  const cards = (body: string) =>
    (cardGroups(body).match(/<div class="slide-card">/g) ?? []).length;
  const rows = (body: string) =>
    (cardGroups(body).match(/<div class="slide-cards">/g) ?? []).length;

  test('an example and its paragraph are one card, even alone', () => {
    const body = '- One\n- Two\n\n**A Good Model: [Rust](https://r)**\n\nText.';
    expect(cards(body)).toBe(1);
    expect(rows(body)).toBe(0);
    expect(cardGroups(body)).toMatch(/Rust[\s\S]*Text\.\n\n<\/div>$/);
  });

  test('one labelled group is not a card', () => {
    expect(cards('- Point\n\n**Reality check**\n\n- No quick fix')).toBe(0);
  });

  test('two labelled groups are two cards in one row', () => {
    const body = '**Left**\n\n- a\n\n**Right**\n\n- b';
    expect(cards(body)).toBe(2);
    expect(rows(body)).toBe(1);
  });

  test('a note after each group goes into its card', () => {
    const out = cardGroups(
      '**Now**\n\n- a\n\nCheap now.\n\n**Later**\n\n- b\n\nHeavy later.',
    );
    expect(out).toMatch(/Cheap now\.\n\n<\/div>/);
    expect(out).toMatch(/Heavy later\.\n\n<\/div>\n\n<\/div>$/);
  });

  test('a closing paragraph stays out when the first group has no note', () => {
    const out = cardGroups(
      '**Helps**\n\n- a\n\n**Strains**\n\n- b\n\nFor both.',
    );
    expect(out.endsWith('</div>\n\nFor both.')).toBe(true);
  });

  test('a body with a code fence is left alone', () => {
    const body = '**One**\n\n```\ncode\n\nmore\n```\n\n**Two**\n\n- b';
    expect(cardGroups(body)).toBe(body);
  });
});
