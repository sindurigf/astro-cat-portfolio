import { createRequire } from 'node:module';
import type { Page } from './test';

const HTMLCS_SCRIPT = createRequire(import.meta.url).resolve(
  '@pa11y/html_codesniffer/build/HTMLCS.js',
);

const STANDARD = 'WCAG2AA';
const HTML_EXCERPT_LENGTH = 200;
const SELECTOR_DEPTH = 5;

/* Warnings are prompts for a person; H42, a paragraph that is only bold text, is gated as a likely heading. */
const GATED_WARNING_SUFFIX = '.H42';

export interface FalsePositive {
  code: string;
  /** The elements the finding was checked on; a hit elsewhere still fails. */
  selector: string;
  /** Drops the hit only while this is true of the element; see `reasonHolds`. */
  holds?: 'list-lead-in';
  /** A route where the hit occurs, so a stale entry fails its own test. */
  seenOn: string;
}

/** Each entry is in ARCHITECTURE.md "Rejected findings", with its reason. */
export const HTMLCS_FALSE_POSITIVES: readonly FalsePositive[] = [];

export interface Hit {
  code: string;
  type: 'error' | 'warning';
  message: string;
  selector: string;
  html: string;
}

export interface Audit {
  violations: Hit[];
  /** Hits matched by an entry of `falsePositives`, by its index. */
  dropped: { entry: number; hit: Hit }[];
}

interface Message {
  type: number;
  code: string;
  msg: string;
  element: Node | null;
}

interface Sniffer {
  ERROR: number;
  WARNING: number;
  process: (
    standard: string,
    content: Document,
    callback: () => void,
    failCallback: () => void,
  ) => void;
  getMessages: () => Message[];
}

/** One HTML_CodeSniffer run of the live DOM at WCAG 2.1 AA: its errors, and its H42 warnings. */
export const runHtmlcs = async (
  page: Page,
  falsePositives: readonly FalsePositive[] = HTMLCS_FALSE_POSITIVES,
): Promise<Audit> => {
  await page.addScriptTag({ path: HTMLCS_SCRIPT });
  return page.evaluate(
    ({ entries, standard, gatedSuffix, excerpt, depth }) =>
      new Promise<Audit>((resolve, reject) => {
        const { HTMLCS } = window as unknown as { HTMLCS: Sniffer };
        const selectorOf = (element: Element): string => {
          const parts: string[] = [];
          for (
            let node: Element | null = element;
            node && parts.length < depth;
            node = node.parentElement
          ) {
            if (node.id) {
              parts.unshift(`${node.localName}#${node.id}`);
              break;
            }
            const classes = [...node.classList]
              .map((name) => `.${CSS.escape(name)}`)
              .join('');
            parts.unshift(`${node.localName}${classes}`);
          }
          return parts.join(' > ');
        };
        /* A short label that ends in a colon and introduces the list after it, not a heading over a section. */
        const isListLeadIn = (element: Element): boolean =>
          (element.textContent ?? '').trim().endsWith(':') &&
          element.nextElementSibling?.matches('ul, ol') === true;
        const reasonHolds = (element: Element, holds?: string): boolean =>
          holds === undefined ||
          (holds === 'list-lead-in' && isListLeadIn(element));
        HTMLCS.process(
          standard,
          document,
          () => {
            const audit: Audit = { violations: [], dropped: [] };
            for (const { type, code, msg, element } of HTMLCS.getMessages()) {
              const gated =
                type === HTMLCS.ERROR ||
                (type === HTMLCS.WARNING && code.endsWith(gatedSuffix));
              if (!gated) continue;
              const target = element instanceof Element ? element : null;
              const hit: Hit = {
                code,
                type: type === HTMLCS.ERROR ? 'error' : 'warning',
                message: msg,
                selector: target
                  ? selectorOf(target)
                  : String(element?.nodeName),
                html: target?.outerHTML.slice(0, excerpt) ?? '',
              };
              const entry = entries.findIndex(
                (fp) =>
                  fp.code === code &&
                  target?.matches(fp.selector) === true &&
                  reasonHolds(target, fp.holds),
              );
              if (entry === -1) audit.violations.push(hit);
              else audit.dropped.push({ entry, hit });
            }
            resolve(audit);
          },
          () =>
            reject(new Error(`HTML_CodeSniffer could not load ${standard}.`)),
        );
      }),
    {
      entries: falsePositives,
      standard: STANDARD,
      gatedSuffix: GATED_WARNING_SUFFIX,
      excerpt: HTML_EXCERPT_LENGTH,
      depth: SELECTOR_DEPTH,
    },
  );
};

/** HTML_CodeSniffer output a person can act on without opening a report. */
export const formatHits = (label: string, hits: Hit[]): string =>
  [
    `${hits.length} HTML_CodeSniffer finding(s) on ${label}:`,
    ...hits.map((hit) =>
      [
        `  code:     ${hit.code}`,
        `  type:     ${hit.type}`,
        `  message:  ${hit.message}`,
        `  selector: ${hit.selector}`,
        `  html:     ${hit.html}`,
      ].join('\n'),
    ),
  ].join('\n\n');
