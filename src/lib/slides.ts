/*
 * Slidev Markdown, split as slidevjs/slidev v53.0.0 packages/parser/src/core.ts
 * does; the last HTML comment is the speaker note. Unsupported syntax fails the
 * build. Dependency-free so specs can import it in plain Node.
 */

export const DECK_FILE = 'slides.md';

export interface SourceSlide {
  /** 1-based, as in `#slide-N`. */
  number: number;
  /** 1-based start line. */
  line: number;
  /** Undelimited YAML. */
  frontmatter: string | undefined;
  title: string;
  /** Without title, settings or notes. */
  body: string;
  note: string | undefined;
}

const SEPARATOR = /^---/;
const FENCE = /^\s*(`{3,})/;
const YAML_BLOCK = /^```ya?ml\n([\s\S]*?)\n```\n?/;
const TRAILING_COMMENT = /^<!--([\s\S]*?)-->\s*$/;
const ANY_COMMENT = /<!--/;
const TITLE = /^# (.+)$/;
const ANY_HEADING = /^#{1,6}\s/;

const UNSUPPORTED: ReadonlyArray<[RegExp, string]> = [
  [
    /\bv-(?:click|clicks|after|motion|mark|switch|drag)\b/,
    'uses a v-click style directive. The page shows every slide in full, so ' +
      'there is nothing to reveal; write the content without it.',
  ],
  [
    /<[A-Z][\w-]*[\s/>]/,
    'uses a Vue component. The page renders Markdown only.',
  ],
  [
    /^::[\w-]+::\s*$/m,
    'uses a ::slot:: marker. Write each column as a bold label and its ' +
      'list; a layout class can set them side by side.',
  ],
];

const deckError = (
  file: string,
  slide: number,
  line: number,
  message: string,
) => new Error(`${file}, slide ${slide} (line ${line}): ${message}`);

const outsideFences = (source: string): string => {
  let fence: string | undefined;
  return source
    .split('\n')
    .filter((line) => {
      const open = FENCE.exec(line)?.[1];
      if (fence) {
        if (line.trimStart().startsWith(fence)) fence = undefined;
        return false;
      }
      if (open) {
        fence = open;
        return false;
      }
      return true;
    })
    .join('\n');
};

interface Chunk {
  line: number;
  frontmatter: string | undefined;
  text: string;
}

/*
 * `---` frontmatter is accepted only at the top: Prettier inserts a blank line
 * after a mid-file one and Slidev loses the settings. Later slides use ```yaml.
 */
const chunks = (source: string, file: string): Chunk[] => {
  const lines = source.split(/\r?\n/);
  const found: Chunk[] = [];
  let start = 0;
  let frontmatter: string | undefined;
  let fence: string | undefined;
  let inComment = false;

  const close = (end: number) => {
    found.push({
      line: start + 1,
      frontmatter,
      text: lines.slice(start, end).join('\n'),
    });
    frontmatter = undefined;
  };

  if (lines[0] !== undefined && SEPARATOR.test(lines[0])) {
    const end = lines.indexOf('---', 1);
    if (end === -1) {
      throw deckError(file, 1, 1, 'the opening frontmatter is never closed.');
    }
    frontmatter = lines.slice(1, end).join('\n');
    start = end + 1;
  }

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      if (line.trimStart().startsWith(fence)) fence = undefined;
      continue;
    }
    if (inComment) {
      inComment = !line.includes('-->');
      continue;
    }
    const open = FENCE.exec(line)?.[1];
    if (open) {
      fence = open;
      continue;
    }
    if (
      line.includes('<!--') &&
      !line.slice(line.indexOf('<!--')).includes('-->')
    ) {
      inComment = true;
      continue;
    }
    if (!SEPARATOR.test(line)) continue;

    close(i);
    if (line.trimEnd() === '---' && lines[i + 1]?.trim()) {
      throw deckError(
        file,
        found.length + 1,
        i + 1,
        'has its settings between --- lines. Prettier breaks that form ' +
          '(it inserts a blank line and Slidev loses the settings), so write ' +
          'them in a ```yaml block at the top of the slide instead.',
      );
    }
    start = i + 1;
  }
  close(lines.length);
  return found;
};

