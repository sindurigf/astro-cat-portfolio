#!/usr/bin/env node
/*
 * Fails on image metadata that can locate or identify: EXIF (GPS, camera,
 * date) and XMP, in every JPEG, PNG and WebP under src/assets and public.
 * PDFs are not images here: PDF/UA requires their XMP.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOTS = ['src/assets', 'public'];

const JPEG_SOI = 0xffd8;
const JPEG_SOS = 0xda;
const JPEG_APP1 = 0xe1;
const JPEG_APP13 = 0xed;
const PNG_SIGNATURE_BYTES = 8;
const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

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
    const data = bytes.toString('latin1', offset + 8, offset + 8 + 30);
    if (type === 'eXIf') found.push('EXIF (eXIf)');
    if (type === 'iTXt' && data.startsWith('XML:com.adobe.xmp')) {
      found.push('XMP (iTXt)');
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

const READERS = {
  '.jpg': jpegProblems,
  '.jpeg': jpegProblems,
  '.png': pngProblems,
  '.webp': webpProblems,
};

let checked = 0;
const failures = [];
for (const file of ROOTS.flatMap(files)) {
  const read = READERS[extname(file).toLowerCase()];
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
