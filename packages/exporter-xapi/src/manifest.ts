import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import {
  escapeHtml,
  PLAYER_ENTRY_PATH,
  toIdentifier,
} from '@richardmcquiston01/lms-package-maker-player';

/**
 * The xAPI Activity id of the course: a URN built from the course id, stable
 * across exports so an LRS sees the same Activity every time.
 */
export function xapiActivityId(course: CourseModel): string {
  return `urn:lms-package-maker:course:${toIdentifier(course.id)}`;
}

/**
 * Builds the `tincan.xml` that LRS platforms read to import an xAPI (TinCan)
 * package: one course Activity with the player as its launch file.
 */
export function buildTincanManifest(course: CourseModel): string {
  const language: string = escapeHtml(course.language);
  const title: string = escapeHtml(course.title);
  const description: string = escapeHtml(
    course.description === '' ? course.title : course.description
  );
  return `<?xml version="1.0" encoding="utf-8"?>
<tincan xmlns="http://projecttincan.com/tincan.xsd">
  <activities>
    <activity id="${escapeHtml(xapiActivityId(course))}" type="http://adlnet.gov/expapi/activities/course">
      <name lang="${language}">${title}</name>
      <description lang="${language}">${description}</description>
      <launch lang="${language}">${PLAYER_ENTRY_PATH}</launch>
    </activity>
  </activities>
</tincan>
`;
}
