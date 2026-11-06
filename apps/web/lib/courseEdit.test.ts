import { describe, expect, test } from 'bun:test';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import {
  addModule,
  addPage,
  findModuleOfPage,
  movePage,
  moveModule,
  removeModule,
  removePage,
  renameModule,
  updateCourseDetails,
  updatePage,
} from './courseEdit';

const course: CourseModel = {
  modelVersion: 1,
  id: 'c',
  title: 'Course',
  description: '',
  language: 'en',
  completion: { kind: 'viewAll' },
  modules: [
    {
      id: 'm1',
      title: 'One',
      pages: [
        { id: 'p1', title: 'A', html: '' },
        { id: 'p2', title: 'B', html: '' },
      ],
    },
    { id: 'm2', title: 'Two', pages: [{ id: 'p3', title: 'C', html: '' }] },
  ],
};

function unwrap(result: ReturnType<typeof removePage>): CourseModel {
  if (!result.ok) {
    throw new Error(result.errors.join('; '));
  }
  return result.value;
}

describe('course edits', () => {
  test('never change the course they are given', () => {
    const snapshot: string = JSON.stringify(course);
    addModule(course, 'm9', 'p9', 'Nine');
    unwrap(addPage(course, 'm1', 'p8', 'x'));
    unwrap(updatePage(course, 'p1', { title: 'Changed' }));
    unwrap(movePage(course, 'p1', 1));
    expect(JSON.stringify(course)).toBe(snapshot);
  });

  test('add a module with a first page', () => {
    const next: CourseModel = addModule(course, 'm3', 'p4', 'Three');
    expect(next.modules.at(-1)?.pages.map((page) => page.id)).toEqual(['p4']);
  });

  test('add, update and remove a page', () => {
    let next: CourseModel = unwrap(addPage(course, 'm2', 'p4', 'D'));
    next = unwrap(updatePage(next, 'p4', { html: '<p>x</p>' }));
    expect(findModuleOfPage(next, 'p4')?.pages.at(-1)?.html).toBe('<p>x</p>');
    next = unwrap(removePage(next, 'p4'));
    expect(findModuleOfPage(next, 'p4')).toBeUndefined();
  });

  test('refuse to remove the last page of a module, naming the module', () => {
    const result = removePage(course, 'p3');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("module 'Two'");
    }
  });

  test('refuse to remove the last module', () => {
    const single: CourseModel = unwrap(removeModule(course, 'm2'));
    expect(removeModule(single, 'm1').ok).toBe(false);
  });

  test('name the missing id when an edit targets something that is gone', () => {
    for (const result of [
      renameModule(course, 'nope', 'x'),
      addPage(course, 'nope', 'p', 'x'),
      updatePage(course, 'nope', {}),
      removePage(course, 'nope'),
      movePage(course, 'nope', 1),
      moveModule(course, 'nope', 1),
    ]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]).toContain("'nope'");
      }
    }
  });

  test('move pages and modules, staying put at the ends', () => {
    const moved: CourseModel = unwrap(movePage(course, 'p1', 1));
    expect(moved.modules[0]?.pages.map((page) => page.id)).toEqual([
      'p2',
      'p1',
    ]);
    expect(unwrap(movePage(course, 'p1', -1))).toBe(course);
    const reordered: CourseModel = unwrap(moveModule(course, 'm2', -1));
    expect(reordered.modules.map((entry) => entry.id)).toEqual(['m2', 'm1']);
    expect(unwrap(moveModule(course, 'm2', 1))).toBe(course);
  });

  test('update course details', () => {
    expect(updateCourseDetails(course, { title: 'New' }).title).toBe('New');
  });
});
