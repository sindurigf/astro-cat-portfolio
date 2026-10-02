import type { Page } from '@playwright/test';

/** The walk's stops so far, by identity: two links with the same text are two stops. */
interface WalkState {
  visited: Element[];
}

declare global {
  interface Window {
    __tabWalk?: WalkState;
  }
}

/*
 * `<video controls>` holds one tab stop per native control, all reported as the
 * element, so a repeat straight after itself is still inside the player.
 */
const visitFocused = (
  page: Page,
): Promise<'none' | 'repeat' | 'media' | 'new'> =>
  page.evaluate(() => {
    const el = document.activeElement;
    const state = window.__tabWalk;
    if (!state) throw new Error('the walk state was not reset.');
    if (!el || el === document.body || el === document.documentElement) {
      return 'none';
    }
    if (
      el.matches('video[controls], audio[controls]') &&
      state.visited.at(-1) === el
    ) {
      return 'media';
    }
    if (state.visited.includes(el)) return 'repeat';
    state.visited.push(el);
    return 'new';
  });

/**
 * WebKit scrolls to a focused element from a zero-delay timer, so a task queued
 * after the key press runs after it (`LocalFrameView::scheduleScrollToFocusedElement`).
 * Then two frames with unchanged `scrollY`, within a frame budget.
 */
const SETTLE_FRAMES = 60;

export const settleFocusScroll = (page: Page): Promise<void> =>
  page.evaluate(async (budget) => {
    await new Promise((revealed) => setTimeout(revealed, 0));
    return new Promise<void>((resolve) => {
      let previous: number | null = null;
      let frames = 0;
      const check = () => {
        const y = window.scrollY;
        if (previous === y) {
          resolve();
          return;
        }
        previous = y;
        frames += 1;
        if (frames >= budget) {
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }, SETTLE_FRAMES);

/**
 * Reads each focused stop and presses `key`, from the current focus until focus
 * leaves the document or comes back to a stop already read. Throws at `max`.
 */
export const tabWalk = async <T>(
  page: Page,
  read: () => Promise<T>,
  {
    key = 'Tab',
    max,
    settle,
  }: {
    key?: 'Tab' | 'Shift+Tab';
    max: number;
    settle?: () => Promise<unknown>;
  },
): Promise<T[]> => {
  await page.evaluate(() => {
    window.__tabWalk = { visited: [] };
  });
  const stops: T[] = [];

  for (let i = 0; i < max; i += 1) {
    await settle?.();
    const visit = await visitFocused(page);
    if (visit === 'none' || visit === 'repeat') return stops;
    if (visit === 'new') stops.push(await read());
    await page.keyboard.press(key);
  }

  throw new Error(
    `the ${key} walk hit ${max} stops without coming round: a focus trap, or raise the limit.`,
  );
};
