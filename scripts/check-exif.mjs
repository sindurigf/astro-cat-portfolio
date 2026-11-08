#!/usr/bin/env node
/*
 * Fails on image metadata that can locate or identify: EXIF (GPS, camera,
 * date) and XMP, in every JPEG, PNG, WebP and AVIF under the tracked image roots.
 * An image type it cannot read fails rather than passes unchecked.
 * PDFs are not images here: PDF/UA requires their XMP.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOTS = [
  'src/assets',
  'src/content',
  'public',
  'artwork',
  'tests/fixtures',
];
/* Image types with no reader here; add a reader before committing one. */
const UNREADABLE_IMAGES = new Set([
  '.gif',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
  '.bmp',
  '.jxl',
]);

const JPEG_SOI = 0xffd8;
const JPEG_SOS = 0xda;
const JPEG_APP1 = 0xe1;
const JPEG_APP13 = 0xed;
const PNG_SIGNATURE_BYTES = 8;
const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const BOX_HEADER_BYTES = 8;
const BOX_LARGE_HEADER_BYTES = 16;
const BOX_SIZE_LARGE = 1;
const BOX_SIZE_TO_END = 0;
const FULL_BOX_BYTES = 4;
const ITEM_ENTRY_COUNT_V0_BYTES = 2;
const ITEM_ENTRY_COUNT_BYTES = 4;
const INFE_VERSION_WITH_TYPE = 2;
const INFE_VERSION_WIDE_ID = 3;
const ITEM_PROTECTION_BYTES = 2;
const ITEM_TYPE_BYTES = 4;
const XMP_CONTENT_TYPE = 'application/rdf+xml';
/* PNG text chunks; ImageMagick stores EXIF, XMP and IPTC in them as "Raw profile type <name>". */
const TEXT_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt']);
const RAW_PROFILE = /^Raw profile type (exif|xmp|iptc|8bim|app1)$/i;
/* A text chunk's keyword: at most 79 bytes, then a null. */
const KEYWORD_BYTES = 80;

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.isFile() ? [path] : [];
  });

const jpegProblems = (bytes) => {
  if (bytes.readUInt16BE(0) !== JPEG_SOI) return ['not a JPEG'];
  const found = [];
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === JPEG_SOS) break;
    const length = bytes.readUInt16BE(offset + 2);
    if (marker === JPEG_APP1) {
      const head = bytes.toString('latin1', offset + 4, offset + 4 + 29);
      found.push(head.startsWith('Exif') ? 'EXIF (APP1)' : 'XMP (APP1)');
    }
    if (marker === JPEG_APP13) found.push('IPTC (APP13)');
    offset += 2 + length;
  }
  return found;
};

const pngProblems = (bytes) => {
  const found = [];
  let offset = PNG_SIGNATURE_BYTES;
  while (offset + CHUNK_HEADER_BYTES <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const head = bytes.subarray(
      offset + CHUNK_HEADER_BYTES,
      offset + CHUNK_HEADER_BYTES + Math.min(length, KEYWORD_BYTES),
    );
    const end = head.indexOf(0);
    const keyword = head.toString('latin1', 0, end === -1 ? head.length : end);
    if (type === 'eXIf') found.push('EXIF (eXIf)');
    if (TEXT_CHUNKS.has(type) && keyword === 'XML:com.adobe.xmp') {
      found.push(`XMP (${type})`);
    }
    const raw = RAW_PROFILE.exec(keyword);
    if (TEXT_CHUNKS.has(type) && raw) {
      found.push(`${raw[1].toUpperCase()} raw profile (${type})`);
    }
    if (type === 'IEND') break;
    offset += CHUNK_HEADER_BYTES + length + 4;
  }
  return found;
};

