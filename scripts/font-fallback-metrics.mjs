/*
 * Prints the `size-adjust` and metric overrides that make a local face take
 * the web font's space: the `Lexend Fallback` faces in src/styles/global.css.
 *
 *   node scripts/font-fallback-metrics.mjs <web font> <local font> [upper]
 *
 * Reads TTF, OTF or WOFF 1. `upper` weights capitals, for uppercase headings.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

/* Letter frequency in English text, per cent (Lewand, Cryptological Mathematics, 2000); a space every 5.1 letters. */
const FREQUENCY = {
  a: 8.167,
  b: 1.492,
  c: 2.782,
  d: 4.253,
  e: 12.702,
  f: 2.228,
  g: 2.015,
  h: 6.094,
  i: 6.966,
  j: 0.153,
  k: 0.772,
  l: 4.025,
  m: 2.406,
  n: 6.749,
  o: 7.507,
  p: 1.929,
  q: 0.095,
  r: 5.987,
  s: 6.327,
  t: 9.056,
  u: 2.758,
  v: 0.978,
  w: 2.36,
  x: 0.15,
  y: 1.974,
  z: 0.074,
};
const SPACE_FREQUENCY = 19;

const WOFF_HEADER = 44;
const WOFF_ENTRY = 20;
const SFNT_HEADER = 12;
const SFNT_ENTRY = 16;

const woffTables = (file) => {
  const tables = {};
  const count = file.readUInt16BE(12);
  for (let i = 0; i < count; i++) {
    const at = WOFF_HEADER + i * WOFF_ENTRY;
    const offset = file.readUInt32BE(at + 4);
    const packed = file.readUInt32BE(at + 8);
    const length = file.readUInt32BE(at + 12);
    const data = file.subarray(offset, offset + packed);
    tables[file.toString('latin1', at, at + 4)] =
      packed < length ? inflateSync(data) : data;
  }
  return tables;
};

const sfntTables = (file) => {
  const tables = {};
  const count = file.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const at = SFNT_HEADER + i * SFNT_ENTRY;
    const offset = file.readUInt32BE(at + 8);
    tables[file.toString('latin1', at, at + 4)] = file.subarray(
      offset,
      offset + file.readUInt32BE(at + 12),
    );
  }
  return tables;
};

const tablesOf = (path) => {
  const file = readFileSync(path);
  const signature = file.toString('latin1', 0, 4);
  if (signature === 'wOF2') {
    throw new Error(`${path} is WOFF 2; pass the WOFF 1 or TTF file.`);
  }
  return signature === 'wOFF' ? woffTables(file) : sfntTables(file);
};

/* The Unicode subtable in format 4 (segments), which every font here carries. */
const glyphIdOf = (cmap) => {
  const count = cmap.readUInt16BE(2);
  for (let i = 0; i < count; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const offset = cmap.readUInt32BE(8 + i * 8);
    if ((platform !== 0 && platform !== 3) || cmap.readUInt16BE(offset) !== 4) {
      continue;
    }
    const segments = cmap.readUInt16BE(offset + 6) / 2;
    const ends = offset + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const ranges = deltas + segments * 2;
    return (code) => {
      for (let s = 0; s < segments; s++) {
        if (code > cmap.readUInt16BE(ends + s * 2)) continue;
        const start = cmap.readUInt16BE(starts + s * 2);
        if (code < start) return 0;
        const delta = cmap.readInt16BE(deltas + s * 2);
        const range = cmap.readUInt16BE(ranges + s * 2);
        if (range === 0) return (code + delta) & 0xffff;
        const glyph = cmap.readUInt16BE(
          ranges + s * 2 + range + (code - start) * 2,
        );
        return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
      }
      return 0;
    };
  }
  throw new Error('no format 4 Unicode cmap subtable.');
};

/** hhea ascent, descent and line gap in em, and each character's advance. */
export const metricsOf = (path) => {
  const { head, hhea, hmtx, cmap } = tablesOf(path);
  const unitsPerEm = head.readUInt16BE(18);
  const advances = hhea.readUInt16BE(34);
  const glyphId = glyphIdOf(cmap);
  const advanceOf = (character) => {
    const glyph = glyphId(character.codePointAt(0));
    if (glyph === 0)
      throw new Error(`${path} has no glyph for "${character}".`);
    return hmtx.readUInt16BE(Math.min(glyph, advances - 1) * 4) / unitsPerEm;
  };
  return {
    ascent: hhea.readInt16BE(4) / unitsPerEm,
    descent: Math.abs(hhea.readInt16BE(6)) / unitsPerEm,
    lineGap: hhea.readInt16BE(8) / unitsPerEm,
    advanceOf,
  };
};

/** Mean advance in em over English text, capitals when `upper`. */
const meanAdvance = ({ advanceOf }, upper) => {
  const letters = Object.entries(FREQUENCY).map(
    ([letter, frequency]) =>
      frequency * advanceOf(upper ? letter.toUpperCase() : letter),
  );
  const weight =
    SPACE_FREQUENCY + Object.values(FREQUENCY).reduce((sum, f) => sum + f, 0);
  return (
    (SPACE_FREQUENCY * advanceOf(' ') +
      letters.reduce((sum, advance) => sum + advance, 0)) /
    weight
  );
};

const percent = (ratio) => `${Number((ratio * 100).toFixed(2))}%`;

/** The four descriptors, as ratios, that fit `localPath`'s face to `webPath`'s. */
export const fallbackDescriptors = (webPath, localPath, upper = false) => {
  const web = metricsOf(webPath);
  const sizeAdjust =
    meanAdvance(web, upper) / meanAdvance(metricsOf(localPath), upper);
  return {
    sizeAdjust,
    ascentOverride: web.ascent / sizeAdjust,
    descentOverride: web.descent / sizeAdjust,
    lineGapOverride: web.lineGap / sizeAdjust,
  };
};

const main = () => {
  const [webPath, localPath, casing] = process.argv.slice(2);
  if (!webPath || !localPath) {
    console.error(
      'usage: node scripts/font-fallback-metrics.mjs <web font> <local font> [upper]',
    );
    process.exit(2);
  }
  const d = fallbackDescriptors(webPath, localPath, casing === 'upper');
  console.log(
    [
      `size-adjust: ${percent(d.sizeAdjust)};`,
      `ascent-override: ${percent(d.ascentOverride)};`,
      `descent-override: ${percent(d.descentOverride)};`,
      `line-gap-override: ${percent(d.lineGapOverride)};`,
    ].join('\n'),
  );
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
