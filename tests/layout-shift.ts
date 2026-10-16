import type { Page } from './test';

/*
 * Each shift with what moved, so a failure names the element: CI's are not reproducible locally.
 * Entries arrive asynchronously, so the reader takes the pending ones first (takeRecords).
 */
export const LAYOUT_SHIFT = `
  window.__layoutShift = 0;
  window.__shifts = [];
  const rect = (r) => [r.x, r.y, r.width, r.height].map(Math.round).join(',');
  const name = (node) => {
    if (!node) return '(removed)';
    const el = node.nodeType === 1 ? node : node.parentElement;
    const tag = el ? el.tagName.toLowerCase() : '?';
    const id = el && el.id ? '#' + el.id : '';
    const cls = el && el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '';
    return (node.nodeType === 1 ? '' : 'text in ') + tag + id + cls;
  };
  window.__handleShifts = (entries) => {
    for (const entry of entries) {
      if (entry.hadRecentInput) continue;
      window.__layoutShift += entry.value;
      for (const s of entry.sources ?? [])
        window.__shifts.push(
          entry.value.toFixed(6) + ' ' + name(s.node) + ' ' + rect(s.previousRect) + ' -> ' + rect(s.currentRect),
        );
    }
  };
  window.__shiftObserver = new PerformanceObserver((list) => window.__handleShifts(list.getEntries()));
  window.__shiftObserver.observe({ type: 'layout-shift', buffered: true });
`;

/** The summed shift so far and a line per moved element (value, element, x,y,w,h before -> after). */
export const layoutShiftOf = (
  page: Page,
): Promise<{ shift: number; sources: string[] }> =>
  page.evaluate(() => {
    const w = window as unknown as {
      __layoutShift: number;
      __shifts: string[];
      __shiftObserver: PerformanceObserver;
      __handleShifts: (entries: PerformanceEntryList) => void;
    };
    w.__handleShifts(w.__shiftObserver.takeRecords());
    return { shift: w.__layoutShift, sources: w.__shifts };
  });
