import AxeBuilder from '@axe-core/playwright';
import { test, type Page } from './test';
import { AXE_TAGS } from './wcag';

/** One axe scan, its duration recorded as an annotation. */
export const timedScan = async (
  page: Page,
  label: string,
  tags: string[] = AXE_TAGS,
): Promise<Awaited<ReturnType<AxeBuilder['analyze']>>> => {
  const started = Date.now();
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  const elapsed = Date.now() - started;

  const { width } = page.viewportSize() ?? { width: 0 };
  test.info().annotations.push({
    type: 'axe-scan',
    description: `${label} at ${width}px: ${(elapsed / 1000).toFixed(1)}s`,
  });

  return results;
};
