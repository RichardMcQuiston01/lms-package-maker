import { createRuntime } from './core.js';
import { selectAdapter, type HostWindow } from './select.js';
import type { ContentRuntime } from './types.js';

declare global {
  interface Window {
    LmsPackageRuntime?: ContentRuntime;
  }
}

/** Browser entry: exposes the runtime for the adapter that fits this host. */
window.LmsPackageRuntime = createRuntime(
  selectAdapter(window as unknown as HostWindow)
);
