import { html5Exporter } from '@richardmcquiston01/lms-package-maker-exporter-html5';
import { scorm12Exporter } from '@richardmcquiston01/lms-package-maker-exporter-scorm12';
import { getDataDirectory } from './config';
import { getPrismaClient } from './db';
import { createErrorLog } from './errorLog';
import { createPrismaRepository } from './projects/prismaRepository';
import { createProjectService, type ProjectService } from './projects/service';
import { createFileStorage } from './storage';

const globalForServices = globalThis as unknown as {
  projectService?: ProjectService;
};

/** The wired-up project service, created once per process. */
export function getProjectService(): ProjectService {
  if (globalForServices.projectService === undefined) {
    const dataDirectory: string = getDataDirectory();
    globalForServices.projectService = createProjectService({
      repository: createPrismaRepository(getPrismaClient()),
      storage: createFileStorage(dataDirectory),
      errorLog: createErrorLog(dataDirectory),
      exporters: { html5: html5Exporter, scorm12: scorm12Exporter },
      newId: (): string => crypto.randomUUID(),
    });
  }
  return globalForServices.projectService;
}
