const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** A `frame` result: draw again on the next animation frame. */
export const NEXT_FRAME = 0;

/** A `frame` result: nothing to draw until `start()` is called. */
export const IDLE = Infinity;

export interface MotionLoopOptions {
  /**
   * Steps and draws. Returns when it next needs a frame: `NEXT_FRAME`, a later
   * `performance.now()` time to sleep until, or `IDLE`.
   */
  frame: (now: number) => number;
  /** Before the first frame after the loop was stopped or asleep. */
  resume?: (now: number) => void;
  /** The caller's own conditions, such as mounted and not paused. */
  canRun: () => boolean;
  /** Skips animation frames closer together than this. */
  maxFrameRate?: number;
  onReducedMotion?: (reduced: boolean) => void;
  onVisibility?: () => void;
}

interface ObserveOptions {
  onEntries?: (entries: IntersectionObserverEntry[]) => void;
  rootMargin?: string;
  /** Counts the targets as on screen until the observer first reports. */
  assumeOnScreen?: boolean;
}

export interface MotionLoop {
  /** Read from the media query by `connect()`. */
  reducedMotion: () => boolean;
  onScreen: () => boolean;
  running: () => boolean;
  /** Asks for a frame now, e.g. after input; does nothing while it cannot run. */
  start: () => void;
  stop: () => void;
  /** Runs only while one of `targets` is near the viewport or on it. */
  observe: (targets: readonly Element[], options?: ObserveOptions) => void;
  /** Reads and follows the reduced-motion preference. */
  connect: () => void;
  disconnect: () => void;
}

/* Lets a jittery 60Hz frame through a 30fps cap. */
const FRAME_SLACK_MS = 4;

/*
 * The requestAnimationFrame loop, reduced-motion query, on-screen observer and
 * tab visibility shared by the hero and the About cats. Stops whenever the tab is hidden.
 */
export const createMotionLoop = (options: MotionLoopOptions): MotionLoop => {
  let reduced = false;
  const minGapMs = options.maxFrameRate
    ? 1000 / options.maxFrameRate - FRAME_SLACK_MS
    : 0;

  let frame = 0;
  let wakeTimer = 0;
  let lastFrame = 0;
  let visible = new Set<Element>();
  let motionQuery: MediaQueryList | null = null;
  let viewObserver: IntersectionObserver | null = null;

  const onScreen = (): boolean => visible.size > 0;

  const running = (): boolean =>
    options.canRun() && !reduced && onScreen() && !document.hidden;

  const stop = (): void => {
    if (frame) cancelAnimationFrame(frame);
    window.clearTimeout(wakeTimer);
    frame = 0;
    wakeTimer = 0;
  };

  const tick = (now: number): void => {
    frame = 0;
    if (!running()) return;
    if (minGapMs > 0 && now - lastFrame < minGapMs) {
      frame = requestAnimationFrame(tick);
      return;
    }
    lastFrame = now;
    const wakeAt = options.frame(now);
    if (!running() || wakeAt === IDLE) return;
    const delay = wakeAt - performance.now();
    if (delay > 0) wakeTimer = window.setTimeout(start, delay);
    else frame = requestAnimationFrame(tick);
  };

  function start(): void {
    if (frame || !running()) return;
    window.clearTimeout(wakeTimer);
    wakeTimer = 0;
    const now = performance.now();
    lastFrame = now;
    options.resume?.(now);
    frame = requestAnimationFrame(tick);
  }

  const onPreferenceChange = (event: MediaQueryListEvent): void => {
    reduced = event.matches;
    if (event.matches) stop();
    options.onReducedMotion?.(event.matches);
    start();
  };

  const onVisibility = (): void => {
    options.onVisibility?.();
    if (document.hidden) stop();
    else start();
  };

  const observe: MotionLoop['observe'] = (
    targets,
    { onEntries, rootMargin, assumeOnScreen = false } = {},
  ) => {
    viewObserver?.disconnect();
    visible = assumeOnScreen ? new Set(targets) : new Set();
    viewObserver = new IntersectionObserver(
      (entries) => {
        const next = new Set(visible);
        for (const entry of entries) {
          if (entry.isIntersecting) next.add(entry.target);
          else next.delete(entry.target);
        }
        visible = next;
        onEntries?.(entries);
        if (onScreen()) start();
        else stop();
      },
      rootMargin ? { rootMargin } : {},
    );
    for (const target of targets) viewObserver.observe(target);
    document.addEventListener('visibilitychange', onVisibility);
  };

  const connect = (): void => {
    motionQuery = window.matchMedia(REDUCED_MOTION);
    reduced = motionQuery.matches;
    motionQuery.addEventListener('change', onPreferenceChange);
  };

  const disconnect = (): void => {
    stop();
    motionQuery?.removeEventListener('change', onPreferenceChange);
    viewObserver?.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
  };

  return {
    reducedMotion: () => reduced,
    onScreen,
    running,
    start,
    stop,
    observe,
    connect,
    disconnect,
  };
};
