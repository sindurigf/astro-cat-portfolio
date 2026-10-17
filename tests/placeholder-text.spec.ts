import { expect, test } from './test';
import { builtHtml } from './routes';
import { NODE } from './tags';
import { looksLorem } from './lorem';

/* Content: a page shows real words. Lorem ipsum on a public page is an unfinished sample. */

const visibleText = (html: string): string =>
  html
    .slice(html.indexOf('<body'))
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

test('no built page shows lorem ipsum', NODE, () => {
  const lorem = [...builtHtml()]
    .filter(([, html]) => looksLorem(visibleText(html)))
    .map(([route]) => route);

  expect(lorem, 'page(s) showing lorem ipsum').toEqual([]);
});
