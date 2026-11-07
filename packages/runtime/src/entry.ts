import { createRuntime } from './core.js';
import {
  selectAdapter,
  type HostWindow,
  type PreferredApi,
  type AiccSetup,
  type Cmi5Setup,
  type XapiSetup,
} from './select.js';
import type { ContentRuntime } from './types.js';

declare global {
  interface Window {
    LmsPackageRuntime?: ContentRuntime;
  }
}

interface BuiltFor {
  readonly preferred: PreferredApi;
  readonly xapi?: XapiSetup;
  readonly cmi5?: Cmi5Setup;
  readonly aicc?: AiccSetup;
}

/**
 * The player's `#lpm-config` script says which LMS API the package was built
 * for (`runtimeApi`); without it the runtime tries SCORM 1.2 first. For xAPI
 * it also names the course activity (`xapi.activityId`).
 */
function readBuiltFor(): BuiltFor {
  try {
    const text: string | null | undefined =
      document.getElementById('lpm-config')?.textContent;
    if (text !== null && text !== undefined) {
      const config: {
        runtimeApi?: unknown;
        title?: unknown;
        language?: unknown;
        xapi?: { activityId?: unknown };
      } = JSON.parse(text);
      if (config.runtimeApi === 'aicc') {
        return {
          preferred: 'aicc',
          aicc: { search: window.location.search },
        };
      }
      if (config.runtimeApi === 'cmi5') {
        return {
          preferred: 'cmi5',
          cmi5: {
            search: window.location.search,
            content: {
              name: typeof config.title === 'string' ? config.title : '',
              language:
                typeof config.language === 'string' ? config.language : 'en',
            },
          },
        };
      }
      if (config.runtimeApi === 'scorm2004') {
        return { preferred: 'scorm2004' };
      }
      if (
        config.runtimeApi === 'xapi' &&
        typeof config.xapi?.activityId === 'string'
      ) {
        return {
          preferred: 'xapi',
          xapi: {
            search: window.location.search,
            content: {
              activityId: config.xapi.activityId,
              name: typeof config.title === 'string' ? config.title : '',
              language:
                typeof config.language === 'string' ? config.language : 'en',
            },
          },
        };
      }
    }
  } catch {
    // Unreadable config: fall back to the default order.
  }
  return { preferred: 'scorm12' };
}

const builtFor: BuiltFor = readBuiltFor();

/** Browser entry: exposes the runtime for the adapter that fits this host. */
window.LmsPackageRuntime = createRuntime(
  selectAdapter(
    window as unknown as HostWindow,
    builtFor.preferred,
    builtFor.xapi,
    builtFor.cmi5,
    builtFor.aicc
  )
);
