import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { builtPages, DIST_DIR, ROUTES } from './routes';
import { GLOBAL_CSS, cssColorToken, pngSize } from './source';
import { NODE } from './tags';

/**
 * The favicon set and the web app manifest. Every declared `sizes` must be
 * true of the bytes: `convert` writes a one-frame .ico without complaint.
 */

const MANIFEST_ROUTE = '/site.webmanifest';

interface Size {
  width: number;
  height: number;
}

const asText = (size: Size): string => `${size.width}x${size.height}`;

const pngFileSize = (file: string): Size => {
  const size = pngSize(readFileSync(file));
  expect(size, `${file} does not start with a PNG signature.`).not.toBeNull();
  return size!;
};

/**
 * Every frame in an ICO. ICONDIR: reserved 0, type 1, LE count; each 16-byte
 * ICONDIRENTRY opens with one-byte width and height, where 0 means 256.
 */
const icoSizes = (file: string): Size[] => {
  const buffer = readFileSync(file);

  expect(
    buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1,
    `${file} is not an ICO (header is not reserved=0, type=1).`,
  ).toBe(true);

  const count = buffer.readUInt16LE(4);
  const ENTRY = 16;
  const FIRST = 6;

  return Array.from({ length: count }, (_, index) => {
    const at = FIRST + index * ENTRY;
    return {
      width: buffer[at] === 0 ? 256 : buffer[at]!,
      height: buffer[at + 1] === 0 ? 256 : buffer[at + 1]!,
    };
  });
};

/** Every `sizes="…"` token, as {width, height}. `any` is dropped. */
const declaredSizes = (attribute: string): Size[] =>
  attribute
    .split(/\s+/)
    .filter((token) => token && token.toLowerCase() !== 'any')
    .map((token) => {
      const [width, height] = token.toLowerCase().split('x');
      return { width: Number(width), height: Number(height) };
    });

interface IconLink {
  rel: string;
  href: string;
  sizes: string | null;
}

/** Every <link> whose rel mentions an icon, plus the manifest link. */
const iconLinks = (html: string): IconLink[] => {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];

  return links
    .map((tag) => ({
      rel: /\srel=["']([^"']*)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '',
      href: /\shref=["']([^"']*)["']/i.exec(tag)?.[1] ?? '',
      sizes: /\ssizes=["']([^"']*)["']/i.exec(tag)?.[1] ?? null,
    }))
    .filter((link) => /\bicon\b/.test(link.rel) || link.rel === 'manifest');
};

const distFile = (href: string): string =>
  join(DIST_DIR, href.replace(/^\//, ''));

const homeHtml = (): string => {
  const home = builtPages().find((page) => page.route === '/');
  expect(home, '/ was not found in the build').toBeTruthy();
  return readFileSync(home!.file, 'utf8');
};

const manifest = (): Record<string, unknown> => {
  const file = distFile(MANIFEST_ROUTE);

  expect(
    existsSync(file),
    `${MANIFEST_ROUTE} was not built by src/pages/site.webmanifest.ts.`,
  ).toBe(true);

  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
};

test.describe('the favicon set', NODE, () => {
  test('every icon the head links is in the build', () => {
    const links = iconLinks(homeHtml());

    expect(
      links.length,
      'The head links no icons; BaseLayout.astro should carry them.',
    ).toBeGreaterThan(0);

    for (const link of links) {
      expect(
        existsSync(distFile(link.href)),
        `The head links ${link.href} (rel="${link.rel}"), which was not built.`,
      ).toBe(true);
    }
  });

  test('every declared size is true of the file', () => {
    let rasters = 0;
    for (const link of iconLinks(homeHtml())) {
      if (!link.sizes || link.rel === 'manifest') continue;

      const file = distFile(link.href);
      const wanted = declaredSizes(link.sizes);

      if (file.endsWith('.svg')) continue; /* vector: any size is honest */

      const present = file.endsWith('.ico')
        ? icoSizes(file)
        : [pngFileSize(file)];
      rasters += 1;

      for (const size of wanted) {
        expect(
          present.some(
            (actual) =>
              actual.width === size.width && actual.height === size.height,
          ),
          `${link.href} declares sizes="${link.sizes}" but holds only ${present.map(asText).join(', ')}.`,
        ).toBe(true);
      }
    }
    expect(rasters, 'no raster icon declares its sizes').toBeGreaterThan(0);
  });

  test('favicon.ico carries every size it declares', () => {
    const sizes = icoSizes(distFile('/favicon.ico')).map(asText);

    for (const wanted of ['16x16', '32x32', '48x48']) {
      expect(
        sizes,
        `favicon.ico holds ${sizes.join(', ')}, not 16, 32 and 48.`,
      ).toContain(wanted);
    }
  });
});

test.describe('the web app manifest', NODE, () => {
  test('tints the installed app with the background token', () => {
    const parsed = manifest();

    for (const key of ['theme_color', 'background_color']) {
      expect(
        String(parsed[key]).toLowerCase(),
        `The manifest's ${key} is not --color-background from ${GLOBAL_CSS}.`,
      ).toBe(cssColorToken('--color-background'));
    }
  });

  test('every icon it names is in the build, at the size it claims', () => {
    const icons = manifest().icons as {
      src: string;
      sizes: string;
      purpose?: string;
    }[];

    expect(icons?.length, 'The manifest declares no icons.').toBeGreaterThan(0);

    for (const icon of icons) {
      const file = distFile(icon.src);

      expect(
        existsSync(file),
        `The manifest names ${icon.src} and the build has no such file.`,
      ).toBe(true);

      expect(
        asText(pngFileSize(file)),
        `The manifest declares ${icon.src} as ${icon.sizes}, which it is not.`,
      ).toBe(icon.sizes);
    }
  });

  test('iOS labels the home screen icon with its short_name', () => {
    const tag =
      /<meta\b[^>]*\bname=["']apple-mobile-web-app-title["'][^>]*>/i.exec(
        homeHtml(),
      )?.[0];
    expect(tag, 'The head has no apple-mobile-web-app-title.').toBeTruthy();

    expect(
      /\scontent=["']([^"']*)["']/i.exec(tag!)?.[1],
      'apple-mobile-web-app-title differs from the manifest short_name.',
    ).toBe(manifest().short_name);
  });

  test('declares exactly one maskable icon', () => {
    // Maskable art is padded to the 80% safe zone: too small where unmasked.
    const icons = manifest().icons as { purpose?: string }[];
    const maskable = icons.filter((icon) =>
      (icon.purpose ?? '').split(/\s+/).includes('maskable'),
    );

    expect(
      maskable.length,
      'The manifest should declare exactly one maskable icon.',
    ).toBe(1);

    for (const icon of icons) {
      const purposes = (icon.purpose ?? 'any').split(/\s+/);
      expect(
        purposes.includes('maskable') && purposes.includes('any'),
        'An icon is declared both `any` and `maskable`.',
      ).toBe(false);
    }
  });

  // `expect.soft` names every failing route in one run.
  test('every route links the manifest', () => {
    const built = builtPages();

    for (const route of ROUTES) {
      const page = built.find((entry) => entry.route === route);
      expect(page, `${route} was not found in the build`).toBeTruthy();

      const links = iconLinks(readFileSync(page!.file, 'utf8'));

      expect
        .soft(
          links.some(
            (link) => link.rel === 'manifest' && link.href === MANIFEST_ROUTE,
          ),
          `${route} has no <link rel="manifest"> from BaseLayout.`,
        )
        .toBe(true);
    }
  });
});
