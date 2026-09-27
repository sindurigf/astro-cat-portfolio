/*
 * Hashes every file git would commit, not a hand-kept input list that could
 * miss one, plus the installed lockfile, `.env` files, Node version and
 * COVERAGE. Checks reading dist/ refuse a stale build.
 */
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
} from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/* Beside dist/client and dist/server, so it is neither served nor deployed. */
const STAMP = join(ROOT, 'dist', '.build-fingerprint');
const INSTALLED = 'node_modules/.package-lock.json';
const ENV_FILE = /^\.env(\..+)?$/;
const ENV_VARIABLES = ['COVERAGE'];

const gitFiles = () =>
  execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);

const envFiles = () => readdirSync(ROOT).filter((name) => ENV_FILE.test(name));

/* Unstaged deletions hash as missing; symlinks as their target, like git. */
const hashFile = (hash, path) => {
  hash.update(`${path}\0`);
  const stat = lstatSync(join(ROOT, path), { throwIfNoEntry: false });
  if (stat === undefined) hash.update('missing\0');
  else if (stat.isSymbolicLink()) {
    hash.update(`link:${readlinkSync(join(ROOT, path))}\0`);
  } else hash.update(readFileSync(join(ROOT, path))).update('\0');
};

export const fingerprint = () => {
  const files = [...new Set([...gitFiles(), INSTALLED, ...envFiles()])].sort();
  const hash = createHash('sha256');
  for (const file of files) hashFile(hash, file);
  for (const name of ENV_VARIABLES) {
    hash.update(`${name}=${process.env[name] ?? ''}\0`);
  }
  hash.update(`node=${process.version}\0`);
  return hash.digest('hex');
};

/*
 * Taken at build start so an edit during the build reads as stale. Skipped in
 * Workers Builds (WORKERS_CI=1), whose image does not document git.
 */
export const recordFingerprint = () => {
  let taken = null;
  return {
    name: 'build-fingerprint',
    hooks: {
      'astro:config:setup': ({ command }) => {
        if (command === 'build' && process.env.WORKERS_CI !== '1') {
          taken = fingerprint();
        }
      },
      'astro:build:done': async () => {
        if (taken !== null) await writeFile(STAMP, taken);
      },
    },
  };
};

export const assertBuildCurrent = async (label) => {
  const recorded = existsSync(STAMP) ? await readFile(STAMP, 'utf8') : null;
  if (recorded === fingerprint()) return;
  console.error(
    recorded === null
      ? `${label}: dist/ has no build fingerprint, run npm run build.`
      : `${label}: dist/ was built from other files or settings than these, run npm run build.`,
  );
  process.exit(1);
};
