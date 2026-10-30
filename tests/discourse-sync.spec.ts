import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import {
  BOT_LOGIN,
  LINK_COMMENT_PREFIX,
  defuseMentions,
  forumReplyBody,
  githubCommentBody,
  issueNumberFromTitle,
  mirroredPostIds,
  shouldMirrorComment,
  shouldMirrorPost,
  splitByActivity,
  topicIdFromComments,
} from '../scripts/discourse-sync.mjs';
import { NODE } from './tags';

/* Function: the issue and forum mirror never loops, never posts twice and never pings anyone. */
const API_USER = 'forum-bot';
const reply = {
  id: 501,
  post_number: 2,
  post_type: 1,
  username: 'robin',
  raw: 'Seen it too.',
};
const human = {
  id: 9,
  user: { login: 'robin', type: 'User' },
  body: 'Same here, @nami.',
  html_url: 'https://github.com/o/r/issues/3#issuecomment-9',
};
const linkComment = {
  user: { login: BOT_LOGIN, type: 'Bot' },
  body: `${LINK_COMMENT_PREFIX}https://forum.example/t/github-issue-3-crash/42`,
};

test(
  'the link comment text in issue-to-discourse.yml matches the script',
  NODE,
  () => {
    const workflow = readFileSync(
      '.github/workflows/issue-to-discourse.yml',
      'utf8',
    );
    expect(
      workflow,
      'issue-to-discourse.yml no longer posts the text discourse-sync.mjs looks for',
    ).toContain(LINK_COMMENT_PREFIX);
  },
);

test('the topic id comes only from the bot link comment', NODE, () => {
  expect(topicIdFromComments([human, linkComment])).toBe(42);
  expect(
    topicIdFromComments([{ ...linkComment, user: { login: 'robin' } }]),
    'a person quoting the link text must not bind a topic',
  ).toBeNull();
  expect(topicIdFromComments([human])).toBeNull();
});

test('a topic title names its issue number', NODE, () => {
  expect(
    issueNumberFromTitle('GitHub issue #322: Test: issue to Discourse'),
  ).toBe(322);
  expect(issueNumberFromTitle('Re: GitHub issue #322: x')).toBeNull();
  expect(issueNumberFromTitle(undefined)).toBeNull();
});

test(
  'a comment from a person goes to the forum, a bot or mirrored one does not',
  NODE,
  () => {
    expect(shouldMirrorComment(human)).toBe(true);
    expect(shouldMirrorComment(linkComment)).toBe(false);
    expect(
      shouldMirrorComment({
        ...human,
        user: { login: 'dependabot[bot]', type: 'Bot' },
      }),
    ).toBe(false);
    expect(
      shouldMirrorComment({
        ...human,
        body: githubCommentBody(reply, 'https://forum.example/t/x/42/2'),
      }),
      'a mirrored forum reply must not go back to the forum',
    ).toBe(false);
  },
);

test(
  'a forum reply goes to GitHub once, never the first post, the API user or a mirror',
  NODE,
  () => {
    const none = new Set<number>();
    expect(shouldMirrorPost(reply, API_USER, none)).toBe(true);
    expect(shouldMirrorPost({ ...reply, post_number: 1 }, API_USER, none)).toBe(
      false,
    );
    expect(
      shouldMirrorPost({ ...reply, username: API_USER }, API_USER, none),
    ).toBe(false);
    expect(shouldMirrorPost({ ...reply, post_type: 3 }, API_USER, none)).toBe(
      false,
    );
    expect(shouldMirrorPost({ ...reply, hidden: true }, API_USER, none)).toBe(
      false,
    );
    expect(
      shouldMirrorPost(
        { ...reply, raw: forumReplyBody(human) },
        API_USER,
        none,
      ),
      'a mirrored GitHub comment must not come back',
    ).toBe(false);
    const done = mirroredPostIds([
      {
        user: { login: BOT_LOGIN },
        body: githubCommentBody(reply, 'https://forum.example/t/x/42/2'),
      },
    ]);
    expect(shouldMirrorPost(reply, API_USER, done)).toBe(false);
  },
);

test(
  'mirrored text names the author without an @ and defuses mentions',
  NODE,
  () => {
    const toForum = forumReplyBody(human);
    expect(toForum.startsWith('robin wrote on GitHub:')).toBe(true);
    expect(toForum).not.toMatch(/(^|[^\w`/])@[\w-]/);
    const toGithub = githubCommentBody(
      { ...reply, raw: '@luffy look' },
      'https://forum.example/t/x/42/2',
    );
    expect(toGithub.startsWith('robin wrote on the forum:')).toBe(true);
    expect(toGithub).not.toMatch(/(^|[^\w`/])@[\w-]/);
    expect(defuseMentions('mail me at a@b.example')).toBe(
      'mail me at a@b.example',
    );
  },
);

test('only the bot can mark a forum post as mirrored', NODE, () => {
  const forged = mirroredPostIds([
    { user: { login: 'mallory' }, body: '<!-- discourse-post:501 -->' },
  ]);
  expect(shouldMirrorPost(reply, API_USER, forged)).toBe(true);
  const copied = githubCommentBody(
    { ...reply, id: 600, raw: 'hi <!-- discourse-post:501 -->' },
    'https://forum.example/t/x/42/3',
  );
  expect(
    [...mirroredPostIds([{ user: { login: BOT_LOGIN }, body: copied }])],
    'a marker inside copied text must not count',
  ).toEqual([600]);
});

test('the API user is matched without regard to case', NODE, () => {
  expect(
    shouldMirrorPost({ ...reply, username: 'Forum-Bot' }, API_USER, new Set()),
  ).toBe(false);
});

test(
  'a comment longer than a forum post is shortened, keeping its link',
  NODE,
  () => {
    const long = forumReplyBody({ ...human, body: 'x'.repeat(70_000) });
    expect(long.length).toBeLessThanOrEqual(32_000);
    expect(long.endsWith(human.html_url)).toBe(true);
  },
);

test(
  'paging stops at the first older unpinned topic, past an old pinned one',
  NODE,
  () => {
    const cutoff = Date.parse('2026-10-29T00:00:00Z');
    const page = [
      { id: 1, pinned: true, bumped_at: '2020-01-01T00:00:00Z' },
      { id: 2, bumped_at: '2026-10-30T00:00:00Z' },
    ];
    expect(splitByActivity(page, cutoff)).toEqual({
      recent: [page[1]],
      older: false,
    });
    expect(
      splitByActivity(
        [...page, { id: 3, bumped_at: '2026-10-01T00:00:00Z' }],
        cutoff,
      ).older,
    ).toBe(true);
  },
);
