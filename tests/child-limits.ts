const CHILD_TIMEOUT_MS = 60_000;

/** Spread into a child_process call so a hung child fails the test instead of the run. */
export const CHILD_LIMITS = {
  timeout: CHILD_TIMEOUT_MS,
  killSignal: 'SIGKILL',
} as const;
