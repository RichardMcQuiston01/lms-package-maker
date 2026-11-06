import {
  validateCourseModel,
  type CourseModel,
  type Result,
} from '@richardmcquiston01/lms-package-maker-model';
import { runtimeSource } from '@richardmcquiston01/lms-package-maker-runtime';
import type { PlayerConfig, QuizConfig, QuizQuestionConfig } from './config.js';
import { escapeHtml, jsonForScript } from './escape.js';
import { playerClientSource } from './playerClientSource.generated.js';
import { renderPageQuestions } from './questionsHtml.js';
import { playerCss } from './styles.js';

export interface PlayerOptions {
  /** Extra files for the package, such as uploaded media. Paths start with `media/`. */
  readonly assets?: ReadonlyMap<string, Uint8Array>;
}

const ASSET_PATH_PATTERN = /^media\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

function checkAssetPaths(
  assets: ReadonlyMap<string, Uint8Array> | undefined
): string[] {
  const errors: string[] = [];
  for (const path of assets?.keys() ?? []) {
    if (!ASSET_PATH_PATTERN.test(path) || path.split('/').includes('..')) {
      errors.push(
        `asset path '${path}' must start with 'media/' and use only letters, digits, '.', '_', '-' and '/'`
      );
    }
  }
  return errors;
}

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

/** What the player script needs to mark answers; null when there are no questions. */
function buildQuizConfig(course: CourseModel): QuizConfig | null {
  const questions: QuizQuestionConfig[] = [];
  let pageIndex = 0;
  for (const courseModule of course.modules) {
    for (const page of courseModule.pages) {
      for (const question of page.questions ?? []) {
        questions.push({
          pageIndex,
          kind: question.kind,
          points: question.points,
          choiceCount: question.choices.length,
          correct: question.correctChoiceIds.map((id: string): number =>
            question.choices.findIndex((choice): boolean => choice.id === id)
          ),
        });
      }
      pageIndex += 1;
    }
  }
  if (questions.length === 0) {
    return null;
  }
  return {
    passPercent:
      course.completion.kind === 'passQuiz'
        ? course.completion.minScorePercent
        : null,
    questions,
  };
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
  let questionIndex = 0;
  const sections: string[] = [];
  for (const courseModule of course.modules) {
    for (const page of courseModule.pages) {
      // Page HTML is authored content; sanitising it is the editor's job.
      sections.push(
        `<section class="lpm-page" data-page-index="${pageIndex}" aria-label="${escapeHtml(page.title)}" hidden>\n<h2>${escapeHtml(page.title)}</h2>\n${page.html}\n${renderPageQuestions(page, questionIndex)}\n</section>`
      );
      questionIndex += page.questions?.length ?? 0;
      pageIndex += 1;
    }
  }
  return sections.join('\n');
}

/**
 * Builds the static player: `index.html`, a stylesheet, the LMS runtime and
 * the player script. Standard-specific exporters add their own descriptor.
 */
export function buildPlayerFiles(
  course: CourseModel,
  options: PlayerOptions = {}
): Result<PlayerFiles> {
  const errors: string[] = [
    ...checkCourse(course),
    ...checkAssetPaths(options.assets),
  ];
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const config: PlayerConfig = {
    title: course.title,
    pages: course.modules.flatMap((courseModule) =>
      courseModule.pages.map((page) => ({ id: page.id, title: page.title }))
    ),
    completion: course.completion.kind,
    quiz: buildQuizConfig(course),
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
<p id="lpm-quiz-summary" role="status" hidden></p>
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
  for (const [path, bytes] of options.assets ?? []) {
    files.set(path, bytes);
  }
  return { ok: true, value: files };
}
