export const GLOBAL_RULE = '/*';

export const parseGlobalRule = (source: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  let inRule = false;

  for (const line of source.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    /* A rule line starts at column zero; its headers are indented. */
    if (!/^\s/.test(line)) {
      inRule = trimmed === GLOBAL_RULE;
      continue;
    }

    if (!inRule) continue;

    const separator = trimmed.indexOf(':');
    if (separator === -1) continue;

    headers[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim();
  }

  return headers;
};
