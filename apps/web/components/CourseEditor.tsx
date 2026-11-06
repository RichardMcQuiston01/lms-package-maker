'use client';

import type {
  CourseModel,
  Page,
  Result,
} from '@richardmcquiston01/lms-package-maker-model';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { saveCourseRequest } from '../lib/apiClient';
import {
  addModule,
  addPage,
  findModuleOfPage,
  firstPage,
  moveModule,
  movePage,
  removeModule,
  removePage,
  renameModule,
  updateCourseDetails,
  updatePage,
} from '../lib/courseEdit';
import { newClientId } from '../lib/ids';
import { OutlinePanel, type OutlineActions } from './OutlinePanel';
import { PagePanel } from './PagePanel';
import { PreviewPane } from './PreviewPane';

interface CourseEditorProps {
  readonly projectId: string;
  readonly initialCourse: CourseModel;
}

type StatusMessage =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'error'; readonly message: string };

const EXPORT_BUTTONS: readonly { standard: string; label: string }[] = [
  { standard: 'scorm12', label: 'Export SCORM 1.2' },
  { standard: 'html5', label: 'Export HTML5' },
];

export function CourseEditor({
  projectId,
  initialCourse,
}: CourseEditorProps): ReactNode {
  const [course, setCourse] = useState<CourseModel>(initialCourse);
  const [savedCourse, setSavedCourse] = useState<CourseModel>(initialCourse);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    firstPage(initialCourse)?.id ?? null
  );
  const [status, setStatus] = useState<StatusMessage>({ kind: 'idle' });
  const [previewVersion, setPreviewVersion] = useState<number>(0);
  const courseRef = useRef<CourseModel>(course);
  courseRef.current = course;

  const hasUnsavedChanges: boolean = useMemo(
    (): boolean => JSON.stringify(course) !== JSON.stringify(savedCourse),
    [course, savedCourse]
  );

  const applyEdit = useCallback((result: Result<CourseModel>): void => {
    if (result.ok) {
      setCourse(result.value);
      setStatus({ kind: 'idle' });
    } else {
      setStatus({ kind: 'error', message: result.errors.join(' ') });
    }
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    const sent: CourseModel = courseRef.current;
    setStatus({ kind: 'saving' });
    const saved: Result<CourseModel> = await saveCourseRequest(projectId, sent);
    if (!saved.ok) {
      setStatus({ kind: 'error', message: saved.errors.join(' ') });
      return false;
    }
    setSavedCourse(saved.value);
    // Show the server's cleaned-up copy, unless the author kept typing meanwhile.
    if (courseRef.current === sent) {
      setCourse(saved.value);
    }
    setPreviewVersion((version: number): number => version + 1);
    setStatus({ kind: 'saved' });
    return true;
  }, [projectId]);

  useEffect((): (() => void) => {
    function handleKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    }
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      if (hasUnsavedChanges) {
        event.preventDefault();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [save, hasUnsavedChanges]);

  async function exportAs(standard: string): Promise<void> {
    if (hasUnsavedChanges && !(await save())) {
      return;
    }
    window.location.assign(
      `/api/projects/${projectId}/export?standard=${standard}`
    );
  }

  const selectedPage: Page | null = useMemo((): Page | null => {
    const owner =
      selectedPageId === null
        ? undefined
        : findModuleOfPage(course, selectedPageId);
    return (
      owner?.pages.find((page: Page): boolean => page.id === selectedPageId) ??
      null
    );
  }, [course, selectedPageId]);

  const actions: OutlineActions = {
    selectPage: setSelectedPageId,
    renameModule: (moduleId, title): void =>
      applyEdit(renameModule(course, moduleId, title)),
    moveModule: (moduleId, direction): void =>
      applyEdit(moveModule(course, moduleId, direction)),
    removeModule: (moduleId): void => {
      const target = course.modules.find((entry) => entry.id === moduleId);
      const containsSelection: boolean =
        selectedPageId !== null &&
        (target?.pages.some(
          (page: Page): boolean => page.id === selectedPageId
        ) ??
          false);
      const result: Result<CourseModel> = removeModule(course, moduleId);
      applyEdit(result);
      if (result.ok && containsSelection) {
        setSelectedPageId(firstPage(result.value)?.id ?? null);
      }
    },
    addModule: (): void => {
      const pageId: string = newClientId();
      setCourse(
        addModule(
          course,
          newClientId(),
          pageId,
          `Module ${course.modules.length + 1}`
        )
      );
      setSelectedPageId(pageId);
    },
    addPage: (moduleId): void => {
      const pageId: string = newClientId();
      const result: Result<CourseModel> = addPage(
        course,
        moduleId,
        pageId,
        'New page'
      );
      applyEdit(result);
      if (result.ok) {
        setSelectedPageId(pageId);
      }
    },
    movePage: (pageId, direction): void =>
      applyEdit(movePage(course, pageId, direction)),
    removePage: (pageId): void => {
      const result: Result<CourseModel> = removePage(course, pageId);
      applyEdit(result);
      if (result.ok && pageId === selectedPageId) {
        setSelectedPageId(firstPage(result.value)?.id ?? null);
      }
    },
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <Link href="/" className="text-sm text-blue-700 hover:underline">
          ← Courses
        </Link>
        <input
          aria-label="Course title"
          value={course.title}
          onChange={(event): void =>
            setCourse(
              updateCourseDetails(course, { title: event.target.value })
            )
          }
          className="min-w-48 flex-1 rounded border border-transparent px-2 py-1 text-lg font-semibold hover:border-slate-300 focus:border-blue-500"
        />
        <span
          role="status"
          className={`text-sm ${status.kind === 'error' ? 'text-red-700' : 'text-slate-500'}`}
        >
          {status.kind === 'saving' && 'Saving…'}
          {status.kind === 'saved' && !hasUnsavedChanges && 'Saved'}
          {status.kind === 'error' && status.message}
          {status.kind !== 'saving' &&
            status.kind !== 'error' &&
            hasUnsavedChanges &&
            'Unsaved changes'}
        </span>
        <button
          type="button"
          onClick={(): void => void save()}
          disabled={!hasUnsavedChanges || status.kind === 'saving'}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
        {EXPORT_BUTTONS.map(({ standard, label }) => (
          <button
            key={standard}
            type="button"
            onClick={(): void => void exportAs(standard)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            {label}
          </button>
        ))}
      </header>
      <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[16rem_minmax(0,1fr)_minmax(0,28rem)]">
        <aside>
          <OutlinePanel
            course={course}
            selectedPageId={selectedPageId}
            actions={actions}
          />
        </aside>
        <main>
          <PagePanel
            page={selectedPage}
            onTitleChange={(title): void => {
              if (selectedPageId !== null)
                applyEdit(updatePage(course, selectedPageId, { title }));
            }}
            onHtmlChange={(html): void => {
              if (selectedPageId !== null)
                applyEdit(updatePage(course, selectedPageId, { html }));
            }}
          />
        </main>
        <PreviewPane
          projectId={projectId}
          version={previewVersion}
          hasUnsavedChanges={hasUnsavedChanges}
        />
      </div>
    </div>
  );
}
