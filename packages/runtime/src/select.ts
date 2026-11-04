import { createStandaloneAdapter } from './core.js';
import { createHtml5Adapter, type MessageTarget } from './html5.js';
import {
  createScorm12Adapter,
  findScorm12Api,
  type ApiWindow,
  type Scorm12Api,
} from './scorm12.js';
import type { RuntimeAdapter } from './types.js';

/** The part of `window` adapter selection needs. */
export interface HostWindow extends ApiWindow {
  parent?: (ApiWindow & MessageTarget) | null;
}

/**
 * Picks the first LMS connection that is available: a SCORM 1.2 API, then a
 * parent frame to post to, otherwise a standalone no-op.
 */
export function selectAdapter(host: HostWindow): RuntimeAdapter {
  const api: Scorm12Api | null = findScorm12Api(host);
  if (api !== null) {
    return createScorm12Adapter(api);
  }
  const parent: (ApiWindow & MessageTarget) | null | undefined = host.parent;
  if (parent !== undefined && parent !== null && parent !== host) {
    return createHtml5Adapter(parent);
  }
  return createStandaloneAdapter();
}
