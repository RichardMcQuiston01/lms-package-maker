import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';

export const sampleCourse: CourseModel = {
  modelVersion: 1,
  id: 'conformance-course',
  title: 'Conformance Course',
  description: 'Three pages in one module',
  language: 'en',
  completion: { kind: 'viewAll' },
  modules: [
    {
      id: 'm1',
      title: 'Intro',
      pages: [
        { id: 'p1', title: 'One', html: '<p>one</p>' },
        { id: 'p2', title: 'Two', html: '<p>two</p>' },
        { id: 'p3', title: 'Three', html: '<p>three</p>' },
      ],
    },
  ],
};
