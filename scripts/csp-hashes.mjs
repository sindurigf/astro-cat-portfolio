/*
 * The CSP hashes the build needs: one sha256 per distinct inline <script> and
 * <style> body in dist/client. Shared by scripts/check-csp.mjs and
 * tests/headers-rules.spec.ts; scripts/check-live.sh reads DATA_SCRIPT_TYPES.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Types `script-src` does not gate, per the HTML "prepare the script element"
 * steps. Not every non-JS type: `importmap` and `speculationrules` are gated.
 */
export const DATA_SCRIPT_TYPES = ['application/ld+json', 'application/json'];

const isDataBlock = (attributes) => {
  const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
  return type !== undefined && DATA_SCRIPT_TYPES.includes(type.toLowerCase());
};

/** sha256-base64 of a string, in the form a CSP source expression takes. */
export const cspHash = (body) =>
  `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;

const htmlFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });

/** Every distinct inline <script> and <style> body across the build. */
export const inlineBlocks = (distDir) => {
  const scripts = new Set();
  const styles = new Set();
  for (const file of htmlFiles(distDir)) {
    const html = readFileSync(file, 'utf8');
    for (const [, attributes = '', body = ''] of html.matchAll(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/g,
    )) {
      if (/\bsrc\s*=/.test(attributes) || isDataBlock(attributes)) continue;
      scripts.add(body);
    }
    for (const [, body = ''] of html.matchAll(
      /<style\b[^>]*>([\s\S]*?)<\/style>/g,
    ))
      styles.add(body);
  }
  return { scripts, styles };
};

/** The sorted hashes a directive needs for `bodies`. */
export const hashesFor = (bodies) => [...bodies].map(cspHash).sort();
