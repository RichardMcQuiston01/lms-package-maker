import { describe, expect, test } from 'bun:test';
import {
  collectCourseMediaUses,
  findMediaReferences,
  rewriteCourseMedia,
  rewriteMediaReferences,
} from './media.js';
import type { CourseModel } from './types.js';

const ID_A = '0b6f2f4e-1111-4111-8111-aaaaaaaaaaaa';
const ID_B = '0b6f2f4e-2222-4222-8222-bbbbbbbbbbbb';

describe('media references', () => {
  test('finds each id once, in order, whatever its case', () => {
    const html = `<img src="media:${ID_A}"><video src="media:${ID_B.toUpperCase()}"></video><img src="media:${ID_A}">`;
    expect(findMediaReferences(html)).toEqual([ID_A, ID_B]);
  });

  test('ignores anything that is not a media source', () => {
    expect(
      findMediaReferences(
        `<a href="media:${ID_A}">x</a><img src="https://example.com/${ID_A}"><p>media:${ID_A}</p><img src="media:not-a-uuid">`
      )
    ).toEqual([]);
  });

  test('rewrites known ids and leaves unknown ones alone', () => {
    const html = `<img src="media:${ID_A}" alt="a"><img src="media:${ID_B}" alt="b">`;
    const result: string = rewriteMediaReferences(html, (id) =>
      id === ID_A ? 'media/a.png' : undefined
    );
    expect(result).toBe(
      `<img src="media/a.png" alt="a"><img src="media:${ID_B}" alt="b">`
    );
  });

  test('collects uses with the page that holds them, and rewrites a copy', () => {
    const course: CourseModel = {
      modelVersion: 1,
      id: 'c',
      title: 'C',
      description: '',
      language: 'en',
      completion: { kind: 'viewAll' },
      modules: [
        {
          id: 'm',
          title: 'M',
          pages: [
            { id: 'p1', title: 'One', html: `<img src="media:${ID_A}">` },
            { id: 'p2', title: 'Two', html: '<p>none</p>' },
          ],
        },
      ],
    };
    expect(collectCourseMediaUses(course)).toEqual([
      { mediaId: ID_A, pageId: 'p1', pageTitle: 'One' },
    ]);
    const rewritten: CourseModel = rewriteCourseMedia(
      course,
      () => 'media/x.png'
    );
    expect(rewritten.modules[0]?.pages[0]?.html).toBe(
      '<img src="media/x.png">'
    );
    expect(course.modules[0]?.pages[0]?.html).toBe(`<img src="media:${ID_A}">`);
  });
});
