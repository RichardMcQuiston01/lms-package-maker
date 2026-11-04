import type { PlayerConfig } from './config.js';
import type {
  ContentRuntime,
  InitialState,
  Result,
} from '@richardmcquiston01/lms-package-maker-runtime';

/**
 * Browser script of the generated player. It shows one page at a time, tracks
 * which pages were visited, and reports progress through `LmsPackageRuntime`.
 * The course is complete once every page has been visited.
 */

declare global {
  interface Window {
    LmsPackageRuntime?: ContentRuntime;
  }
}

function queryAll<T extends Element>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

function showStatus(message: string): void {
  const status: HTMLElement | null = document.getElementById('lpm-status');
  if (status !== null) {
    status.textContent = message;
  }
}

function readConfig(): PlayerConfig | null {
  const element: HTMLElement | null = document.getElementById('lpm-config');
  if (element === null) {
    showStatus('Player configuration (#lpm-config) is missing from this page.');
    return null;
  }
  try {
    return JSON.parse(element.textContent ?? '') as PlayerConfig;
  } catch (cause: unknown) {
    showStatus(`Player configuration is not valid JSON: ${String(cause)}`);
    return null;
  }
}

/** Visited pages as a string of 0 and 1, one character per page. */
function encodeVisited(visited: readonly boolean[]): string {
  return visited.map((seen: boolean): string => (seen ? '1' : '0')).join('');
}

function decodeVisited(encoded: string | null, pageCount: number): boolean[] {
  const visited: boolean[] = new Array<boolean>(pageCount).fill(false);
  if (encoded !== null && /^[01]*$/.test(encoded)) {
    for (
      let index = 0;
      index < Math.min(pageCount, encoded.length);
      index += 1
    ) {
      visited[index] = encoded.charAt(index) === '1';
    }
  }
  return visited;
}

function report(label: string, result: Result<unknown>): void {
  if (!result.ok) {
    console.error(`[lms-package] ${label}: ${result.error}`);
  }
}

function start(): void {
  const config: PlayerConfig | null = readConfig();
  if (config === null) {
    return;
  }
  const runtime: ContentRuntime | undefined = window.LmsPackageRuntime;
  if (runtime === undefined) {
    showStatus(
      'The LMS runtime (assets/runtime.js) did not load, so progress cannot be saved.'
    );
    return;
  }
  const pages: HTMLElement[] = queryAll<HTMLElement>('.lpm-page');
  const navButtons: HTMLButtonElement[] =
    queryAll<HTMLButtonElement>('[data-nav-index]');
  const progress: HTMLProgressElement | null =
    document.querySelector('progress');
  if (pages.length !== config.pages.length) {
    showStatus(
      `Expected ${config.pages.length} pages but found ${pages.length} in the document.`
    );
    return;
  }

  const initial: Result<InitialState> = runtime.init();
  const state: InitialState = initial.ok
    ? initial.value
    : { location: null, suspendData: null, status: null };
  if (!initial.ok) {
    showStatus(`Progress will not be saved: ${initial.error}`);
  }
  const visited: boolean[] = decodeVisited(state.suspendData, pages.length);
  let current: number = Math.max(
    0,
    config.pages.findIndex((page): boolean => page.id === state.location)
  );

  const show = (index: number): void => {
    current = index;
    visited[index] = true;
    pages.forEach((page: HTMLElement, pageIndex: number): void => {
      page.hidden = pageIndex !== index;
    });
    navButtons.forEach((button: HTMLButtonElement): void => {
      if (Number(button.dataset['navIndex']) === index) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });
    const seenCount: number = visited.filter(Boolean).length;
    if (progress !== null) {
      progress.value = seenCount / pages.length;
    }
    const page = config.pages[index];
    if (page !== undefined) {
      report('setLocation', runtime.setLocation(page.id));
    }
    report('setSuspendData', runtime.setSuspendData(encodeVisited(visited)));
    report('setProgress', runtime.setProgress(seenCount / pages.length));
    if (seenCount === pages.length) {
      report('complete', runtime.complete());
      showStatus('Course complete.');
    } else {
      showStatus(`Page ${index + 1} of ${pages.length}`);
    }
  };

  navButtons.forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void =>
      show(Number(button.dataset['navIndex']))
    );
  });
  for (const [action, step] of [
    ['prev', -1],
    ['next', 1],
  ] as const) {
    document
      .querySelector(`[data-action="${action}"]`)
      ?.addEventListener('click', (): void => {
        show(Math.min(pages.length - 1, Math.max(0, current + step)));
      });
  }

  let ended = false;
  const end = (): void => {
    if (!ended) {
      ended = true;
      report('terminate', runtime.terminate());
    }
  };
  window.addEventListener('pagehide', end);
  window.addEventListener('beforeunload', end);

  show(current);
}

start();
