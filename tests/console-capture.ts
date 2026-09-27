type Level = 'log' | 'warn' | 'error';

export interface Captured<T> {
  value: T;
  /** Each call, its arguments joined by spaces, by level. */
  logged: Record<Level, string[]>;
}

/** Runs `run` with the given console levels recorded instead of printed. */
export const captureConsole = async <T>(
  levels: readonly Level[],
  run: () => Promise<T>,
): Promise<Captured<T>> => {
  const logged: Record<Level, string[]> = { log: [], warn: [], error: [] };
  const originals = levels.map((level) => [level, console[level]] as const);
  for (const level of levels) {
    console[level] = (...parts: unknown[]) => {
      logged[level].push(parts.map(String).join(' '));
    };
  }
  try {
    return { value: await run(), logged };
  } finally {
    for (const [level, original] of originals) console[level] = original;
  }
};
