import {
  QUESTION_LIMITS,
  type CompletionRule,
  type CourseModel,
  type Module,
  type Page,
  type Question,
  type Result,
} from '@richardmcquiston01/lms-package-maker-model';

/**
 * Pure, immutable edits of a Course Model. The editor calls these and never
 * changes a course in place, so every edit can be tested without a browser.
 * Edits that can fail return a Result that names what went wrong.
 */

export interface CourseDetails {
  readonly title: string;
  readonly description: string;
  readonly language: string;
}

function failure(message: string): Result<CourseModel> {
  return { ok: false, errors: [message] };
}

function mapModule(
  course: CourseModel,
  moduleId: string,
  change: (courseModule: Module) => Module
): CourseModel {
  return {
    ...course,
    modules: course.modules.map((courseModule: Module): Module =>
      courseModule.id === moduleId ? change(courseModule) : courseModule
    ),
  };
}

function findModule(course: CourseModel, moduleId: string): Module | undefined {
  return course.modules.find(
    (courseModule: Module): boolean => courseModule.id === moduleId
  );
}

/** Finds the module that holds a page. */
export function findModuleOfPage(
  course: CourseModel,
  pageId: string
): Module | undefined {
  return course.modules.find((courseModule: Module): boolean =>
    courseModule.pages.some((page: Page): boolean => page.id === pageId)
  );
}

export function updateCourseDetails(
  course: CourseModel,
  details: Partial<CourseDetails>
): CourseModel {
  return { ...course, ...details };
}

export function addModule(
  course: CourseModel,
  moduleId: string,
  pageId: string,
  title: string
): CourseModel {
  const firstPage: Page = { id: pageId, title: 'New page', html: '' };
  const newModule: Module = { id: moduleId, title, pages: [firstPage] };
  return { ...course, modules: [...course.modules, newModule] };
}

export function renameModule(
  course: CourseModel,
  moduleId: string,
  title: string
): Result<CourseModel> {
  if (findModule(course, moduleId) === undefined) {
    return failure(
      `module '${moduleId}' does not exist, so it cannot be renamed`
    );
  }
  return {
    ok: true,
    value: mapModule(course, moduleId, (courseModule: Module): Module => ({
      ...courseModule,
      title,
    })),
  };
}

export function removeModule(
  course: CourseModel,
  moduleId: string
): Result<CourseModel> {
  if (findModule(course, moduleId) === undefined) {
    return failure(
      `module '${moduleId}' does not exist, so it cannot be removed`
    );
  }
  if (course.modules.length === 1) {
    return failure(
      'a course needs at least one module, so the last one cannot be removed'
    );
  }
  return {
    ok: true,
    value: {
      ...course,
      modules: course.modules.filter(
        (courseModule: Module): boolean => courseModule.id !== moduleId
      ),
    },
  };
}

export function addPage(
  course: CourseModel,
  moduleId: string,
  pageId: string,
  title: string
): Result<CourseModel> {
  if (findModule(course, moduleId) === undefined) {
    return failure(
      `module '${moduleId}' does not exist, so a page cannot be added to it`
    );
  }
  const page: Page = { id: pageId, title, html: '' };
  return {
    ok: true,
    value: mapModule(course, moduleId, (courseModule: Module): Module => ({
      ...courseModule,
      pages: [...courseModule.pages, page],
    })),
  };
}

export function updatePage(
  course: CourseModel,
  pageId: string,
  patch: Partial<Pick<Page, 'title' | 'html'>>
): Result<CourseModel> {
  const owner: Module | undefined = findModuleOfPage(course, pageId);
  if (owner === undefined) {
    return failure(`page '${pageId}' does not exist, so it cannot be updated`);
  }
  return {
    ok: true,
    value: mapModule(course, owner.id, (courseModule: Module): Module => ({
      ...courseModule,
      pages: courseModule.pages.map((page: Page): Page =>
        page.id === pageId ? { ...page, ...patch } : page
      ),
    })),
  };
}

export function removePage(
  course: CourseModel,
  pageId: string
): Result<CourseModel> {
  const owner: Module | undefined = findModuleOfPage(course, pageId);
  if (owner === undefined) {
    return failure(`page '${pageId}' does not exist, so it cannot be removed`);
  }
  if (owner.pages.length === 1) {
    return failure(
      `module '${owner.title}' needs at least one page, so its last page cannot be removed`
    );
  }
  return {
    ok: true,
    value: mapModule(course, owner.id, (courseModule: Module): Module => ({
      ...courseModule,
      pages: courseModule.pages.filter(
        (page: Page): boolean => page.id !== pageId
      ),
    })),
  };
}

function swap<TItem>(
  items: readonly TItem[],
  from: number,
  to: number
): TItem[] {
  const copy: TItem[] = [...items];
  const moved: TItem | undefined = copy[from];
  const other: TItem | undefined = copy[to];
  if (moved === undefined || other === undefined) {
    return copy;
  }
  copy[from] = other;
  copy[to] = moved;
  return copy;
}

