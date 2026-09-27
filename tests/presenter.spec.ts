import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { DECK_FILE } from '../src/lib/slides';
import { NODE } from './tags';

test("the presenter view reads each deck's DECK_FILE", NODE, () => {
  const presenter = readFileSync('src/presenter/presenter.astro', 'utf8');
  const glob = /import\.meta\.glob<string>\(\s*'([^']+)'/.exec(presenter)?.[1];
  expect(
    glob,
    "presenter.astro's notes glob does not end in DECK_FILE, so the presenter view finds no notes.",
  ).toMatch(new RegExp(`/${DECK_FILE.replace('.', '\\.')}$`));
});
