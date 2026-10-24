import { createRequire } from 'node:module';
import type { AuditResult } from '@accesslint/core';
import type { Page } from './test';

const ACCESSLINT_SCRIPT = createRequire(import.meta.url).resolve(
  '@accesslint/core/iife',
);

export interface FalsePositive {
  rule: string;
  /** The elements the finding was checked on; a hit elsewhere still fails. */
  selector: string;
  /** Drops the hit only while this is true of the element; see `reasonHolds`. */
  holds?: 'unrendered' | 'ground-not-behind';
  /** A route where the hit occurs, so a stale entry fails its own test. */
  seenOn: string;
}

/** Each entry is in ARCHITECTURE.md "Rejected findings", with its reason. */
export const ACCESSLINT_FALSE_POSITIVES: readonly FalsePositive[] = [
  {
    rule: 'landmarks/landmark-unique',
    selector: 'nav.noscript-nav',
    holds: 'unrendered',
    seenOn: '/',
  },
  {
    rule: 'distinguishable/color-contrast',
    selector: '.hero-plate h1 > span',
    holds: 'ground-not-behind',
    seenOn: '/',
  },
  {
    rule: 'aria/aria-hidden-focus',
    selector: '.brand-stage-half[inert] *',
    seenOn: '/brand',
  },
];

export interface Hit {
  ruleId: string;
  selector: string;
  impact: string;
  message: string;
  html: string;
}

export interface Audit {
  violations: Hit[];
  /** Hits matched by an entry of `falsePositives`, by its index. */
  dropped: { entry: number; hit: Hit }[];
}

/** One AccessLint audit of the live DOM, WCAG 2.2 A and AA plus best practice. */
export const runAccessLint = async (
  page: Page,
  falsePositives: readonly FalsePositive[] = ACCESSLINT_FALSE_POSITIVES,
): Promise<Audit> => {
  await page.addScriptTag({ path: ACCESSLINT_SCRIPT });
  return page.evaluate((entries) => {
    const { runAudit } = (
      window as unknown as {
        AccessLint: { runAudit: (doc: Document) => AuditResult };
      }
    ).AccessLint;
    /* The ground an engine reads is the nearest ancestor with a background; is it painted under the text? */
    const groundNotBehind = (element: Element): boolean => {
      let ground = element.parentElement;
      while (
        ground &&
        getComputedStyle(ground).backgroundColor === 'rgba(0, 0, 0, 0)'
      ) {
        ground = ground.parentElement;
      }
      const range = document.createRange();
      range.selectNodeContents(element);
      const box = range.getClientRects()[0];
      if (!ground || !box) return false;
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      /* elementsFromPoint is empty off screen, which would read as "not behind". */
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      return !document.elementsFromPoint(x, y).includes(ground);
    };
    const reasonHolds = (element: Element, holds?: string): boolean =>
      holds === undefined ||
      (holds === 'unrendered' && !element.checkVisibility()) ||
      (holds === 'ground-not-behind' && groundNotBehind(element));
    const audit: Audit = { violations: [], dropped: [] };
    for (const { ruleId, selector, impact, message, html, element } of runAudit(
      document,
    ).violations) {
      const hit = { ruleId, selector, impact, message, html };
      const entry = entries.findIndex(
        (fp) =>
          fp.rule === ruleId &&
          element?.matches(fp.selector) === true &&
          reasonHolds(element, fp.holds),
      );
      if (entry === -1) audit.violations.push(hit);
      else audit.dropped.push({ entry, hit });
    }
    return audit;
  }, falsePositives);
};

/** AccessLint output a person can act on without opening a report. */
export const formatHits = (label: string, hits: Hit[]): string =>
  [
    `${hits.length} AccessLint violation(s) on ${label}:`,
    ...hits.map((hit) =>
      [
        `  rule:     ${hit.ruleId}`,
        `  impact:   ${hit.impact}`,
        `  message:  ${hit.message}`,
        `  selector: ${hit.selector}`,
        `  html:     ${hit.html}`,
      ].join('\n'),
    ),
  ].join('\n\n');
