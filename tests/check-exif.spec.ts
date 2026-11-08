import { crc32 } from 'node:zlib';
import { expect, test } from './test';
import { fixture, runCheck } from './check-fixture';
import { NODE } from './tags';

const SCRIPT = 'scripts/check-exif.mjs';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const IHDR_FIELDS = { width: 1, height: 1, bitDepth: 8, grayscale: 0 };
const JPEG_SOI = [0xff, 0xd8];
const JPEG_APP1 = [0xff, 0xe1];
const JPEG_SOS = [0xff, 0xda];
const JPEG_EOI = [0xff, 0xd9];
const LENGTH_BYTES = 2;
const BOX_HEADER_BYTES = 8;
const EXIF_PAYLOAD = Buffer.from('Exif\0\0MM\0*\0\0\0\x08\0\0', 'latin1');

const pngChunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const ihdr = (): Buffer => {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(IHDR_FIELDS.width, 0);
  data.writeUInt32BE(IHDR_FIELDS.height, 4);
  data[8] = IHDR_FIELDS.bitDepth;
  data[9] = IHDR_FIELDS.grayscale;
  return pngChunk('IHDR', data);
};

const png = (...extra: Buffer[]): Buffer =>
  Buffer.concat([
    PNG_SIGNATURE,
    ihdr(),
    ...extra,
    pngChunk('IEND', Buffer.alloc(0)),
  ]);

const jpegWithExif = (): Buffer => {
  const length = Buffer.alloc(LENGTH_BYTES);
  length.writeUInt16BE(LENGTH_BYTES + EXIF_PAYLOAD.length);
  const sosLength = Buffer.alloc(LENGTH_BYTES);
  sosLength.writeUInt16BE(LENGTH_BYTES);
  return Buffer.concat([
    Buffer.from(JPEG_SOI),
    Buffer.from(JPEG_APP1),
    length,
    EXIF_PAYLOAD,
    Buffer.from(JPEG_SOS),
    sosLength,
    Buffer.from(JPEG_EOI),
  ]);
};

const box = (type: string, ...parts: Buffer[]): Buffer => {
  const body = Buffer.concat(parts);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(BOX_HEADER_BYTES + body.length);
  return Buffer.concat([size, Buffer.from(type, 'latin1'), body]);
};

const FULL_BOX_HEADER = Buffer.alloc(4);
const ITEM_ENTRY_COUNT = Buffer.from([0, 1]);
const INFE_V2 = Buffer.from([2, 0, 0, 0]);
const ITEM_ID_AND_PROTECTION = Buffer.from([0, 1, 0, 0]);

/* A minimal AVIF: ftyp plus meta/iinf listing one item of the given type. */
const avif = (itemType?: string, itemTail = ''): Buffer => {
  const items = itemType
    ? [
        box(
          'infe',
          INFE_V2,
          ITEM_ID_AND_PROTECTION,
          Buffer.from(itemType, 'latin1'),
          Buffer.from(`\0${itemTail}`, 'latin1'),
        ),
      ]
    : [];
  return Buffer.concat([
    box('ftyp', Buffer.from('avif', 'latin1')),
    box(
      'meta',
      FULL_BOX_HEADER,
      box('iinf', FULL_BOX_HEADER, ITEM_ENTRY_COUNT, ...items),
    ),
  ]);
};

/* The script reads every root and fails on a missing one. */
const CLEAN_TREE = {
  'src/assets/clean.png': png(),
  'src/content/clean.png': png(),
  'public/clean.png': png(),
  'artwork/clean.png': png(),
  'tests/fixtures/clean.png': png(),
};

test.describe('check:exif', NODE, () => {
  test('passes images that carry no metadata', () => {
    const { status, output } = runCheck(SCRIPT, fixture(CLEAN_TREE));
    expect(status, output).toBe(0);
  });

  test('fails a JPEG with an APP1 Exif segment and names the file', () => {
    const root = fixture({ ...CLEAN_TREE, 'public/photo.jpg': jpegWithExif() });
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain('public/photo.jpg: EXIF');
  });

  test('fails a PNG with an eXIf chunk and names the file', () => {
    const root = fixture({
      ...CLEAN_TREE,
      'src/assets/photo.png': png(pngChunk('eXIf', EXIF_PAYLOAD.subarray(6))),
    });
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain('src/assets/photo.png: EXIF');
  });

  for (const root of ['src/content/talks', 'tests/fixtures']) {
    test(`fails a JPEG with Exif under ${root} and names the file`, () => {
      const file = `${root}/photo.jpg`;
      const tree = fixture({ ...CLEAN_TREE, [file]: jpegWithExif() });
      const { status, output } = runCheck(SCRIPT, tree);
      expect(status, output).not.toBe(0);
      expect(output).toContain(`${file}: EXIF`);
    });
  }

  test('passes an AVIF that lists no metadata items', () => {
    const root = fixture({ ...CLEAN_TREE, 'public/clean.avif': avif() });
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).toBe(0);
  });

  test('fails an AVIF with an Exif item and names the file', () => {
    const root = fixture({ ...CLEAN_TREE, 'public/photo.avif': avif('Exif') });
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain('public/photo.avif: EXIF');
  });

  test('fails an AVIF with an XMP item and names the file', () => {
    const root = fixture({
      ...CLEAN_TREE,
      'public/photo.avif': avif('mime', 'application/rdf+xml\0'),
    });
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain('public/photo.avif: XMP');
  });

  test('fails an AVIF it cannot parse instead of skipping it', () => {
    const root = fixture({
      ...CLEAN_TREE,
      'public/broken.avif': Buffer.from('not an avif'),
    });
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain('public/broken.avif: unreadable AVIF');
  });

  test('fails an image type it has no reader for', () => {
    const root = fixture({
      ...CLEAN_TREE,
      'public/anim.gif': Buffer.from('GIF89a'),
    });
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain('public/anim.gif: no reader for .gif');
  });
});
