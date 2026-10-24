/*
 * Fails when a change weakens the tests: a skip, an axe narrowing, fewer or
 * hollow assertions, a changed threshold, a new rejected finding, or an edit to
 * the gate itself. CI runs the default branch's copy
 * (.github/workflows/test-weakening.yml); the owner approves the head commit.
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
/* timedScan(page, label, tags, enabledRules): a third argument narrows the tags. */
const TIMED_SCAN_DEFAULT_ARGS = 2;

const TEST_CODE = /^tests\/.*\.(?:[cm]?[jt]s|tsx?)$/;
const SPEC_FILE = /^tests\/.*\.spec\.[cm]?[jt]s$/;
const LIMIT_CODE = /^(?:tests|scripts)\/.*\.(?:[cm]?[jt]s|tsx?)$/;
const AXE_HELPER = 'tests/axe.ts';
/** Files that decide which tests run, in which engines and shards. */
const RUNNER_FILES = [
  'playwright.config.ts',
  'playwright.worker.config.ts',
  'tests/tags.ts',
  'tests/ports.ts',
  'scripts/shard-tests.mjs',
];

/** Skips or inverts a test: `test.skip`, `test.describe.fixme`, `testInfo.fail(`, `test[name](`. */
const SKIP =
  /\b(?:test|describe|it)(?:\.\w+)*\.(?:skip|fixme|fail)\b|\b\w*[Ii]nfo(?:\(\))?\.(?:skip|fixme|fail)\s*\(|\b(?:test|describe|it)(?:\.\w+)*\s*\[/;

/** Changes retries, mode or timeout for a group of tests. */
const CONFIGURE = /\b(?:test|describe)(?:\.\w+)*\.configure\s*\(/;

/** Turns an axe rule off or narrows what a scan or its results cover. */
const AXE_EXCLUSION =
  /\bdisableRules\b|\.(?:exclude|include|withRules|withTags)\s*\(|\brunOnly\b|\benabled\s*:\s*false\b|(?:\b(?:violations|incomplete)|\.nodes)\s*\.\s*filter\s*\(/;
const TIMED_SCAN = /\btimedScan\s*\(/;

/** An assertion; asymmetric matchers such as `expect.stringContaining` are values, not calls. */
const EXPECT_LINE =
  /\bexpect(?!\.(?:any|anything|arrayContaining|closeTo|not|objectContaining|stringContaining|stringMatching)\b)(?:\.\w+)*\s*\(/;
const EXPECT_CALL = new RegExp(EXPECT_LINE.source, 'g');
const MATCHER = /\.(?:not\.)?to[A-Z]\w*\s*\(/;
const NUMBER = /\d[\d_]*(?:\.\d+)?/;
const NEGATION = /\.not\./;
const NUMBERS = new RegExp(NUMBER.source, 'g');
const TRY_BLOCK = /\btry\s*\{/g;
const EARLY_RETURN = /=>\s*\{\s*return\s*(?:;|\n|\})/g;
/** `test.skip('title', ...)`: the whole test never runs, so edits inside it change nothing. */
const SKIPPED_TEST =
  /\b(?:test|describe|it)(?:\.describe)?\.(?:skip|fixme)\s*\(\s*['"`]/g;

const AXE_LIST =
  /\b(?:const|let|var)\s+(AXE_\w+)\s*(?::[^=]*)?=\s*\[([^\]]*)\]/g;
const QUOTED = /(['"`])((?:(?!\1).)*)\1/g;

const LIMIT_NAME = String.raw`\w*(?:BUDGET|TOLERANCE)\w*`;
const LIMIT_ONLY = new RegExp(`^${LIMIT_NAME}$`);
const SCALAR_LIMIT = new RegExp(
  String.raw`\b(?:const|let|var)\s+(${LIMIT_NAME})\s*(?::[^=;{]*)?=\s*([^;{]+?)\s*;`,
  'g',
);
const MAP_LIMIT = new RegExp(
  String.raw`\b(?:const|let|var)\s+(${LIMIT_NAME})\s*(?::[^=;]*)?=\s*\{`,
  'g',
);
const SCALED_LIMIT = new RegExp(
  String.raw`\b${LIMIT_NAME}\b\s*\*|\*\s*\b${LIMIT_NAME}\b`,
);
const NUMERIC_CONSTANT =
  /\b(?:const|let|var)\s+([A-Z][A-Z\d_]*)\s*(?::[^=;{]*)?=\s*([^;{]+?)\s*;/g;
const MAP_ENTRY = /^\s*(['"`]?)([^'"`:]+?)\1\s*:\s*([^,]+?)\s*,?\s*$/;
const ARITHMETIC = /^[\d_.\s+\-*/()]+$/;
const TYPE_SUFFIX = /\s+(?:as|satisfies)\s+[\w<>,\s]+$/;
const RELATIVE_IMPORT = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
const SCRIPT_EXTENSION = /\.(?:[cm]?[jt]s|tsx?)$/;

const BRACKETS = { '(': ')', '{': '}', '[': ']' };

const normalize = (line) => line.replace(/\s+/g, '');

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** Index just past the bracket that closes the one at `open`, or the text's end. */
const closing = (text, open) => {
  const opener = text[open];
  const close = BRACKETS[opener];
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === opener) depth += 1;
    if (text[index] === close && --depth === 0) return index + 1;
  }
  return text.length;
};

const blank = (part) => part.replace(/[^\n]/g, ' ');

/** A `/` after one of these, or a keyword such as `return`, starts a regex literal, not a division. */
const REGEX_PRECEDER =
  /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|in|of))\s*$/;

/** Index just past a regex literal's closing `/` and flags, or its line's end. */
const regexEnd = (text, start) => {
  let inClass = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\n') return index;
    if (character === '\\') index += 1;
    else if (character === '[') inClass = true;
    else if (character === ']') inClass = false;
    else if (character === '/' && !inClass) {
      let end = index + 1;
      while (/[a-z]/i.test(text[end] ?? '')) end += 1;
      return end;
    }
  }
  return text.length;
};

/**
 * The text with comments blanked to spaces, and string contents too when
 * `strings` is 'blank'; quotes and newlines stay, so offsets keep their lines.
 * A quote ends at its line's end, a template literal does not.
 */
const blankComments = (text, { strings = 'keep' } = {}) => {
  let kept = '';
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const pair = text.slice(index, index + 2);
    if (quote) {
      const closes =
        character === quote || (character === '\n' && quote !== '`');
      if (character === '\\') {
        const escaped = character + (text[++index] ?? '');
        kept += strings === 'blank' ? blank(escaped) : escaped;
      } else if (closes) {
        quote = null;
        kept += character;
      } else kept += strings === 'blank' ? blank(character) : character;
    } else if (pair === '//') {
      const lineEnd = text.indexOf('\n', index);
      const end = lineEnd === -1 ? text.length : lineEnd;
      kept += blank(text.slice(index, end));
      index = end - 1;
    } else if (pair === '/*') {
      const close = text.indexOf('*/', index + 2);
      const end = close === -1 ? text.length : close + 2;
      kept += blank(text.slice(index, end));
      index = end - 1;
    } else if (character === '/' && REGEX_PRECEDER.test(kept)) {
      const end = regexEnd(text, index);
      kept += text.slice(index, end);
      index = end - 1;
    } else {
      if (`'"\``.includes(character)) quote = character;
      kept += character;
    }
  }
  return kept;
};

/** The code that runs: comments, string contents and the bodies of tests that never run blanked. */
export const liveCode = (text) =>
  blankSkipped(blankComments(text, { strings: 'blank' }));

const blankSkipped = (code) => {
  let result = code;
  for (const match of code.matchAll(SKIPPED_TEST)) {
    const open = match.index + match[0].lastIndexOf('(');
    const end = closing(code, open);
    result =
      result.slice(0, open) +
      blank(result.slice(open, end)) +
      result.slice(end);
  }
  return result;
};

/** From the first `(` at or after `column` on line `index`, the text up to its closing `)`. */
const callText = (lines, index, column = 0) => {
  const text = lines.slice(index, index + MAX_CALL_LINES).join('\n');
  const open = text.indexOf('(', column);
  if (open === -1) return lines[index];
  return text.slice(column, closing(text, open));
};

/** A key function for `newMatchingLines`: the call that `pattern` starts on that line. */
const callAt = (pattern) => (lines, index) => {
  const column = lines[index].search(pattern);
  return callText(lines, index, Math.max(column, 0));
};

/** A titled skip is keyed by its line, so edits inside the parked test do not count as a new skip. */
const skipKey = (lines, index) =>
  new RegExp(SKIPPED_TEST.source).test(lines[index])
    ? lines[index]
    : callAt(SKIP)(lines, index);

/**
 * Lines of `newText` matching `pattern` beyond those `oldText` already had,
 * compared by `keyAt`'s whitespace-free text.
 */
export const newMatchingLines = (
  oldText,
  newText,
  pattern,
  keyAt = (lines, index) => lines[index],
) => {
  const remaining = new Map();
  const oldLines = oldText.split('\n');
  oldLines.forEach((line, index) => {
    if (!pattern.test(line)) return;
    const key = normalize(keyAt(oldLines, index));
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  });
  const added = [];
  const newLines = newText.split('\n');
  newLines.forEach((line, index) => {
    if (!pattern.test(line)) return;
    const key = keyAt(newLines, index);
    const left = remaining.get(normalize(key)) ?? 0;
    if (left > 0) remaining.set(normalize(key), left - 1);
    else added.push({ line: index + 1, text: line.trim(), key });
  });
  return added;
};

const countExpects = (code) => (code.match(EXPECT_CALL) ?? []).length;

/** Each expect call in live code with no `.matcher(` after it, as offsets. */
const hollowExpects = (code) =>
  [...code.matchAll(EXPECT_CALL)]
    .filter((match) => {
      const end = closing(code, match.index + match[0].length - 1);
      return !/^\s*\./.test(code.slice(end));
    })
    .map((match) => match.index);

/** Expect calls in a `try` whose `catch` does not rethrow, so it can swallow their failure. */
const expectsInTry = (code) =>
  [...code.matchAll(TRY_BLOCK)].reduce((sum, match) => {
    const open = match.index + match[0].length - 1;
    const end = closing(code, open);
    const handler = code.slice(end).match(/^\s*catch\s*(?:\([^)]*\))?\s*\{/);
    if (!handler) return sum;
    const handlerOpen = end + handler[0].length - 1;
    const rethrows = /\bthrow\b/.test(
      code.slice(handlerOpen, closing(code, handlerOpen)),
    );
    return rethrows ? sum : sum + countExpects(code.slice(open, end));
  }, 0);

const earlyReturns = (code) => (code.match(EARLY_RETURN) ?? []).length;

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
    const body = text.slice(open + 1, closing(text, open) - 1);
    const firstLine = lineAt(text, open);
    body.split('\n').forEach((entry, offset) => {
      const parts = blankComments(entry).match(MAP_ENTRY);
      if (!parts) return;
      found.set(`${match[1]}[${parts[2]}]`, {
        value: numericValue(parts[3]),
        line: firstLine + offset,
        map: match[1],
      });
    });
  }
  return found;
};

/** The scalar a map falls back to, as in `MAP[route] ?? FALLBACK`. */
const fallbackOf = (text, map) =>
  text.match(new RegExp(String.raw`\b${map}\s*\[[^\]]*\]\s*\?\?\s*(\w+)`))?.[1];

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

/** Top-level arguments in a call's text, from its first `(`. */
const argumentCount = (call) => {
  const open = call.indexOf('(');
  const inner = call.slice(open + 1, closing(call, open) - 1);
  if (inner.trim() === '') return 0;
  let depth = 0;
  let count = 1;
  for (const character of inner) {
    if ('([{'.includes(character)) depth += 1;
    if (')]}'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) count += 1;
  }
  return inner.trim().endsWith(',') ? count - 1 : count;
};

/** Matcher lines only one side has, each with its line number, for pairing edits. */
const unpairedMatchers = (oldLines, newLines) => {
  const count = (lines) => {
    const counts = new Map();
    for (const line of lines) {
      if (!MATCHER.test(line)) continue;
      counts.set(normalize(line), (counts.get(normalize(line)) ?? 0) + 1);
    }
    return counts;
  };
  const oldCounts = count(oldLines);
  const newCounts = count(newLines);
  const removed = [];
  for (const [key, number] of oldCounts)
    for (let left = number - (newCounts.get(key) ?? 0); left > 0; left -= 1)
      removed.push(key);
  const added = [];
  const seen = new Map();
  newLines.forEach((line, index) => {
    if (!MATCHER.test(line)) return;
    const key = normalize(line);
    const used = (seen.get(key) ?? 0) + 1;
    seen.set(key, used);
    if (used > (oldCounts.get(key) ?? 0)) added.push({ key, line: index + 1 });
  });
  return { removed, added };
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

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Findings for one changed file, apart from fewer expect calls, which
 * `changeFindings` weighs across files. `oldPath` is the base path (a rename's
 * source); an added file has `oldText` '', a deleted one `newText` ''.
 */
export const fileFindings = ({ path, oldPath = path, oldText, newText }) => {
  const findings = [];
  const add = (line, rule, file = path) => findings.push({ file, line, rule });

  if (TEST_CODE.test(path) || TEST_CODE.test(oldPath)) {
    const runs = runningText({ path, oldPath, newText });
    const oldCode = liveCode(oldText);
    const newCode = liveCode(runs);

    for (const { line, text } of newMatchingLines(oldText, runs, SKIP, skipKey))
      add(line, `skips or inverts a test: ${text}`);
    for (const { line, text } of newMatchingLines(oldText, runs, CONFIGURE))
      add(line, `configures how tests run: ${text}`);
    for (const { line, text } of newMatchingLines(oldText, runs, AXE_EXCLUSION))
      add(line, `narrows axe: ${text}`);
    for (const { line, text, key } of newMatchingLines(
      oldText,
      runs,
      TIMED_SCAN,
      callAt(TIMED_SCAN),
    ))
      if (argumentCount(key) > TIMED_SCAN_DEFAULT_ARGS)
        add(line, `narrows axe tags or rules: ${text}`);

    const newLists = axeLists(runs);
    for (const [name, { entries, line }] of axeLists(oldText)) {
      const kept = newLists.get(name)?.entries ?? [];
      for (const entry of entries.filter((entry) => !kept.includes(entry)))
        add(newLists.get(name)?.line ?? line, `drops '${entry}' from ${name}`);
    }

    const after = scalars(runs, NUMERIC_CONSTANT);
    for (const [name, before] of scalars(oldText, NUMERIC_CONSTANT)) {
      if (LIMIT_ONLY.test(name) || before.value === null) continue;
      const now = after.get(name);
      if (!now)
        findings.push({
          file: path,
          line: before.line,
          rule: `removes ${name} (${before.value})`,
          constant: { name, value: before.value },
        });
      else if (now.value !== before.value)
        add(now.line, `changes ${name} from ${before.value} to ${now.value}`);
    }

    const { removed, added } = unpairedMatchers(
      oldCode.split('\n'),
      newCode.split('\n'),
    );
    const pool = (keys) => {
      const counts = new Map();
      for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
      return (key) => {
        const left = counts.get(key) ?? 0;
        if (left > 0) counts.set(key, left - 1);
        return left > 0;
      };
    };
    const takeExact = pool(removed);
    const takeShape = pool(removed.map((key) => key.replace(NUMBERS, '#')));
    for (const { key, line } of added) {
      if (NEGATION.test(key) && takeExact(key.replace(NEGATION, '.')))
        add(line, 'negates an assertion');
      else if (NUMBER.test(key) && takeShape(key.replace(NUMBERS, '#')))
        add(line, 'changes a number in an assertion');
    }

    const hollowBefore = hollowExpects(oldCode).length;
    const hollowNow = hollowExpects(newCode);
    if (hollowNow.length > hollowBefore)
      add(
        lineAt(newCode, hollowNow.at(-1)),
        `${plural(hollowNow.length - hollowBefore, 'expect')} with no matcher`,
      );
    if (expectsInTry(newCode) > expectsInTry(oldCode))
      add(1, 'puts an expect inside try');
    if (earlyReturns(newCode) > earlyReturns(oldCode))
      add(1, 'returns before a test body runs');
  }

  if (oldPath === AXE_HELPER && oldText !== newText)
    add(1, 'changes the axe helper', oldPath);

  if (LIMIT_CODE.test(path) || LIMIT_CODE.test(oldPath)) {
    const before = limits(oldText);
    const after = limits(newText);
    for (const [name, was] of before) {
      const now = after.get(name);
      if (!now) add(was.line, `removes limit ${name}`, oldPath);
      else if (was.value !== null && now.value === null)
        add(now.line, `limit ${name} is no longer a plain number`);
      else if (was.value !== null && now.value > was.value)
        add(now.line, `raises ${name} from ${was.value} to ${now.value}`);
    }
    for (const [name, now] of after) {
      if (before.has(name) || !now.map) continue;
      const fallback = fallbackOf(newText, now.map);
      const floor = fallback && after.get(fallback)?.value;
      if (typeof floor === 'number' && now.value > floor)
        add(now.line, `adds ${name} above its fallback ${fallback}`);
    }
    for (const { line, text } of newMatchingLines(
      liveCode(oldText),
      liveCode(newText),
      SCALED_LIMIT,
    ))
      add(line, `scales a limit where it is used: ${text}`);
  }

  if (RUNNER_FILES.includes(oldPath) && oldText !== newText)
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

/** The text Playwright still runs: none once a spec is renamed out of `*.spec.*`. */
const runningText = ({ path, oldPath = path, newText }) =>
  SPEC_FILE.test(oldPath) && !SPEC_FILE.test(path) ? '' : newText;

const importsOf = (path, text) =>
  [...text.matchAll(RELATIVE_IMPORT)].map(([, specifier]) => {
    const parts = [...path.split('/').slice(0, -1), ...specifier.split('/')];
    const resolved = [];
    for (const part of parts) {
      if (part === '..') resolved.pop();
      else if (part !== '.') resolved.push(part);
    }
    return resolved.join('/');
  });

/**
 * Every finding across a change. A file with fewer expect calls passes when
 * test helpers it imports gained at least as many: the check moved, not went.
 */
export const changeFindings = (files) => {
  const gained = new Map();
  const losses = [];
  for (const file of files) {
    const { path, oldPath = path, oldText } = file;
    if (!TEST_CODE.test(path) && !TEST_CODE.test(oldPath)) continue;
    const delta =
      countExpects(liveCode(runningText(file))) -
      countExpects(liveCode(oldText));
    if (delta > 0) gained.set(path.replace(SCRIPT_EXTENSION, ''), delta);
    if (delta < 0) losses.push({ ...file, oldPath, removed: -delta });
  }

  const moved = losses.flatMap(
    ({ path, oldPath, oldText, newText, removed }) => {
      const helpers = importsOf(path, newText).reduce(
        (sum, helper) =>
          sum + (gained.get(helper.replace(SCRIPT_EXTENSION, '')) ?? 0),
        0,
      );
      if (helpers >= removed) return [];
      const firstGone = newMatchingLines(newText, oldText, EXPECT_LINE)[0];
      return [
        {
          file: oldPath,
          line: firstGone?.line ?? 1,
          rule: `${plural(removed, 'fewer expect call')} (line in base)`,
        },
      ];
    },
  );

  const defined = files.flatMap((file) =>
    TEST_CODE.test(file.path)
      ? [...scalars(file.newText, NUMERIC_CONSTANT)].map(
          ([name, { value }]) => ({
            path: file.path,
            name,
            value,
          }),
        )
      : [],
  );
  const relocated = ({ file, constant }) => {
    if (!constant) return false;
    const { name, value } = constant;
    const elsewhere = defined.filter(
      (other) => other.name === name && other.path !== file,
    );
    if (elsewhere.length > 0)
      return elsewhere.every((other) => other.value === value);
    const newText = files.find(({ path }) => path === file)?.newText ?? '';
    return new RegExp(
      String.raw`import\s*(?:type\s*)?\{[^}]*\b${name}\b[^}]*\}`,
    ).test(newText);
  };

  return [
    ...files.flatMap(fileFindings).filter((finding) => !relocated(finding)),
    ...moved,
  ];
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

  const findings = changeFindings(
    changedFiles({ git, base, head, readWorking: readFile }),
  );
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
