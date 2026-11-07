import { html5Exporter } from '@richardmcquiston01/lms-package-maker-exporter-html5';
import { scorm12Exporter } from '@richardmcquiston01/lms-package-maker-exporter-scorm12';
import { scorm2004Exporter } from '@richardmcquiston01/lms-package-maker-exporter-scorm2004';
import { getAuthSecret, getDataDirectory, isSignUpAllowed } from './config';
import { getPrismaClient } from './db';
import { createErrorLog } from './errorLog';
import { createPrismaAuthRepository } from './auth/prismaAuthRepository';
import { createRateLimiter } from './auth/rateLimiter';
import { createAuthService, type AuthService } from './auth/service';
import { createIdentitySetup } from './identity/fromEnvironment';
import type { IdentityProvider } from '@richardmcquiston01/lms-package-maker-identity';
import { createPreviewAccess, type PreviewAccess } from './auth/tokens';
import { createMediaService, type MediaService } from './media/service';
import { createPrismaMediaRepository } from './media/prismaMediaRepository';
import { createPrismaRepository } from './projects/prismaRepository';
import { createProjectService, type ProjectService } from './projects/service';
import { createFileStorage } from './storage';

export interface Services {
  /** Decides who is signed in. */
  readonly identity: IdentityProvider;
  /** The app's own sign-in screens; null when another identity provider is used. */
  readonly accounts: AuthService | null;
  readonly projects: ProjectService;
  readonly media: MediaService;
  readonly previewAccess: PreviewAccess;
}

const globalForServices = globalThis as unknown as { services?: Services };

/** The wired-up services, created once per process. */
export function getServices(): Services {
  if (globalForServices.services === undefined) {
    const dataDirectory: string = getDataDirectory();
    const errorLog = createErrorLog(dataDirectory);
    const newId = (): string => crypto.randomUUID();
    const prisma = getPrismaClient();
    const projectRepository = createPrismaRepository(prisma);
    const storage = createFileStorage(dataDirectory);
    const media: MediaService = createMediaService({
      media: createPrismaMediaRepository(prisma),
      projects: projectRepository,
      storage,
      errorLog,
      newId,
    });
    const identitySetup = createIdentitySetup(process.env, () =>
      createAuthService({
        repository: createPrismaAuthRepository(prisma),
        errorLog,
        rateLimiter: createRateLimiter({
          maxFailures: 10,
          windowMs: 15 * 60 * 1000,
        }),
        allowSignUp: isSignUpAllowed(),
        newId,
      })
    );
    if (!identitySetup.ok) {
      throw new Error(
        `Identity is not configured correctly: ${identitySetup.errors.join(' ')}`
      );
    }
    globalForServices.services = {
      identity: identitySetup.value.identity,
      accounts: identitySetup.value.accounts,
      projects: createProjectService({
        repository: projectRepository,
        storage,
        errorLog,
        exporters: {
          html5: html5Exporter,
          scorm12: scorm12Exporter,
          scorm2004: scorm2004Exporter,
        },
        media,
        newId,
      }),
      media,
      previewAccess: createPreviewAccess(getAuthSecret()),
    };
  }
  return globalForServices.services;
}
