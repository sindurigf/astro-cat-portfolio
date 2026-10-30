#!/usr/bin/env node
/*
 * Mirrors discussion between GitHub issues and their Discourse topics, which
 * .github/workflows/issue-to-discourse.yml opens (docs/DEPLOYMENT.md).
 *
 *   node scripts/discourse-sync.mjs to-forum    (one new issue comment, from GITHUB_EVENT_PATH)
 *   node scripts/discourse-sync.mjs to-github   (forum replies in recently active topics)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* Must match the comment issue-to-discourse.yml posts. */
export const LINK_COMMENT_PREFIX =
  'Discussion for this issue is open on the forum: ';
export const BOT_LOGIN = 'github-actions[bot]';
const GITHUB_HEADER = /^\S+ wrote on GitHub:/;
const FORUM_HEADER = /^\S+ wrote on the forum:/;
const MARKER = /<!-- discourse-post:(\d+) -->/g;
const TOPIC_TITLE = /^GitHub issue #(\d+):/;
const TOPIC_URL = /\/t\/[^/\s]+\/(\d+)\b/;
/* Discourse's regular post type; moderator actions, small actions and whispers are others. */
const REGULAR_POST = 1;

const LOOKBACK_HOURS = 48;
const MS_PER_HOUR = 3_600_000;
const POSTS_PER_REQUEST = 100;
const GITHUB_PAGE_SIZE = 100;
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 2_000;
const MS_PER_S = 1_000;
const REQUEST_TIMEOUT_MS = 30_000;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY = 429;

/** Breaks `@name` so the other side does not notify a user of that name. */
export const defuseMentions = (text) =>
  text.replace(/(^|[^\w`/])@(?=[\w-])/g, '$1@​');

export const markerOf = (postId) => `<!-- discourse-post:${postId} -->`;

/** Forum post ids already mirrored into these issue comments. */
export const mirroredPostIds = (comments) =>
  new Set(
    comments.flatMap(({ body }) =>
      [...(body ?? '').matchAll(MARKER)].map((match) => Number(match[1])),
    ),
  );

export const issueNumberFromTitle = (title) => {
  const match = TOPIC_TITLE.exec(title ?? '');
  return match ? Number(match[1]) : null;
};

/** The topic id from the bot's link comment; null without one, so only topics the workflow opened sync. */
export const topicIdFromComments = (comments) => {
  const link = comments.find(
    ({ user, body }) =>
      user?.login === BOT_LOGIN && (body ?? '').startsWith(LINK_COMMENT_PREFIX),
  );
  const match = link && TOPIC_URL.exec(link.body);
  return match ? Number(match[1]) : null;
};

/** Whether an issue comment should go to the forum: not the bot's, not already a mirror. */
export const shouldMirrorComment = ({ user, body }) =>
  user?.login !== BOT_LOGIN &&
  user?.type !== 'Bot' &&
  !FORUM_HEADER.test(body ?? '') &&
  ![...(body ?? '').matchAll(MARKER)].length;

/** Whether a forum post should go to GitHub: a regular reply, not the API user's, not a mirror, not yet copied. */
export const shouldMirrorPost = (post, apiUsername, alreadyMirrored) =>
  post.post_number > 1 &&
  post.post_type === REGULAR_POST &&
  !post.hidden &&
  !post.deleted_at &&
  post.username !== apiUsername &&
  !GITHUB_HEADER.test(post.raw ?? '') &&
  !alreadyMirrored.has(post.id);

export const forumReplyBody = (comment) =>
  `${comment.user.login} wrote on GitHub:\n\n${defuseMentions(comment.body ?? '')}\n\n${comment.html_url}`;

export const githubCommentBody = (post, postUrl) =>
  `${post.username} wrote on the forum:\n\n${defuseMentions(post.raw ?? '')}\n\n${postUrl}\n${markerOf(post.id)}`;

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}.`);
  return value;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Retries 429 with Retry-After or exponential backoff; a 403 names the API key scope it needs. */
const request = async (url, init, scopeHint) => {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === HTTP_TOO_MANY && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * MS_PER_S
          : BACKOFF_BASE_MS * 2 ** (attempt - 1),
      );
      continue;
    }
    if (response.ok) return response;
    const text = await response.text();
    const hint =
      response.status === HTTP_FORBIDDEN && scopeHint
        ? ` The API key needs the "${scopeHint}" scope.`
        : '';
    throw Object.assign(
      new Error(
        `${init?.method ?? 'GET'} ${url} answered ${response.status}.${hint} ${text.slice(0, 500)}`,
      ),
      { status: response.status },
    );
  }
};

const forum = () => {
  const base = required('DISCOURSE_URL').replace(/\/$/, '');
  const headers = {
    'Api-Key': required('DISCOURSE_API_KEY'),
    'Api-Username': required('DISCOURSE_API_USERNAME'),
    'Content-Type': 'application/json',
  };
  const get = async (path, scope) =>
    (await request(`${base}${path}`, { headers }, scope)).json();
  const post = async (path, body, scope) =>
    (
      await request(
        `${base}${path}`,
        { method: 'POST', headers, body: JSON.stringify(body) },
        scope,
      )
    ).json();
  return { base, get, post };
};

