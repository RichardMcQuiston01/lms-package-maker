import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import {
  PLAYER_ENTRY_PATH,
  toIdentifier,
} from '@richardmcquiston01/lms-package-maker-player';

/** The id of the one assignable unit (AU) in the course. */
export const AICC_AU_ID = 'A1';

/** The base name of the four course description files. */
export const AICC_FILE_BASE = 'course';

const MAX_COURSE_ID = 64;

/** One line of text: AICC files are line based, so line breaks become spaces. */
function oneLine(value: string): string {
  return value.replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

/** A CSV field in double quotes, with inner quotes doubled. */
function quoted(value: string): string {
  return `"${oneLine(value).replace(/"/g, '""')}"`;
}

/** The course id AICC files use: letters, digits, `_`, `-` and `.`. */
export function aiccCourseId(course: CourseModel): string {
  return toIdentifier(course.id).slice(0, MAX_COURSE_ID);
}

/** The four AICC course description files, as text with CRLF line ends. */
export interface AiccFiles {
  /** `.crs`: the course. */
  readonly course: string;
  /** `.au`: the assignable units. */
  readonly assignableUnits: string;
  /** `.des`: titles and descriptions. */
  readonly descriptors: string;
  /** `.cst`: which blocks hold which units. */
  readonly structure: string;
}

const lines = (rows: readonly string[]): string => `${rows.join('\r\n')}\r\n`;

/**
 * Builds the AICC course description files (level 1) for a course that is one
 * assignable unit launching the whole player. A course that finishes by
 * passing the quiz gets the pass mark (0 to 100) as `mastery_score`.
 */
export function buildAiccFiles(course: CourseModel): AiccFiles {
  const description: string = oneLine(
    course.description === '' ? course.title : course.description
  );
  const mastery: string =
    course.completion.kind === 'passQuiz'
      ? String(course.completion.minScorePercent)
      : '';
  return {
    course: lines([
      '[Course]',
      'Course_Creator=lms-package-maker',
      `Course_ID=${aiccCourseId(course)}`,
      'Course_System=HTML',
      `Course_Title=${oneLine(course.title)}`,
      'Level=1',
      'Max_Fields_CST=2',
      'Total_AUs=1',
      'Total_Blocks=0',
      'Version=3.5',
      '[Course_Behavior]',
      'Max_Normal=1',
      '[Course_Description]',
      // A line that starts with "[" would read as the next section.
      description.replace(/^\[/, '('),
    ]),
    assignableUnits: lines([
      [
        'system_id',
        'type',
        'command_line',
        'max_time_allowed',
        'time_limit_action',
        'file_name',
        'max_score',
        'mastery_score',
        'system_vendor',
        'core_vendor',
        'web_launch',
        'au_password',
      ]
        .map(quoted)
        .join(','),
      [
        quoted(AICC_AU_ID),
        '""',
        '""',
        quoted('00:00:00'),
        quoted('C,N'),
        quoted(PLAYER_ENTRY_PATH),
        '100',
        mastery,
        '""',
        '""',
        '""',
        '""',
      ].join(','),
    ]),
    descriptors: lines([
      ['system_id', 'developer_id', 'title', 'description']
        .map(quoted)
        .join(','),
      [
        quoted(AICC_AU_ID),
        quoted(aiccCourseId(course)),
        quoted(course.title),
        quoted(description),
      ].join(','),
    ]),
    structure: lines([
      ['block', 'member'].map(quoted).join(','),
      [quoted('ROOT'), quoted(AICC_AU_ID)].join(','),
    ]),
  };
}