const toSlide = (chunk: Chunk, number: number, file: string): SourceSlide => {
  const fail = (message: string) =>
    deckError(file, number, chunk.line, message);
  let text = chunk.text.trim();
  let frontmatter = chunk.frontmatter;

  const yaml = YAML_BLOCK.exec(text);
  if (yaml) {
    if (frontmatter !== undefined) {
      throw fail('has settings both in the frontmatter and a ```yaml block.');
    }
    frontmatter = yaml[1];
    text = text.slice(yaml[0].length).trim();
  }

  /* From the last `<!--`: a lazy match from the start swallows earlier ones. */
  let note: string | undefined;
  const lastOpen = text.lastIndexOf('<!--');
  const trailing = TRAILING_COMMENT.exec(text.slice(lastOpen));
  if (lastOpen !== -1 && trailing) {
    note = trailing[1].trim();
    text = text.slice(0, lastOpen).trim();
  }

  const prose = outsideFences(text);
  if (ANY_COMMENT.test(prose)) {
    throw fail(
      'has an HTML comment that is not its trailing speaker note. Only the ' +
        'last comment on a slide is a note; any other would be published in ' +
        'the page source.',
    );
  }
  for (const [pattern, message] of UNSUPPORTED) {
    if (pattern.test(prose)) throw fail(message);
  }
  if (frontmatter !== undefined && /^src\s*:/m.test(frontmatter)) {
    throw fail('imports another file with src:. Keep the deck in one file.');
  }

  const [first = '', ...rest] = text.split('\n');
  const title = TITLE.exec(first)?.[1]?.trim();
  if (!title) {
    throw fail(
      'does not open with a # heading. Every slide needs one: it is the ' +
        'heading a reader finds the slide by on the page.',
    );
  }
  const body = rest.join('\n').trim();
  if (
    outsideFences(body)
      .split('\n')
      .some((line) => ANY_HEADING.test(line))
  ) {
    throw fail(
      'has a second heading. A slide is one heading, its h2 title, and a ' +
        '## renders as an h2 as well, so it would read as a second slide. ' +
        'Use a **bold** label instead.',
    );
  }

  return { number, line: chunk.line, frontmatter, title, body, note };
};

/** Throws, naming file, slide and line, on anything it cannot render. */
export const splitDeck = (source: string, file: string): SourceSlide[] =>
  chunks(source, file)
    .filter((chunk) => chunk.text.trim() !== '' || chunk.frontmatter)
    .map((chunk, i) => toSlide(chunk, i + 1, file));

type Block = { text: string; kind: 'label' | 'model' | 'list' | 'other' };

/* Label: a paragraph of one bold run. Model: a label opening an example. */
const LABEL = /^\*\*[^\n]+\*\*$/;
const MODEL = /^\*\*(A Good Model|Example)\b/;
const LIST = /^(?:[-*+]|\d+\.)\s/;

const blockOf = (text: string): Block => ({
  text,
  kind: MODEL.test(text)
    ? 'model'
    : LABEL.test(text)
      ? 'label'
      : LIST.test(text)
        ? 'list'
        : 'other',
});

const card = (blocks: Block[]) =>
  `<div class="slide-card">\n\n${blocks.map((b) => b.text).join('\n\n')}\n\n</div>`;

/*
 * Wraps examples, and labelled groups when there are two or more, in `<div>`
 * cards; blank lines keep the Markdown inside parsed. Bodies with a code fence
 * are untouched: a blank line there is not a block boundary.
 */
export const cardGroups = (body: string): string => {
  if (/^\s*```/m.test(body)) return body;
  const blocks = body
    .split(/\n\s*\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map(blockOf);
  const grouped = blocks.filter((b) => b.kind === 'label').length >= 2;

  const units: Array<Block | Block[]> = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind === 'model') {
      const next = blocks[i + 1];
      units.push(next?.kind === 'other' ? [block, blocks[++i]] : [block]);
    } else if (block.kind === 'label' && grouped) {
      const group = [block];
      while (blocks[i + 1]?.kind === 'list') group.push(blocks[++i]);
      units.push(group);
    } else {
      units.push(block);
    }
  }

  const groups = units.filter(
    (unit): unit is Block[] => Array.isArray(unit) && unit[0].kind === 'label',
  );
  const noteAfter = (group: Block[]) => {
    const next = units[units.indexOf(group) + 1];
    return !Array.isArray(next) && next?.kind === 'other' ? next : undefined;
  };
  const firstHasNote = groups.length > 0 && noteAfter(groups[0]) !== undefined;
  groups.forEach((group, i) => {
    const note = noteAfter(group);
    if (note && (i < groups.length - 1 || firstHasNote)) {
      group.push(note);
      units.splice(units.indexOf(note), 1);
    }
  });

  const out: string[] = [];
  let row: string[] = [];
  const flush = () => {
    if (row.length > 1) {
      out.push(`<div class="slide-cards">\n\n${row.join('\n\n')}\n\n</div>`);
    } else out.push(...row);
    row = [];
  };
  for (const unit of units) {
    if (Array.isArray(unit)) row.push(card(unit));
    else {
      flush();
      out.push(unit.text);
    }
  }
  flush();
  return out.join('\n\n');
};

/** Hashed into the PDF; tests/talk-pdf.spec.ts fails when slides.md drifts. */
export const printedContent = (source: string, file: string): string =>
  JSON.stringify(
    splitDeck(source, file).map(({ frontmatter, title, body }) => [
      frontmatter ?? '',
      title,
      body,
    ]),
  );
