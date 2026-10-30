import { readFileSync, readdirSync } from 'node:fs';
import { load } from 'js-yaml';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from './test';
import {
  BOT_LOGIN,
  LINK_COMMENT_PREFIX,
  defuseMentions,
  forumReplyBody,
  githubCommentBody,
  PR_LINK_COMMENT_PREFIX,
  pullRequestTopic,
  shouldOpenTopic,
  acceptDecision,
  stateSteps,
  topicStateChange,
  topicTarget,
  mirroredPostIds,
  request,
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

test('a topic title names its issue or pull request number', NODE, () => {
  expect(topicTarget('GitHub issue #322: Test: issue to Discourse')).toEqual({
    number: 322,
    pullRequest: false,
  });
  expect(topicTarget('GitHub pull request #12: Fix the menu')).toEqual({
    number: 12,
    pullRequest: true,
  });
  expect(topicTarget('Re: GitHub issue #322: x')).toBeNull();
  expect(topicTarget(undefined)).toBeNull();
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

/* Security: fetch would send the Api-Key header to any host a redirect names. */
const serve = (
  handler: (url: string) => { status: number; location?: string },
): Promise<{ server: Server; origin: string; hits: string[] }> =>
  new Promise((resolve) => {
    const hits: string[] = [];
    const server = createServer((req, res) => {
      hits.push(req.url ?? '');
      const { status, location } = handler(req.url ?? '');
      res.writeHead(status, {
        'content-type': 'application/json',
        ...(location ? { location } : {}),
      });
      res.end('{"ok":true}');
    });
    server.listen(0, '127.0.0.1', () =>
      resolve({
        server,
        origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        hits,
      }),
    );
  });

test('a same-origin GET redirect is followed', NODE, async () => {
  const forum = await serve((url) =>
    url === '/c/54/l/latest.json'
      ? { status: 301, location: '/c/github/54/l/latest.json' }
      : { status: 200 },
  );
  try {
    const response = await request(`${forum.origin}/c/54/l/latest.json`, {});
    expect(await response.json()).toEqual({ ok: true });
    expect(forum.hits).toEqual([
      '/c/54/l/latest.json',
      '/c/github/54/l/latest.json',
    ]);
  } finally {
    forum.server.close();
  }
});

test(
  'a redirect to another host is refused before any request reaches it',
  NODE,
  async () => {
    const other = await serve(() => ({ status: 200 }));
    const forum = await serve(() => ({
      status: 302,
      location: `${other.origin}/steal`,
    }));
    try {
      await expect(
        request(`${forum.origin}/t/1.json`, {
          headers: { 'Api-Key': 'secret' },
        }),
      ).rejects.toThrow(/redirected off/);
      expect(other.hits, 'the other host must not see the key').toEqual([]);
    } finally {
      forum.server.close();
      other.server.close();
    }
  },
);

test('a redirect loop stops after a few hops', NODE, async () => {
  const forum = await serve(() => ({ status: 301, location: '/again' }));
  try {
    await expect(request(`${forum.origin}/again`, {})).rejects.toThrow(
      /more than 3 times/,
    );
    expect(forum.hits.length).toBeLessThanOrEqual(4);
  } finally {
    forum.server.close();
  }
});

test('a POST is never redirected', NODE, async () => {
  const forum = await serve(() => ({ status: 301, location: '/elsewhere' }));
  try {
    await expect(
      request(`${forum.origin}/posts.json`, { method: 'POST', body: '{}' }),
    ).rejects.toThrow(/not followed/);
    expect(forum.hits).toEqual(['/posts.json']);
  } finally {
    forum.server.close();
  }
});

test(
  'a pull request topic links back through its own link comment',
  NODE,
  () => {
    expect(
      topicIdFromComments([
        {
          user: { login: BOT_LOGIN },
          body: `${PR_LINK_COMMENT_PREFIX}https://forum.example/t/github-pull-request-12-fix/77`,
        },
      ]),
    ).toBe(77);
  },
);

test('a draft or bot pull request opens no topic', NODE, () => {
  const ready = { draft: false, user: { login: 'robin', type: 'User' } };
  expect(shouldOpenTopic(ready)).toBe(true);
  expect(shouldOpenTopic({ ...ready, draft: true })).toBe(false);
  expect(
    shouldOpenTopic({
      ...ready,
      user: { login: 'dependabot[bot]', type: 'Bot' },
    }),
  ).toBe(false);
  expect(
    shouldOpenTopic({
      ...ready,
      user: { login: 'renovate[bot]', type: 'Bot' },
    }),
  ).toBe(false);
});

test(
  'a pull request topic fits Discourse limits and pings no one',
  NODE,
  () => {
    const topic = pullRequestTopic({
      number: 12,
      title: 'x'.repeat(400),
      body: '@luffy please review',
      html_url: 'https://github.com/o/r/pull/12',
      user: { login: 'robin' },
    });
    expect(topic.title.startsWith('GitHub pull request #12: ')).toBe(true);
    expect(Array.from(topic.title).length).toBeLessThanOrEqual(255);
    const emoji = pullRequestTopic({
      number: 12,
      title: '🐈'.repeat(300),
      body: '',
      html_url: 'u',
      user: { login: 'r' },
    }).title;
    expect(emoji, 'a cut must not leave half an emoji').not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/,
    );
    expect(topic.raw).toContain('https://github.com/o/r/pull/12');
    expect(topic.raw).not.toMatch(/(^|[^\w`/])@[\w-]/);
    expect(
      pullRequestTopic({
        number: 1,
        title: 't',
        body: null,
        html_url: 'u',
        user: { login: 'r' },
      }).raw,
    ).toContain('_No description provided._');
  },
);

const closedIssue = (stateReason: string | null) => ({
  action: 'closed',
  sender: { login: 'robin' },
  issue: {
    number: 3,
    html_url: 'https://github.com/o/r/issues/3',
    state_reason: stateReason,
  },
});

test(
  'a completed issue closes its topic with the reply as the solution',
  NODE,
  () => {
    const change = topicStateChange(closedIssue('completed'));
    expect(change).toMatchObject({ solve: true, close: true });
    expect(
      change?.reply.startsWith('Closed on GitHub as completed by robin.'),
    ).toBe(true);
    expect(change?.reply).toContain('https://github.com/o/r/issues/3');
  },
);

test(
  'an issue closed as not planned closes its topic without a solution',
  NODE,
  () => {
    const change = topicStateChange(closedIssue('not_planned'));
    expect(change).toMatchObject({ solve: false, close: true });
    expect(
      change?.reply.startsWith('Closed on GitHub as not planned by robin.'),
    ).toBe(true);
    expect(
      topicStateChange(closedIssue(null))?.reply.startsWith(
        'Closed on GitHub by robin.',
      ),
    ).toBe(true);
  },
);

test(
  'a merged pull request solves and closes its topic, an unmerged one only closes',
  NODE,
  () => {
    const pr = (merged: boolean) => ({
      action: 'closed',
      sender: { login: 'robin' },
      pull_request: {
        number: 12,
        merged,
        merged_by: merged ? { login: 'nami' } : null,
        html_url: 'https://github.com/o/r/pull/12',
      },
    });
    const merged = topicStateChange(pr(true));
    expect(merged).toMatchObject({ solve: true, close: true });
    expect(merged?.reply.startsWith('Merged on GitHub by nami.')).toBe(true);
    const unmerged = topicStateChange(pr(false));
    expect(unmerged).toMatchObject({ solve: false, close: true });
    expect(
      unmerged?.reply.startsWith('Closed on GitHub without merging by robin.'),
    ).toBe(true);
  },
);

test(
  'a reopen reopens the topic without a solution, other actions do nothing',
  NODE,
  () => {
    const reopened = topicStateChange({
      ...closedIssue('completed'),
      action: 'reopened',
    });
    expect(reopened).toMatchObject({ solve: false, close: false });
    expect(reopened?.reply.startsWith('Reopened on GitHub by robin.')).toBe(
      true,
    );
    expect(
      topicStateChange({ ...closedIssue('completed'), action: 'edited' }),
    ).toBeNull();
  },
);

test('a pull request link comment from a person binds no topic', NODE, () => {
  expect(
    topicIdFromComments([
      {
        user: { login: 'mallory' },
        body: `${PR_LINK_COMMENT_PREFIX}https://forum.example/t/x/77`,
      },
    ]),
  ).toBeNull();
});

test('a pull request body longer than a forum post is shortened', NODE, () => {
  const { raw } = pullRequestTopic({
    number: 12,
    title: 't',
    body: 'x'.repeat(70_000),
    html_url: 'https://github.com/o/r/pull/12',
    user: { login: 'robin' },
  });
  expect(Array.from(raw).length).toBeLessThanOrEqual(32_000);
  expect(raw).toContain('https://github.com/o/r/pull/12');
  expect(raw.endsWith('(Shortened; the full comment is on GitHub.)')).toBe(
    true,
  );
});

/* Security: pull_request_target runs with secrets, so it must never check out the pull request. */
test(
  'every pull_request_target workflow checks out only the default branch',
  NODE,
  () => {
    const dir = '.github/workflows';
    type Step = { uses?: string; with?: { ref?: string; repository?: string } };
    type Workflow = { on?: unknown; jobs?: Record<string, { steps?: Step[] }> };
    const targets = readdirSync(dir)
      .filter((name) => name.endsWith('.yml'))
      .map((name) => ({
        name,
        workflow: load(readFileSync(`${dir}/${name}`, 'utf8')) as Workflow,
      }))
      .filter(({ workflow }) =>
        JSON.stringify(workflow.on ?? {}).includes('pull_request_target'),
      );
    expect(
      targets.length,
      'no pull_request_target workflow found',
    ).toBeGreaterThan(0);
    for (const { name, workflow } of targets) {
      for (const step of Object.values(workflow.jobs ?? {}).flatMap(
        (job) => job.steps ?? [],
      )) {
        if (!step.uses?.startsWith('actions/checkout@')) continue;
        expect(
          [undefined, '${{ github.event.repository.default_branch }}'],
          `${name} checks out ${step.with?.ref}, not the default branch`,
        ).toContain(step.with?.ref);
        expect(
          step.with?.repository,
          `${name} checks out another repository`,
        ).toBeUndefined();
      }
    }
  },
);

test('an issue closed as a duplicate says so and is not solved', NODE, () => {
  const change = topicStateChange(closedIssue('duplicate'));
  expect(change).toMatchObject({ solve: false, close: true });
  expect(
    change?.reply.startsWith('Closed on GitHub as a duplicate by robin.'),
  ).toBe(true);
});

test('a merged pull request without merged_by credits the sender', NODE, () => {
  const change = topicStateChange({
    action: 'closed',
    sender: { login: 'robin' },
    pull_request: { number: 12, merged: true, merged_by: null, html_url: 'u' },
  });
  expect(change?.reply.startsWith('Merged on GitHub by robin.')).toBe(true);
});

const API = 'forum-bot';
const posts = (...extra: object[]) => [
  { id: 1, post_number: 1, username: API },
  ...extra,
];

test('a close replies, accepts that reply, then closes', NODE, () => {
  const change = topicStateChange(closedIssue('completed'))!;
  expect(stateSteps(change, posts(), API).map((s) => s.step)).toEqual([
    'reply',
    'accept-reply',
    'close',
  ]);
});

test('a close keeps an answer a person already accepted', NODE, () => {
  const change = topicStateChange(closedIssue('completed'))!;
  const steps = stateSteps(
    change,
    posts({ id: 5, username: 'nami', accepted_answer: true }),
    API,
  ).map((s) => s.step);
  expect(steps).toEqual(['reply', 'close']);
});

test(
  'a reopen reopens first and unaccepts only its own close reply, not a mirrored comment',
  NODE,
  () => {
    const change = topicStateChange({
      ...closedIssue('completed'),
      action: 'reopened',
    })!;
    expect(
      stateSteps(
        change,
        posts(
          { id: 5, username: 'nami', accepted_answer: true },
          {
            id: 7,
            username: API,
            raw: 'robin wrote on GitHub:\n\nThe fix is in #12.',
            accepted_answer: true,
          },
          {
            id: 9,
            username: 'Forum-Bot',
            raw: 'Closed on GitHub as completed by robin.',
            accepted_answer: true,
          },
        ),
        API,
      ),
    ).toEqual([
      { step: 'reopen' },
      { step: 'unaccept', postId: 9 },
      { step: 'reply' },
    ]);
  },
);

test(
  'a reply Discourse will not let the bot accept takes the notice path',
  NODE,
  () => {
    expect(acceptDecision({ can_accept_answer: true })).toBe('accept');
    expect(acceptDecision({ can_accept_answer: false })).toBe('notice');
    expect(acceptDecision(undefined)).toBe('notice');
  },
);
