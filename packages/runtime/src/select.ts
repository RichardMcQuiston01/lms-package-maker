import { createStandaloneAdapter } from './core.js';
import { createHtml5Adapter, type MessageTarget } from './html5.js';
import {
  createScorm12Adapter,
  findScorm12Api,
  type ApiWindow,
  type Scorm12Api,
} from './scorm12.js';
import {
  createUnavailableAdapter,
  createXapiAdapter,
  newUuid,
  parseXapiLaunch,
  type XapiContent,
  type XapiEnvironment,
  type XapiLaunch,
} from './xapi.js';
import {
  createScorm2004Adapter,
  findScorm2004Api,
  type Scorm2004Api,
} from './scorm2004.js';
import type { Result, RuntimeAdapter } from './types.js';

/** The part of `window` adapter selection needs. */
export interface HostWindow extends ApiWindow {
  parent?: (ApiWindow & MessageTarget) | null;
}

/** The LMS API a package asks to try first. */
export type PreferredApi = 'scorm12' | 'scorm2004' | 'xapi';

/** What the xAPI adapter needs to know about its surroundings. */
export interface XapiSetup {
  readonly content: XapiContent;
  /** The launch URL's query string, such as `window.location.search`. */
  readonly search: string;
  readonly environment?: XapiEnvironment;
}

/**
 * Picks the first LMS connection that is available: the API the package asks
 * for first (default: SCORM 1.2, then SCORM 2004), then a parent frame to post
 * to, otherwise a standalone no-op. An LMS that offers both APIs is therefore
 * used through the one the package was built for.
 */
export function selectAdapter(
  host: HostWindow,
  preferred: PreferredApi = 'scorm12',
  xapi?: XapiSetup
): RuntimeAdapter {
  if (preferred === 'xapi' && xapi !== undefined) {
    const launch: Result<XapiLaunch | null> = parseXapiLaunch(xapi.search);
    if (!launch.ok) {
      return createUnavailableAdapter('xapi', launch.error);
    }
    if (launch.value !== null) {
      return createXapiAdapter(
        launch.value,
        xapi.content,
        xapi.environment ?? browserEnvironment()
      );
    }
    // Not launched from an LRS (a preview, or opened from disk): run standalone.
    return createStandaloneAdapter();
  }
  const api12: Scorm12Api | null = findScorm12Api(host);
  const api2004: Scorm2004Api | null = findScorm2004Api(host);
  const first: 'scorm12' | 'scorm2004' | null =
    preferred === 'scorm2004'
      ? api2004 !== null
        ? 'scorm2004'
        : api12 !== null
          ? 'scorm12'
          : null
      : api12 !== null
        ? 'scorm12'
        : api2004 !== null
          ? 'scorm2004'
          : null;
  if (first === 'scorm2004' && api2004 !== null) {
    return createScorm2004Adapter(api2004);
  }
  if (first === 'scorm12' && api12 !== null) {
    return createScorm12Adapter(api12);
  }
  const parent: (ApiWindow & MessageTarget) | null | undefined = host.parent;
  if (parent !== undefined && parent !== null && parent !== host) {
    return createHtml5Adapter(parent);
  }
  return createStandaloneAdapter();
}

function browserEnvironment(): XapiEnvironment {
  return {
    fetch: (url, init) => fetch(url, init),
    now: () => new Date(),
    newId: newUuid,
  };
}
