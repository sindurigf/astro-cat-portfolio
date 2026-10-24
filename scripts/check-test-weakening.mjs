/*
 * Fails when a change weakens the tests: a skip, an axe exclusion, fewer
 * expect calls, a looser threshold, a new rejected finding, or an edit to this
 * guard. CI runs the default branch's copy (.github/workflows/test-weakening.yml);
 * the owner approves the head commit. See ARCHITECTURE.md.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const APPROVAL_MARKER = /^Approved test change: *(\S.*)$/;
const PLACEHOLDER_REASON = '<reason>';
const FENCE = /^\s*(?:```|~~~)/;
const GUARD_SCRIPT = 'scripts/check-test-weakening.mjs';
const WORKFLOWS = /^\.github\/workflows\//;
const ARCHITECTURE = 'ARCHITECTURE.md';
const REJECTED_HEADING = '## Rejected findings';
const REJECTED_TITLE = REJECTED_HEADING.replace(/^#+ /, '');
const DEFAULT_BASE = 'main';
const API_PAGE_SIZE = 100;
const APPROVED = 'APPROVED';
const SHA = /^[0-9a-f]{40}$/;
const SHORT_SHA_LENGTH = 7;
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_CALL_LINES = 20;

const TEST_CODE = /^tests\/.*\.(?:[cm]?[jt]s|tsx?)$/;
const SPEC_FILE = /^tests\/.*\.spec\.[cm]?[jt]s$/;
const LIMIT_CODE = /^(?:tests|scripts)\/.*\.(?:[cm]?[jt]s|tsx?)$/;
const THRESHOLD_FILES = ['tests/contrast.ts', 'tests/wcag.ts'];
const RUNNER_CONFIGS = ['playwright.config.ts', 'playwright.worker.config.ts'];

/** Skips or inverts a test: `test.skip`, `test.describe.fixme`, `testInfo.fail(`, `test['skip']`. */
const SKIP =
  /\b(?:test|describe|it)(?:\.\w+)*\.(?:skip|fixme|fail)\b|\.(?:skip|fixme|fail)\s*\(|\[\s*['"`](?:skip|fixme|fail)['"`]\s*\]/;

/** Turns an axe rule off or narrows what a scan or its results cover. */
const AXE_EXCLUSION =
  /\bdisableRules\b|\.(?:exclude|include)\s*\(|\benabled\s*:\s*false\b|(?:\b(?:violations|incomplete)|\.nodes)\s*\.\s*filter\s*\(/;

/** An assertion; asymmetric matchers such as `expect.stringContaining` are values, not calls. */
const EXPECT_LINE =
  /\bexpect(?!\.(?:any|anything|arrayContaining|closeTo|not|objectContaining|stringContaining|stringMatching)\b)(?:\.\w+)*\s*\(/;
const EXPECT_CALL = new RegExp(EXPECT_LINE.source, 'g');

const AXE_LIST =
  /\b(?:const|let|var)\s+(AXE_\w+)\s*(?::[^=]*)?=\s*\[([^\]]*)\]/g;
const QUOTED = /(['"`])((?:(?!\1).)*)\1/g;

const LIMIT_NAME = String.raw`\w*(?:BUDGET|TOLERANCE)\w*`;
const SCALAR_LIMIT = new RegExp(
  String.raw`\b(?:const|let|var)\s+(${LIMIT_NAME})\s*(?::[^=;{]*)?=\s*([^;{]+?)\s*;`,
  'g',
);
const MAP_LIMIT = new RegExp(
  String.raw`\b(?:const|let|var)\s+(${LIMIT_NAME})\s*(?::[^=;]*)?=\s*\{`,
  'g',
);
const NUMERIC_CONSTANT =
  /\b(?:const|let|var)\s+([A-Z][A-Z\d_]*)\s*(?::[^=;{]*)?=\s*([^;{]+?)\s*;/g;
const MAP_ENTRY = /^\s*(['"`]?)([^'"`:]+?)\1\s*:\s*([^,]+?)\s*,?\s*$/;
const ARITHMETIC = /^[\d_.\s+\-*/()]+$/;
const TYPE_SUFFIX = /\s+(?:as|satisfies)\s+[\w<>,\s]+$/;

const normalize = (line) => line.replace(/\s+/g, '');

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** The text without `//` and block comments; a quote ends at its line's end, a template literal does not. */
const withoutComments = (text) => {
  let kept = '';
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const pair = text.slice(index, index + 2);
    if (quote) {
      kept += character;
      if (character === '\\') kept += text[++index] ?? '';
      else if (character === quote || (character === '\n' && quote !== '`'))
        quote = null;
    } else if (pair === '//') {
      const lineEnd = text.indexOf('\n', index);
      index = (lineEnd === -1 ? text.length : lineEnd) - 1;
    } else if (pair === '/*') {
      const close = text.indexOf('*/', index + 2);
      index = close === -1 ? text.length : close + 1;
    } else {
      if (`'"\``.includes(character)) quote = character;
      kept += character;
    }
  }
  return kept;
};

/** The line, plus the lines after it until its first `(` closes, so a call's arguments are part of its text. */
const wholeCall = (lines, index) => {
  let depth = 0;
  let opened = false;
  const parts = [];
  for (
    let at = index;
    at < Math.min(lines.length, index + MAX_CALL_LINES);
    at += 1
  ) {
    parts.push(lines[at]);
    for (const character of lines[at]) {
      if (character === '(') [depth, opened] = [depth + 1, true];
      if (character === ')') depth -= 1;
    }
    if (opened && depth <= 0) break;
  }
  return parts.join('\n');
};

/** Lines of `newText` matching `pattern` beyond those `oldText` already had, compared by whitespace-free text. */
export const newMatchingLines = (
  oldText,
  newText,
  pattern,
  textAt = (lines, index) => lines[index],
) => {
  const remaining = new Map();
  const oldLines = oldText.split('\n');
  oldLines.forEach((line, index) => {
    if (!pattern.test(line)) return;
    const key = normalize(textAt(oldLines, index));
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  });
  const added = [];
  const newLines = newText.split('\n');
  newLines.forEach((line, index) => {
    if (!pattern.test(line)) return;
    const key = normalize(textAt(newLines, index));
    const left = remaining.get(key) ?? 0;
    if (left > 0) remaining.set(key, left - 1);
    else added.push({ line: index + 1, text: line.trim() });
  });
  return added;
};

const countExpects = (text) =>
  (withoutComments(text).match(EXPECT_CALL) ?? []).length;

/** Evaluates a numeric literal or plain arithmetic of literals; anything else is `null`. */
export const numericValue = (source) => {
  const expression = source.replace(TYPE_SUFFIX, '').trim();
  if (!ARITHMETIC.test(expression)) return null;
  try {
    const value = Function(
      `"use strict"; return (${expression.replaceAll('_', '')});`,
    )();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const closingBrace = (text, open) => {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}' && --depth === 0) return index;
  }
  return text.length;
};

const scalars = (text, pattern) => {
  const found = new Map();
  for (const match of text.matchAll(pattern)) {
    found.set(match[1], {
      value: numericValue(match[2]),
      line: lineAt(text, match.index),
    });
  }
  return found;
};

/** Every budget or tolerance constant and map entry, keyed `NAME` or `NAME[key]`. */
export const limits = (text) => {
  const found = scalars(text, SCALAR_LIMIT);
  for (const match of text.matchAll(MAP_LIMIT)) {
    const open = match.index + match[0].length - 1;
    const body = text.slice(open + 1, closingBrace(text, open));
    const firstLine = lineAt(text, open);
    body.split('\n').forEach((entry, offset) => {
      const parts = withoutComments(entry).match(MAP_ENTRY);
      if (!parts) return;
      found.set(`${match[1]}[${parts[2]}]`, {
        value: numericValue(parts[3]),
        line: firstLine + offset,
      });
    });
  }
  return found;
};

const axeLists = (text) => {
  const lists = new Map();
  for (const match of text.matchAll(AXE_LIST)) {
    lists.set(match[1], {
      entries: [...match[2].matchAll(QUOTED)].map(([, , entry]) => entry),
      line: lineAt(text, match.index),
    });
  }
  return lists;
};

/** Each bullet under "Rejected findings", nested ones included, with its continuation lines joined. */
const rejectedSection = (text) => {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === REJECTED_HEADING);
  if (start === -1) return null;
  const bullets = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^#{1,2} /.test(line)) break;
    if (/^\s*[-*+] /.test(line))
      bullets.push({ text: line.trim(), line: index + 1 });
    else if (/^\s+\S/.test(line) && bullets.length > 0)
      bullets.at(-1).text += ` ${line.trim()}`;
  }
  return bullets;
};

const findingTitle = (bullet) =>
  bullet.match(/^[-*+] \*\*(.+?)\*\*/)?.[1] ?? bullet;

/** Bullets under "Rejected findings" in `newText` that `oldText` lacks word for word. */
export const newRejectedFindings = (oldText, newText) => {
  const known = new Map();
  for (const { text } of rejectedSection(oldText) ?? []) {
    const key = normalize(text);
    known.set(key, (known.get(key) ?? 0) + 1);
  }
  return (rejectedSection(newText) ?? []).filter(({ text }) => {
    const key = normalize(text);
    const left = known.get(key) ?? 0;
    known.set(key, left - 1);
    return left <= 0;
  });
};

/**
 * Findings for one changed file. `oldPath` is the base path (a rename's
 * source); an added file has `oldText` '', a deleted one `newText` ''.
 */
export const fileFindings = ({ path, oldPath = path, oldText, newText }) => {
  const findings = [];
  const add = (line, rule, file = path) => findings.push({ file, line, rule });

  if (TEST_CODE.test(path) || TEST_CODE.test(oldPath)) {
    const runs =
      SPEC_FILE.test(oldPath) && !SPEC_FILE.test(path) ? '' : newText;

    for (const { line, text } of newMatchingLines(
      oldText,
      runs,
      SKIP,
      wholeCall,
    ))
      add(line, `skips or inverts a test: ${text}`);
    for (const { line, text } of newMatchingLines(oldText, runs, AXE_EXCLUSION))
      add(line, `excludes axe rules or nodes: ${text}`);

    const removed = countExpects(oldText) - countExpects(runs);
    if (removed > 0) {
      const firstGone = newMatchingLines(runs, oldText, EXPECT_LINE)[0];
      add(
        firstGone?.line ?? 1,
        `${removed} fewer expect call${removed === 1 ? '' : 's'} (line in base)`,
        oldPath,
      );
    }

    const newLists = axeLists(runs);
    for (const [name, { entries, line }] of axeLists(oldText)) {
      const kept = newLists.get(name)?.entries ?? [];
      for (const entry of entries.filter((entry) => !kept.includes(entry)))
        add(newLists.get(name)?.line ?? line, `drops '${entry}' from ${name}`);
    }
  }

  if (LIMIT_CODE.test(path) || LIMIT_CODE.test(oldPath)) {
    const after = limits(newText);
    for (const [name, before] of limits(oldText)) {
      const now = after.get(name);
      if (!now) add(before.line, `removes limit ${name}`, oldPath);
      else if (before.value !== null && now.value === null)
        add(now.line, `limit ${name} is no longer a plain number`);
      else if (before.value !== null && now.value > before.value)
        add(now.line, `raises ${name} from ${before.value} to ${now.value}`);
    }
  }

  if (THRESHOLD_FILES.includes(oldPath)) {
    const after = scalars(newText, NUMERIC_CONSTANT);
    for (const [name, before] of scalars(oldText, NUMERIC_CONSTANT)) {
      const now = after.get(name);
      if (before.value !== null && now?.value !== before.value)
        add(
          now?.line ?? before.line,
          `changes WCAG threshold ${name} from ${before.value} to ${now?.value ?? 'nothing'}`,
        );
    }
  }

  if (RUNNER_CONFIGS.includes(oldPath) && oldText !== newText)
    add(1, 'changes which tests run', oldPath);

  if (oldPath === ARCHITECTURE) {
    if (rejectedSection(oldText) !== null && rejectedSection(newText) === null)
      add(1, `removes the "${REJECTED_TITLE}" heading`);
    for (const { line, text } of newRejectedFindings(oldText, newText))
      add(line, `adds a rejected finding: ${findingTitle(text)}`);
  }

  if (oldPath === GUARD_SCRIPT && oldText !== '' && oldText !== newText)
    add(1, 'changes the test-weakening guard', oldPath);

  if (WORKFLOWS.test(path) || WORKFLOWS.test(oldPath))
    add(1, 'changes a CI workflow');

  return findings;
};

const approvalReason = (body) => {
  let fenced = false;
  for (const line of (body ?? '').split(/\r?\n/)) {
    if (FENCE.test(line)) fenced = !fenced;
    if (fenced) continue;
    const reason = line.match(APPROVAL_MARKER)?.[1]?.trim();
    if (reason && reason !== PLACEHOLDER_REASON) return reason;
  }
  return null;
};

/** The reason from the owner's approving review of `headSha` that carries the marker; `null` otherwise. */
export const ownerApproval = (reviews, owner, headSha) => {
  const ownerLogin = owner.toLowerCase();
  for (const { login, state, body, commitId } of reviews) {
    if ((login ?? '').toLowerCase() !== ownerLogin) continue;
    if (state !== APPROVED || commitId !== headSha) continue;
    const reason = approvalReason(body);
    if (reason) return reason;
  }
  return null;
};

export const runGit = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });

/**
 * Each file `git diff -z --name-status` lists between `base` and `head`, or the
 * working tree when `head` is null, with its text on both sides.
 */
export const changedFiles = ({ git, base, head, readWorking }) => {
  const range = head ? [base, head] : [base];
  const fields = git('diff', '-z', '--name-status', '-M', ...range).split('\0');
  const files = [];
  for (let index = 0; index < fields.length - 1;) {
    const status = fields[index];
    const paired = status.startsWith('R') || status.startsWith('C');
    const oldPath = fields[index + 1];
    const path = paired ? fields[index + 2] : oldPath;
    index += paired ? 3 : 2;
    files.push({
      path,
      oldPath,
      oldText: status === 'A' ? '' : git('show', `${base}:${oldPath}`),
      newText:
        status === 'D'
          ? ''
          : head
            ? git('show', `${head}:${path}`)
            : readWorking(path),
    });
  }
  return files;
};

const fetchAll = async (fetchImpl, url, token) => {
  const items = [];
  for (let page = 1; ; page += 1) {
    const response = await fetchImpl(
      `${url}?per_page=${API_PAGE_SIZE}&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'check-test-weakening',
        },
      },
    );
    if (!response.ok)
      throw new Error(`GitHub API ${url} answered ${response.status}.`);
    const batch = await response.json();
    items.push(...batch);
    if (batch.length < API_PAGE_SIZE) return items;
  }
};

const pullRequestReviews = async (fetchImpl, repository, number, token) =>
  (
    await fetchAll(
      fetchImpl,
      `https://api.github.com/repos/${repository}/pulls/${number}/reviews`,
      token,
    )
  ).map((review) => ({
    login: review.user?.login,
    state: review.state,
    body: review.body,
    commitId: review.commit_id,
  }));

const requireEnv = (env, name) => {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
};

const requireSha = (value, name) => {
  if (!SHA.test(value ?? '')) throw new Error(`${name} is not a commit SHA.`);
  return value;
};

/** Runs the guard; returns the exit code and throws on anything it cannot check. */
export const main = async ({
  env = process.env,
  git = runGit,
  readFile = (path) => readFileSync(path, 'utf8'),
  fetchImpl = fetch,
  log = console.log,
} = {}) => {
  const inCI = Boolean(env.GITHUB_EVENT_PATH) || env.GITHUB_ACTIONS === 'true';
  let pullRequest = null;
  let base;
  let head = null;

  if (inCI) {
    const event = JSON.parse(readFile(requireEnv(env, 'GITHUB_EVENT_PATH')));
    pullRequest = event.pull_request ?? null;
    if (!pullRequest) {
      log('Test weakening: not a pull request, so nothing can approve it.');
      return 1;
    }
    head = requireSha(pullRequest.head?.sha, 'pull_request.head.sha');
    const baseSha = requireSha(pullRequest.base?.sha, 'pull_request.base.sha');
    base = git('merge-base', baseSha, head).trim();
  } else {
    base = git('merge-base', `origin/${DEFAULT_BASE}`, 'HEAD').trim();
  }

  const findings = changedFiles({
    git,
    base,
    head,
    readWorking: readFile,
  }).flatMap(fileFindings);
  if (findings.length === 0) {
    log('Test weakening: none.');
    return 0;
  }

  for (const { file, line, rule } of findings) log(`${file}:${line}  ${rule}`);

  if (!inCI) {
    if (env.APPROVED_TEST_CHANGE) {
      log('\nTest weakening: allowed locally by APPROVED_TEST_CHANGE.');
      return 0;
    }
    log(
      '\nTest weakening: the owner approves in the pull request. Set APPROVED_TEST_CHANGE to pass locally.',
    );
    return 1;
  }

  const owner = requireEnv(env, 'GITHUB_REPOSITORY_OWNER');
  const reason = ownerApproval(
    await pullRequestReviews(
      fetchImpl,
      requireEnv(env, 'GITHUB_REPOSITORY'),
      pullRequest.number,
      requireEnv(env, 'GITHUB_TOKEN'),
    ),
    owner,
    head,
  );
  if (reason) {
    log(`\nTest weakening: approved by ${owner}: ${reason}`);
    return 0;
  }
  log(
    `\nTest weakening: needs ${owner}'s approving review of ${head.slice(0, SHORT_SHA_LENGTH)} with the line "Approved test change: <reason>", then a re-run of this job.`,
  );
  return 1;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(`Test weakening: could not run. ${error.message}`);
    process.exitCode = 1;
  }
}
