import { createRuntime } from './core.js';
import { selectAdapter, type HostWindow, type PreferredApi } from './select.js';
import type { ContentRuntime } from './types.js';

declare global {
  interface Window {
    LmsPackageRuntime?: ContentRuntime;
  }
}

/**
 * The player's `#lpm-config` script says which LMS API the package was built
 * for (`runtimeApi`); without it the runtime tries SCORM 1.2 first.
 */
function readPreferredApi(): PreferredApi {
  try {
    const text: string | null | undefined =
      document.getElementById('lpm-config')?.textContent;
    if (text !== null && text !== undefined) {
      const config: { runtimeApi?: unknown } = JSON.parse(text);
      if (config.runtimeApi === 'scorm2004') {
        return 'scorm2004';
      }
    }
  } catch {
    // Unreadable config: fall back to the default order.
  }
  return 'scorm12';
}

/** Browser entry: exposes the runtime for the adapter that fits this host. */
window.LmsPackageRuntime = createRuntime(
  selectAdapter(window as unknown as HostWindow, readPreferredApi())
);
