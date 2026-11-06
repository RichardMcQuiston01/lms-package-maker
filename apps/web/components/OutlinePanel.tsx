'use client';

import type {
  CourseModel,
  Module,
  Page,
} from '@richardmcquiston01/lms-package-maker-model';
import type { ReactNode } from 'react';

export interface OutlineActions {
  readonly selectPage: (pageId: string) => void;
  readonly renameModule: (moduleId: string, title: string) => void;
  readonly moveModule: (moduleId: string, direction: -1 | 1) => void;
  readonly removeModule: (moduleId: string) => void;
  readonly addModule: () => void;
  readonly addPage: (moduleId: string) => void;
  readonly movePage: (pageId: string, direction: -1 | 1) => void;
  readonly removePage: (pageId: string) => void;
}

interface OutlinePanelProps {
  readonly course: CourseModel;
  readonly selectedPageId: string | null;
  readonly actions: OutlineActions;
}

interface SmallButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}

function SmallButton({
  label,
  onClick,
  children,
}: SmallButtonProps): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
    >
      {children}
    </button>
  );
}

export function OutlinePanel({
  course,
  selectedPageId,
  actions,
}: OutlinePanelProps): ReactNode {
  return (
    <nav aria-label="Course outline" className="space-y-4">
      {course.modules.map((courseModule: Module) => (
        <section
          key={courseModule.id}
          aria-label={`Module ${courseModule.title}`}
        >
          <div className="flex items-center gap-1">
            <input
              aria-label="Module title"
              value={courseModule.title}
              onChange={(event): void =>
                actions.renameModule(courseModule.id, event.target.value)
              }
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold uppercase tracking-wide hover:border-slate-300 focus:border-blue-500"
            />
            <SmallButton
              label={`Move module ${courseModule.title} up`}
              onClick={(): void => actions.moveModule(courseModule.id, -1)}
            >
              ↑
            </SmallButton>
            <SmallButton
              label={`Move module ${courseModule.title} down`}
              onClick={(): void => actions.moveModule(courseModule.id, 1)}
            >
              ↓
            </SmallButton>
            <SmallButton
              label={`Remove module ${courseModule.title}`}
              onClick={(): void => actions.removeModule(courseModule.id)}
            >
              ✕
            </SmallButton>
          </div>
          <ol className="mt-1 space-y-0.5">
            {courseModule.pages.map((page: Page) => (
              <li key={page.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(): void => actions.selectPage(page.id)}
                  aria-current={page.id === selectedPageId ? 'page' : undefined}
                  className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm ${
                    page.id === selectedPageId
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-slate-200'
                  }`}
                >
                  {page.title === '' ? 'Untitled page' : page.title}
                </button>
                <SmallButton
                  label={`Move page ${page.title} up`}
                  onClick={(): void => actions.movePage(page.id, -1)}
                >
                  ↑
                </SmallButton>
                <SmallButton
                  label={`Move page ${page.title} down`}
                  onClick={(): void => actions.movePage(page.id, 1)}
                >
                  ↓
                </SmallButton>
                <SmallButton
                  label={`Remove page ${page.title}`}
                  onClick={(): void => actions.removePage(page.id)}
                >
                  ✕
                </SmallButton>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={(): void => actions.addPage(courseModule.id)}
            className="mt-1 px-2 py-1 text-sm text-blue-700 hover:underline"
          >
            + Add page
          </button>
        </section>
      ))}
      <button
        type="button"
        onClick={actions.addModule}
        className="w-full rounded border border-dashed border-slate-400 px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
      >
        + Add module
      </button>
    </nav>
  );
}
