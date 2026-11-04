import {
  validateCourseModel,
  type CourseModel,
  type Result,
} from '@richardmcquiston01/lms-package-maker-model';
import { runtimeSource } from '@richardmcquiston01/lms-package-maker-runtime';
import type { PlayerConfig } from './config.js';
import { escapeHtml, jsonForScript } from './escape.js';
import { playerClientSource } from './playerClientSource.generated.js';
import { playerCss } from './styles.js';

/** Files of the player, keyed by forward-slash relative path. */
export type PlayerFiles = Map<string, Uint8Array>;

const encoder: TextEncoder = new TextEncoder();

/** Relative path of the page that LMSs should launch. */
export const PLAYER_ENTRY_PATH = 'index.html';
export const PLAYER_ASSET_PATHS: readonly string[] = [
  'assets/player.css',
  'assets/runtime.js',
  'assets/player.js',
];

function checkCourse(course: CourseModel): readonly string[] {
  const validated: Result<CourseModel> = validateCourseModel(course);
  if (!validated.ok) {
    return validated.errors;
  }
  const errors: string[] = [];
  if (course.completion.kind !== 'viewAll') {
    errors.push(
      `course.completion.kind '${course.completion.kind}' needs quiz content, which the Course Model does not have yet; use 'viewAll'`
    );
  }
  const seen = new Set<string>();
  for (const courseModule of course.modules) {
    for (const page of courseModule.pages) {
      if (seen.has(page.id)) {
        errors.push(
          `page id '${page.id}' is used more than once; page ids must be unique across the course`
        );
      }
      seen.add(page.id);
    }
  }
  return errors;
}

function renderNav(course: CourseModel): string {
  let pageIndex = 0;
  const groups: string[] = course.modules.map((courseModule): string => {
    const items: string[] = courseModule.pages.map((page): string => {
      const item = `<li><button type="button" data-nav-index="${pageIndex}">${escapeHtml(page.title)}</button></li>`;
      pageIndex += 1;
      return item;
    });
    return `<h2>${escapeHtml(courseModule.title)}</h2><ol>${items.join('')}</ol>`;
  });
  return groups.join('\n');
}

function renderPages(course: CourseModel): string {
  let pageIndex = 0;
  const sections: string[] = [];
  for (const courseModule of course.modules) {
    for (const page of courseModule.pages) {
      // Page HTML is authored content; sanitising it is the editor's job.
      sections.push(
        `<section class="lpm-page" data-page-index="${pageIndex}" aria-label="${escapeHtml(page.title)}" hidden>\n<h2>${escapeHtml(page.title)}</h2>\n${page.html}\n</section>`
      );
      pageIndex += 1;
    }
  }
  return sections.join('\n');
}

/**
 * Builds the static player: `index.html`, a stylesheet, the LMS runtime and
 * the player script. Standard-specific exporters add their own descriptor.
 */
export function buildPlayerFiles(course: CourseModel): Result<PlayerFiles> {
  const errors: readonly string[] = checkCourse(course);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const config: PlayerConfig = {
    title: course.title,
    pages: course.modules.flatMap((courseModule) =>
      courseModule.pages.map((page) => ({ id: page.id, title: page.title }))
    ),
  };
  const html = `<!doctype html>
<html lang="${escapeHtml(course.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(course.title)}</title>
<link rel="stylesheet" href="assets/player.css">
</head>
<body>
<nav class="lpm-nav" aria-label="Course contents">
<h1>${escapeHtml(course.title)}</h1>
${renderNav(course)}
</nav>
<div class="lpm-main">
<progress max="1" value="0" aria-label="Course progress"></progress>
<p id="lpm-status" role="status"></p>
${renderPages(course)}
<div class="lpm-controls">
<button type="button" data-action="prev">Previous</button>
<button type="button" data-action="next">Next</button>
</div>
</div>
<script type="application/json" id="lpm-config">${jsonForScript(config)}</script>
<script src="assets/runtime.js"></script>
<script src="assets/player.js"></script>
</body>
</html>
`;
  const files: PlayerFiles = new Map<string, Uint8Array>([
    [PLAYER_ENTRY_PATH, encoder.encode(html)],
    ['assets/player.css', encoder.encode(playerCss)],
    ['assets/runtime.js', encoder.encode(runtimeSource)],
    ['assets/player.js', encoder.encode(playerClientSource)],
  ]);
  return { ok: true, value: files };
}
