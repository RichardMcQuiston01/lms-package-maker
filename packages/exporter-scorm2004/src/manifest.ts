import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import {
  escapeHtml,
  PLAYER_ASSET_PATHS,
  PLAYER_ENTRY_PATH,
  toIdentifier,
} from '@richardmcquiston01/lms-package-maker-player';

/**
 * Builds a SCORM 2004 (4th Edition) `imsmanifest.xml` with one SCO that
 * launches the whole course. Module and page navigation happens inside the
 * player, so the manifest carries no sequencing except the pass mark.
 *
 * With a pass mark the primary objective declares it as a minimum normalized
 * measure (0 to 1) and lets the LMS derive success from the reported scaled
 * score, the SCORM 2004 counterpart of SCORM 1.2's `masteryscore`.
 */
export function buildScorm2004Manifest(
  course: CourseModel,
  assetPaths: readonly string[] = []
): string {
  const courseId: string = toIdentifier(course.id);
  const title: string = escapeHtml(course.title);
  const sequencing: string =
    course.completion.kind === 'passQuiz'
      ? `
        <imsss:sequencing>
          <imsss:objectives>
            <imsss:primaryObjective objectiveID="PRIMARYOBJ" satisfiedByMeasure="true">
              <imsss:minNormalizedMeasure>${course.completion.minScorePercent / 100}</imsss:minNormalizedMeasure>
            </imsss:primaryObjective>
          </imsss:objectives>
        </imsss:sequencing>`
      : '';
  const files: string = [
    PLAYER_ENTRY_PATH,
    ...PLAYER_ASSET_PATHS,
    ...assetPaths,
  ]
    .map((path: string): string => `      <file href="${escapeHtml(path)}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="MANIFEST-${courseId}" version="1"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"
  xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"
  xmlns:imsss="http://www.imsglobal.org/xsd/imsss"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd http://www.adlnet.org/xsd/adlseq_v1p3 adlseq_v1p3.xsd http://www.adlnet.org/xsd/adlnav_v1p3 adlnav_v1p3.xsd http://www.imsglobal.org/xsd/imsss imsss_v1p0.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
  </metadata>
  <organizations default="ORG-${courseId}">
    <organization identifier="ORG-${courseId}">
      <title>${title}</title>
      <item identifier="ITEM-${courseId}" identifierref="RES-${courseId}" isvisible="true">
        <title>${title}</title>${sequencing}
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-${courseId}" type="webcontent" adlcp:scormType="sco" href="${PLAYER_ENTRY_PATH}">
${files}
    </resource>
  </resources>
</manifest>
`;
}
