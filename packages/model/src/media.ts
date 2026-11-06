import type { CourseModel, Module, Page } from './types.js';

/**
 * Pages refer to uploaded media with `media:<id>` in a `src` attribute, such as
 * `<img src="media:0b6f...">`. Exporters replace each reference with the path
 * of the file inside the package, so the model never contains file paths.
 */
const MEDIA_SOURCE_PATTERN =
  /\bsrc="media:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi;

/** Media ids used in a piece of HTML, in order and without repeats. */
export function findMediaReferences(html: string): string[] {
  const ids: string[] = [];
  for (const match of html.matchAll(MEDIA_SOURCE_PATTERN)) {
    const id: string = (match[1] ?? '').toLowerCase();
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Replaces `src="media:<id>"` with `src="<path>"`. A reference whose id has no
 * path is left as it is, so callers should check for missing media first.
 */
export function rewriteMediaReferences(
  html: string,
  pathForId: (mediaId: string) => string | undefined
): string {
  return html.replace(
    MEDIA_SOURCE_PATTERN,
    (whole: string, id: string): string => {
      const path: string | undefined = pathForId(id.toLowerCase());
      return path === undefined ? whole : `src="${path}"`;
    }
  );
}

export interface MediaUse {
  readonly mediaId: string;
  readonly pageId: string;
  readonly pageTitle: string;
}

/** Every place in a course that uses uploaded media. */
export function collectCourseMediaUses(course: CourseModel): MediaUse[] {
  const uses: MediaUse[] = [];
  for (const courseModule of course.modules) {
    for (const page of courseModule.pages) {
      for (const mediaId of findMediaReferences(page.html)) {
        uses.push({ mediaId, pageId: page.id, pageTitle: page.title });
      }
    }
  }
  return uses;
}

/** A copy of the course with every media reference rewritten. */
export function rewriteCourseMedia(
  course: CourseModel,
  pathForId: (mediaId: string) => string | undefined
): CourseModel {
  return {
    ...course,
    modules: course.modules.map((courseModule: Module): Module => ({
      ...courseModule,
      pages: courseModule.pages.map((page: Page): Page => ({
        ...page,
        html: rewriteMediaReferences(page.html, pathForId),
      })),
    })),
  };
}