/** Moves a page one place up (-1) or down (1) inside its module. */
export function movePage(
  course: CourseModel,
  pageId: string,
  direction: -1 | 1
): Result<CourseModel> {
  const owner: Module | undefined = findModuleOfPage(course, pageId);
  if (owner === undefined) {
    return failure(`page '${pageId}' does not exist, so it cannot be moved`);
  }
  const index: number = owner.pages.findIndex(
    (page: Page): boolean => page.id === pageId
  );
  const target: number = index + direction;
  if (target < 0 || target >= owner.pages.length) {
    return { ok: true, value: course };
  }
  return {
    ok: true,
    value: mapModule(course, owner.id, (courseModule: Module): Module => ({
      ...courseModule,
      pages: swap(courseModule.pages, index, target),
    })),
  };
}

/** Moves a module one place up (-1) or down (1) in the course. */
export function moveModule(
  course: CourseModel,
  moduleId: string,
  direction: -1 | 1
): Result<CourseModel> {
  const index: number = course.modules.findIndex(
    (courseModule: Module): boolean => courseModule.id === moduleId
  );
  if (index === -1) {
    return failure(
      `module '${moduleId}' does not exist, so it cannot be moved`
    );
  }
  const target: number = index + direction;
  if (target < 0 || target >= course.modules.length) {
    return { ok: true, value: course };
  }
  return {
    ok: true,
    value: { ...course, modules: swap(course.modules, index, target) },
  };
}

/** The first page of a course, used to pick what the editor shows first. */
export function firstPage(course: CourseModel): Page | undefined {
  return course.modules[0]?.pages[0];
}

/** How many questions the whole course holds. */
export function countQuestions(course: CourseModel): number {
  return course.modules.reduce(
    (total: number, courseModule: Module): number =>
      total +
      courseModule.pages.reduce(
        (pageTotal: number, page: Page): number =>
          pageTotal + (page.questions?.length ?? 0),
        0
      ),
    0
  );
}

export function setCompletion(
  course: CourseModel,
  completion: CompletionRule
): CourseModel {
  return { ...course, completion };
}

function withQuestions(
  course: CourseModel,
  pageId: string,
  change: (questions: readonly Question[]) => readonly Question[]
): Result<CourseModel> {
  const owner: Module | undefined = findModuleOfPage(course, pageId);
  if (owner === undefined) {
    return failure(
      `page '${pageId}' does not exist, so its questions cannot be changed`
    );
  }
  return {
    ok: true,
    value: mapModule(course, owner.id, (courseModule: Module): Module => ({
      ...courseModule,
      pages: courseModule.pages.map((page: Page): Page => {
        if (page.id !== pageId) return page;
        const questions: readonly Question[] = change(page.questions ?? []);
        const { questions: _previous, ...rest } = page;
        // A page without questions carries no empty list.
        return questions.length === 0 ? rest : { ...rest, questions };
      }),
    })),
  };
}

export function addQuestion(
  course: CourseModel,
  pageId: string,
  question: Question
): Result<CourseModel> {
  const page: Page | undefined = findModuleOfPage(course, pageId)?.pages.find(
    (entry: Page): boolean => entry.id === pageId
  );
  if ((page?.questions?.length ?? 0) >= QUESTION_LIMITS.maxQuestionsPerPage) {
    return failure(
      `a page can hold at most ${QUESTION_LIMITS.maxQuestionsPerPage} questions`
    );
  }
  if (countQuestions(course) >= QUESTION_LIMITS.maxQuestionsPerCourse) {
    return failure(
      `a course can hold at most ${QUESTION_LIMITS.maxQuestionsPerCourse} questions`
    );
  }
  return withQuestions(course, pageId, (questions) => [...questions, question]);
}

export function replaceQuestion(
  course: CourseModel,
  pageId: string,
  question: Question
): Result<CourseModel> {
  return withQuestions(course, pageId, (questions) =>
    questions.map((entry: Question): Question =>
      entry.id === question.id ? question : entry
    )
  );
}

export function removeQuestion(
  course: CourseModel,
  pageId: string,
  questionId: string
): Result<CourseModel> {
  return withQuestions(course, pageId, (questions) =>
    questions.filter((entry: Question): boolean => entry.id !== questionId)
  );
}

/** Moves a question one place up (-1) or down (1) on its page. */
export function moveQuestion(
  course: CourseModel,
  pageId: string,
  questionId: string,
  direction: -1 | 1
): Result<CourseModel> {
  return withQuestions(course, pageId, (questions) => {
    const index: number = questions.findIndex(
      (entry: Question): boolean => entry.id === questionId
    );
    const target: number = index + direction;
    if (index === -1 || target < 0 || target >= questions.length)
      return questions;
    return swap(questions, index, target);
  });
}