const webpProblems = (bytes) => {
  const found = [];
  let offset = RIFF_HEADER_BYTES;
  while (offset + CHUNK_HEADER_BYTES <= bytes.length) {
    const type = bytes.toString('latin1', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    if (type === 'EXIF') found.push('EXIF');
    if (type === 'XMP ') found.push('XMP');
    offset += CHUNK_HEADER_BYTES + length + (length % 2);
  }
  return found;
};

/* ISO BMFF: yields each box in [start, end) as { type, body, bodyEnd }. */
const boxes = (bytes, start, end) => {
  const found = [];
  let offset = start;
  while (offset + BOX_HEADER_BYTES <= end) {
    let size = bytes.readUInt32BE(offset);
    let header = BOX_HEADER_BYTES;
    if (size === BOX_SIZE_LARGE) {
      if (offset + BOX_LARGE_HEADER_BYTES > end) return null;
      size = Number(bytes.readBigUInt64BE(offset + BOX_HEADER_BYTES));
      header = BOX_LARGE_HEADER_BYTES;
    } else if (size === BOX_SIZE_TO_END) {
      size = end - offset;
    }
    if (size < header || offset + size > end) return null;
    found.push({
      type: bytes.toString('latin1', offset + 4, offset + 8),
      body: offset + header,
      bodyEnd: offset + size,
    });
    offset += size;
  }
  return found;
};

const avifProblems = (bytes) => {
  const unreadable = ['unreadable AVIF structure, cannot check for metadata'];
  const top = boxes(bytes, 0, bytes.length);
  if (!top) return unreadable;
  const meta = top.find((box) => box.type === 'meta');
  if (!meta) return unreadable;
  const inMeta = boxes(bytes, meta.body + FULL_BOX_BYTES, meta.bodyEnd);
  const iinf = inMeta?.find((box) => box.type === 'iinf');
  if (!iinf) return unreadable;
  const version = bytes[iinf.body];
  const countBytes =
    version === 0 ? ITEM_ENTRY_COUNT_V0_BYTES : ITEM_ENTRY_COUNT_BYTES;
  const entries = boxes(
    bytes,
    iinf.body + FULL_BOX_BYTES + countBytes,
    iinf.bodyEnd,
  );
  if (!entries) return unreadable;
  const found = [];
  for (const entry of entries.filter((box) => box.type === 'infe')) {
    const infeVersion = bytes[entry.body];
    if (infeVersion < INFE_VERSION_WITH_TYPE) continue;
    const idBytes = infeVersion >= INFE_VERSION_WIDE_ID ? 4 : 2;
    const typeAt =
      entry.body + FULL_BOX_BYTES + idBytes + ITEM_PROTECTION_BYTES;
    const type = bytes.toString('latin1', typeAt, typeAt + ITEM_TYPE_BYTES);
    if (type === 'Exif') found.push('EXIF (Exif item)');
    if (type === 'mime') {
      const text = bytes.toString(
        'latin1',
        typeAt + ITEM_TYPE_BYTES,
        entry.bodyEnd,
      );
      if (text.includes(XMP_CONTENT_TYPE)) found.push('XMP (mime item)');
    }
  }
  return found;
};

const READERS = {
  '.avif': avifProblems,
  '.jpg': jpegProblems,
  '.jpeg': jpegProblems,
  '.png': pngProblems,
  '.webp': webpProblems,
};

let checked = 0;
const failures = [];
for (const file of ROOTS.flatMap(files)) {
  const extension = extname(file).toLowerCase();
  if (UNREADABLE_IMAGES.has(extension)) {
    failures.push(`${file}: no reader for ${extension} images`);
    continue;
  }
  const read = READERS[extension];
  if (!read) continue;
  checked += 1;
  for (const problem of read(readFileSync(file))) {
    failures.push(`${file}: ${problem}`);
  }
}

if (failures.length > 0) {
  console.error(
    `Image metadata that must be stripped:\n  ${failures.join('\n  ')}\n` +
      'Strip it, e.g. `convert <file> -strip <file>`.',
  );
  process.exit(1);
}

console.log(`EXIF: ${checked} images carry no EXIF, XMP or IPTC.`);
