import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import {
  escapeHtml,
  PLAYER_ENTRY_PATH,
  toIdentifier,
} from '@richardmcquiston01/lms-package-maker-player';

/** The publisher's id for the course (cmi5 section 13.1.1): a stable URN. */
export function cmi5CourseId(course: CourseModel): string {
  return `urn:lms-package-maker:course:${toIdentifier(course.id)}`;
}

/**
 * The publisher's id for the assignable unit. The LMS makes up its own
 * `activityId` for launches; this one only identifies the AU in the course
 * structure.
 */
export function cmi5AuId(course: CourseModel): string {
  return `urn:lms-package-maker:au:${toIdentifier(course.id)}`;
}

/**
 * Builds `cmi5.xml`: one course holding one assignable unit (AU) that launches
 * the whole course player. A course that finishes by passing the quiz is
 * `moveOn="Passed"` with its pass mark as `masteryScore` (0 to 1); one that
 * finishes by viewing every page is `moveOn="Completed"`.
 */
export function buildCmi5CourseStructure(course: CourseModel): string {
  const language: string = escapeHtml(course.language);
  const title: string = escapeHtml(course.title);
  const description: string = escapeHtml(
    course.description === '' ? course.title : course.description
  );
  const moveOn: string =
    course.completion.kind === 'passQuiz'
      ? ` moveOn="Passed" masteryScore="${course.completion.minScorePercent / 100}"`
      : ' moveOn="Completed"';
  return `<?xml version="1.0" encoding="utf-8"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="${escapeHtml(cmi5CourseId(course))}">
    <title>
      <langstring lang="${language}">${title}</langstring>
    </title>
    <description>
      <langstring lang="${language}">${description}</langstring>
    </description>
  </course>
  <au id="${escapeHtml(cmi5AuId(course))}"${moveOn} launchMethod="AnyWindow" activityType="http://adlnet.gov/expapi/activities/course">
    <title>
      <langstring lang="${language}">${title}</langstring>
    </title>
    <description>
      <langstring lang="${language}">${description}</langstring>
    </description>
    <url>${PLAYER_ENTRY_PATH}</url>
  </au>
</courseStructure>
`;
}
