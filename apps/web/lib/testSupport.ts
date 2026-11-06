import { test } from 'bun:test';
import { html5Exporter } from '@richardmcquiston01/lms-package-maker-exporter-html5';
import { scorm12Exporter } from '@richardmcquiston01/lms-package-maker-exporter-scorm12';
import type {
  ErrorLogAdapter,
  ErrorLogEntry,
  ErrorLogResult,
} from '@richardmcquiston01/error-log-adapter';
import type { AppErrorCode } from './errorLog';
import { createMemoryRepository } from './projects/memoryRepository';
import { createProjectService, type ProjectService } from './projects/service';
import type { ProjectRepository } from './projects/types';
import { createMemoryStorage } from './storage';

export interface RecordingErrorLog extends ErrorLogAdapter<AppErrorCode> {
  readonly entries: ErrorLogEntry<AppErrorCode>[];
}

export function createRecordingErrorLog(): RecordingErrorLog {
  const entries: ErrorLogEntry<AppErrorCode>[] = [];
  return {
    entries,
    async log(entry: ErrorLogEntry<AppErrorCode>): Promise<ErrorLogResult> {
      entries.push(entry);
      return { ok: true };
    },
  };
}

export interface TestServices {
  readonly service: ProjectService;
  readonly repository: ProjectRepository;
  readonly errorLog: RecordingErrorLog;
}

/** A project service on in-memory storage, with predictable ids. */
export function createTestServices(
  repository: ProjectRepository = createMemoryRepository()
): TestServices {
  const errorLog: RecordingErrorLog = createRecordingErrorLog();
  let counter = 0;
  const service: ProjectService = createProjectService({
    repository,
    storage: createMemoryStorage(),
    errorLog,
    exporters: { html5: html5Exporter, scorm12: scorm12Exporter },
    newId: (): string => {
      counter += 1;
      return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    },
  });
  return { service, repository, errorLog };
}

/** `test` when the condition holds, otherwise `test.skip`. */
export function testIf(condition: boolean): typeof test {
  return condition ? test : test.skip;
}
