import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import {
  escapeHtml,
  PLAYER_ASSET_PATHS,
  PLAYER_ENTRY_PATH,
} from '@richardmcquiston01/lms-package-maker-player';

/** Turns any text into a valid XML NCName fragment (letters, digits, `_-.`). */
export function toIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_');
}

/**
 * Builds a SCORM 1.2 `imsmanifest.xml` with one SCO that launches the whole
 * course. Module and page navigation happens inside the player.
 */
export function buildScorm12Manifest(
  course: CourseModel,
  assetPaths: readonly string[] = []
): string {
  const courseId: string = toIdentifier(course.id);
  const title: string = escapeHtml(course.title);
  // With a pass mark, tell the LMS about it (SCORM 1.2 `adlcp:masteryscore`).
  const masteryScore: string =
    course.completion.kind === 'passQuiz'
      ? `\n        <adlcp:masteryscore>${course.completion.minScorePercent}</adlcp:masteryscore>`
      : '';
  const files: string = [
    PLAYER_ENTRY_PATH,
    ...PLAYER_ASSET_PATHS,
    ...assetPaths,
  ]
    .map((path: string): string => `      <file href="${escapeHtml(path)}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="MANIFEST-${courseId}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-${courseId}">
    <organization identifier="ORG-${courseId}">
      <title>${title}</title>
      <item identifier="ITEM-${courseId}" identifierref="RES-${courseId}" isvisible="true">
        <title>${title}</title>${masteryScore}
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-${courseId}" type="webcontent" adlcp:scormtype="sco" href="${PLAYER_ENTRY_PATH}">
${files}
    </resource>
  </resources>
</manifest>
`;
}
