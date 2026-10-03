import AxeBuilder from '@axe-core/playwright';
import { test, type Page } from './test';
import { AXE_EXPERIMENTAL_RULES, AXE_TAGS } from './wcag';

/** One axe scan, its duration recorded as an annotation. */
export const timedScan = async (
  page: Page,
  label: string,
  tags: string[] = AXE_TAGS,
  enabledRules: string[] = AXE_EXPERIMENTAL_RULES,
): Promise<Awaited<ReturnType<AxeBuilder['analyze']>>> => {
  const started = Date.now();
  const rules = Object.fromEntries(
    enabledRules.map((id) => [id, { enabled: true }]),
  );
  /* `options()` replaces the whole option object, so it goes before `withTags()`. */
  const results = await new AxeBuilder({ page })
    .options({ rules })
    .withTags(tags)
    .analyze();
  const elapsed = Date.now() - started;

  const { width } = page.viewportSize() ?? { width: 0 };
  test.info().annotations.push({
    type: 'axe-scan',
    description: `${label} at ${width}px: ${(elapsed / 1000).toFixed(1)}s`,
  });

  return results;
};