const github = () => {
  const api = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const repo = required('GITHUB_REPOSITORY');
  const headers = {
    Authorization: `Bearer ${required('GITHUB_TOKEN')}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const comments = async (issue) => {
    const all = [];
    let url = `${api}/repos/${repo}/issues/${issue}/comments?per_page=${GITHUB_PAGE_SIZE}`;
    while (url) {
      const response = await request(url, { headers });
      all.push(...(await response.json()));
      url = /<([^>]+)>;\s*rel="next"/.exec(
        response.headers.get('link') ?? '',
      )?.[1];
    }
    return all;
  };
  const issue = async (number) =>
    (
      await request(`${api}/repos/${repo}/issues/${number}`, { headers })
    ).json();
  const comment = (number, body) =>
    request(`${api}/repos/${repo}/issues/${number}/comments`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
  return { comments, issue, comment };
};

const toForum = async () => {
  const event = JSON.parse(readFileSync(required('GITHUB_EVENT_PATH'), 'utf8'));
  const { comment, issue } = event;
  if (!comment || !issue) throw new Error('Expected an issue_comment event.');
  if (issue.pull_request)
    return console.log('A pull request comment; nothing to mirror.');
  if (!shouldMirrorComment(comment))
    return console.log('A bot comment or a mirror; skipped.');
  const topicId = topicIdFromComments(await github().comments(issue.number));
  if (!topicId)
    return console.log(`Issue #${issue.number} has no forum topic; skipped.`);
  const { post } = forum();
  const created = await post(
    '/posts.json',
    { topic_id: topicId, raw: forumReplyBody(comment) },
    'topics: write',
  );
  if (!created?.id)
    throw new Error(
      `Discourse answered without a post id: ${JSON.stringify(created)}`,
    );
  console.log(
    `Comment ${comment.id} posted as forum post ${created.id} in topic ${topicId}.`,
  );
};

const recentTopics = async (get, categoryId, cutoff) => {
  const topics = [];
  for (let page = 0; ; page += 1) {
    const list = await get(
      `/c/${categoryId}/l/latest.json?page=${page}`,
      'topics: read lists',
    );
    const batch = list.topic_list?.topics ?? [];
    const recent = batch.filter(
      (topic) => Date.parse(topic.bumped_at) >= cutoff,
    );
    topics.push(...recent);
    if (recent.length < batch.length || !list.topic_list?.more_topics_url)
      return topics;
  }
};

const topicPosts = async (get, topicId) => {
  const topic = await get(`/t/${topicId}.json`, 'topics: read');
  const ids = topic.post_stream?.stream ?? [];
  const posts = [];
  for (let start = 0; start < ids.length; start += POSTS_PER_REQUEST) {
    const query = ids
      .slice(start, start + POSTS_PER_REQUEST)
      .map((id) => `post_ids[]=${id}`)
      .join('&');
    const page = await get(
      `/t/${topicId}/posts.json?include_raw=true&${query}`,
      'topics: read',
    );
    posts.push(...(page.post_stream?.posts ?? []));
  }
  return { topic, posts };
};

const toGithub = async () => {
  const categoryId = Number(required('DISCOURSE_CATEGORY_ID'));
  const apiUsername = required('DISCOURSE_API_USERNAME');
  const { base, get } = forum();
  const gh = github();
  const cutoff = Date.now() - LOOKBACK_HOURS * MS_PER_HOUR;
  let copied = 0;
  for (const listed of await recentTopics(get, categoryId, cutoff)) {
    const number = issueNumberFromTitle(listed.title);
    if (!number || listed.category_id !== categoryId) continue;
    /* A topic whose issue was deleted or transferred has nothing to sync to. */
    const issue = await gh.issue(number).catch((error) => {
      if (error.status === HTTP_NOT_FOUND) return null;
      throw error;
    });
    if (!issue || issue.pull_request) continue;
    const comments = await gh.comments(number);
    if (topicIdFromComments(comments) !== listed.id) continue;
    const done = mirroredPostIds(comments);
    const { topic, posts } = await topicPosts(get, listed.id);
    for (const post of posts.sort((a, b) => a.post_number - b.post_number)) {
      if (!shouldMirrorPost(post, apiUsername, done)) continue;
      const url = `${base}/t/${topic.slug}/${topic.id}/${post.post_number}`;
      await gh.comment(number, githubCommentBody(post, url));
      copied += 1;
    }
  }
  console.log(
    `Copied ${copied} forum ${copied === 1 ? 'reply' : 'replies'} to GitHub.`,
  );
};

const main = async () => {
  const mode = process.argv[2];
  if (mode === 'to-forum') return toForum();
  if (mode === 'to-github') return toGithub();
  throw new Error('Usage: discourse-sync.mjs to-forum | to-github');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
