import { SITEMAP_PATH } from './paths';

/*
 * public/_headers as a NOINDEX build serves it: noindex on every response, no
 * sitemap advertised. Throws rather than ship a copy that misses either.
 */

const GLOBAL_RULE = '/*';
const NOINDEX_LINE = '  X-Robots-Tag: noindex';
const SITEMAP_ENTRY = `<${SITEMAP_PATH}>; rel="sitemap"; type="application/xml"`;
const LINK_LINE = /^(\s+Link:\s*)(.*)$/;

const fail = (why: string): never => {
  throw new Error(
    `public/_headers: ${why} The NOINDEX build cannot rewrite it.`,
  );
};

const withoutSitemapEntry = (line: string): string => {
  const [, name = '', value = ''] = LINK_LINE.exec(line) ?? [];
  const entries = value.split(/,\s*/);
  if (!entries.includes(SITEMAP_ENTRY)) {
    fail(`the "${GLOBAL_RULE}" Link header no longer lists ${SITEMAP_ENTRY}.`);
  }
  const kept = entries.filter((entry) => entry !== SITEMAP_ENTRY);
  return kept.length === 0 ? '' : `${name}${kept.join(', ')}`;
};

export const noindexHeaders = (source: string): string => {
  const lines = source.split('\n');
  const start = lines.indexOf(GLOBAL_RULE);
  if (start === -1) fail(`no "${GLOBAL_RULE}" rule.`);

  /* The rule's headers run until the next unindented line. */
  const end = lines.findIndex(
    (line, index) => index > start && line !== '' && !/^\s/.test(line),
  );
  const rule = lines.slice(start + 1, end === -1 ? lines.length : end);
  if (rule.some((line) => /^\s+X-Robots-Tag:/i.test(line))) {
    fail(`the "${GLOBAL_RULE}" rule already sets X-Robots-Tag.`);
  }
  if (!rule.some((line) => LINK_LINE.test(line))) {
    fail(`the "${GLOBAL_RULE}" rule has no Link header.`);
  }

  const rewritten = rule
    .map((line) => (LINK_LINE.test(line) ? withoutSitemapEntry(line) : line))
    .filter((line, index) => line !== '' || rule[index] === '');

  return [
    ...lines.slice(0, start + 1),
    NOINDEX_LINE,
    ...rewritten,
    ...(end === -1 ? [] : lines.slice(end)),
  ].join('\n');
};
