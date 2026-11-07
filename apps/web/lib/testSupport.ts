import { test } from 'bun:test';
import { html5Exporter } from '@richardmcquiston01/lms-package-maker-exporter-html5';
import { scorm12Exporter } from '@richardmcquiston01/lms-package-maker-exporter-scorm12';
import { scorm2004Exporter } from '@richardmcquiston01/lms-package-maker-exporter-scorm2004';
import { xapiExporter } from '@richardmcquiston01/lms-package-maker-exporter-xapi';
import type {
  ErrorLogAdapter,
  ErrorLogEntry,
  ErrorLogResult,
} from '@richardmcquiston01/error-log-adapter';
import type { AppErrorCode } from './errorLog';
import { createMemoryMediaRepository } from './media/memoryMediaRepository';
import { createMediaService, type MediaService } from './media/service';
import { createMemoryAuthRepository } from './auth/memoryAuthRepository';
import { createRateLimiter } from './auth/rateLimiter';
import { createAuthService, type AuthService } from './auth/service';
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
  readonly media: MediaService;
  readonly repository: ProjectRepository;
  readonly errorLog: RecordingErrorLog;
}

/** A project service on in-memory storage, with predictable ids. */
export function createTestServices(
  repository: ProjectRepository = createMemoryRepository(),
  options: { maxMediaBytes?: number; maxMediaPerProject?: number } = {}
): TestServices {
  const errorLog: RecordingErrorLog = createRecordingErrorLog();
  let counter = 0;
  const newId = (): string => {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  };
  const storage = createMemoryStorage();
  const media: MediaService = createMediaService({
    media: createMemoryMediaRepository(),
    projects: repository,
    storage,
    errorLog,
    newId,
    ...(options.maxMediaBytes === undefined
      ? {}
      : { maxBytes: options.maxMediaBytes }),
    ...(options.maxMediaPerProject === undefined
      ? {}
      : { maxPerProject: options.maxMediaPerProject }),
  });
  const service: ProjectService = createProjectService({
    repository,
    storage,
    errorLog,
    exporters: {
      html5: html5Exporter,
      scorm12: scorm12Exporter,
      scorm2004: scorm2004Exporter,
      xapi: xapiExporter,
    },
    media,
    newId,
  });
  return { service, media, repository, errorLog };
}

/** `test` when the condition holds, otherwise `test.skip`. */
export function testIf(condition: boolean): typeof test {
  return condition ? test : test.skip;
}

export interface TestAuth {
  readonly service: AuthService;
  readonly repository: ReturnType<typeof createMemoryAuthRepository>;
  readonly errorLog: RecordingErrorLog;
  /** Moves the service's clock forward. */
  advanceMinutes(minutes: number): void;
}

/** An auth service on in-memory storage, with a clock the test controls. */
export function createTestAuth(
  options: { allowSignUp?: boolean } = {}
): TestAuth {
  let nowMs = Date.parse('2030-01-01T00:00:00Z');
  const now = (): Date => new Date(nowMs);
  const repository = createMemoryAuthRepository(now);
  const errorLog: RecordingErrorLog = createRecordingErrorLog();
  let counter = 0;
  const service: AuthService = createAuthService({
    repository,
    errorLog,
    rateLimiter: createRateLimiter({
      maxFailures: 3,
      windowMs: 15 * 60 * 1000,
      now: (): number => nowMs,
    }),
    allowSignUp: options.allowSignUp ?? false,
    newId: (): string => {
      counter += 1;
      return `aaaaaaaa-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    },
    now,
  });
  return {
    service,
    repository,
    errorLog,
    advanceMinutes(minutes: number): void {
      nowMs += minutes * 60 * 1000;
    },
  };
}
