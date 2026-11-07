import type { Scorm12Api } from './scorm12.js';
import type { Scorm2004Api } from './scorm2004.js';

/** The part of `window` the API search walks. */
export interface ApiWindow {
  API?: Scorm12Api;
  API_1484_11?: Scorm2004Api;
  parent?: ApiWindow | null;
  opener?: ApiWindow | null;
}

const MAX_SEARCH_DEPTH = 500;

function searchParents<TApi>(
  start: ApiWindow,
  read: (host: ApiWindow) => TApi | undefined | null
): TApi | null {
  let current: ApiWindow = start;
  for (let depth = 0; depth < MAX_SEARCH_DEPTH; depth += 1) {
    // Reading any property of a cross-origin or sandboxed window can throw.
    try {
      const found: TApi | undefined | null = read(current);
      if (found !== undefined && found !== null) {
        return found;
      }
      const next: ApiWindow | null | undefined = current.parent;
      if (next === undefined || next === null || next === current) {
        return null;
      }
      current = next;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Finds an LMS API in this window, its parents, then its opener (the order
 * the SCORM run-time specifications describe). `read` picks the API object
 * from one window. Cross-origin frames that throw on access are skipped.
 */
export function findApi<TApi>(
  start: ApiWindow,
  read: (host: ApiWindow) => TApi | undefined | null
): TApi | null {
  const inParents: TApi | null = searchParents(start, read);
  if (inParents !== null) {
    return inParents;
  }
  let opener: ApiWindow | null | undefined;
  try {
    opener = start.opener;
  } catch {
    return null;
  }
  return opener !== undefined && opener !== null
    ? searchParents(opener, read)
    : null;
}
