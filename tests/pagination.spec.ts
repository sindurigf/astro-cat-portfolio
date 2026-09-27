import { expect, test } from './test';
import {
  pageCount,
  POSTS_PER_PAGE,
  postsOnPage,
  readPostsPerPage,
} from '../src/lib/pagination';
import { indexPageHref } from '../src/lib/paths';
import { NODE } from './tags';

/* The /blog pager's arithmetic; tests/blog-pages.spec.ts renders it. */
const posts = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test('counts pages, never fewer than one', NODE, () => {
  expect(pageCount(0)).toBe(1);
  expect(pageCount(1)).toBe(1);
  expect(pageCount(POSTS_PER_PAGE)).toBe(1);
  expect(pageCount(POSTS_PER_PAGE + 1)).toBe(2);
  expect(pageCount(POSTS_PER_PAGE * 2 + 1)).toBe(3);
});

test('puts every post on exactly one page, in order', NODE, () => {
  for (const total of [
    0,
    1,
    POSTS_PER_PAGE,
    POSTS_PER_PAGE + 1,
    POSTS_PER_PAGE * 2 + 1,
  ]) {
    const all = posts(total);
    const pages = Array.from({ length: pageCount(total) }, (_, i) =>
      postsOnPage(all, i + 1),
    );
    expect(pages.flat(), `${total} posts`).toEqual(all);
    for (const page of pages)
      expect(page.length).toBeLessThanOrEqual(POSTS_PER_PAGE);
  }
  expect(postsOnPage(posts(POSTS_PER_PAGE + 1), 2)).toEqual([
    POSTS_PER_PAGE + 1,
  ]);
});

test('links page one to /blog/ and later pages under /blog/page/', NODE, () => {
  expect(indexPageHref(1)).toBe('/blog/');
  expect(indexPageHref(2)).toBe('/blog/page/2/');
});

test('takes a page size override only as a positive whole number', NODE, () => {
  expect(readPostsPerPage(undefined)).toBe(POSTS_PER_PAGE);
  expect(readPostsPerPage('')).toBe(POSTS_PER_PAGE);
  expect(readPostsPerPage('3')).toBe(3);
  for (const bad of ['0', '-1', '1.5', '1e1', ' 2', 'nine']) {
    expect(() => readPostsPerPage(bad), `accepted ${bad}`).toThrow(
      /POSTS_PER_PAGE/,
    );
  }
});
