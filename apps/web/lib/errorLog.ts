import path from 'node:path';
import {
  CompositeErrorAdapter,
  ConsoleErrorAdapter,
  JsonFileErrorAdapter,
  type ErrorLogAdapter,
} from '@richardmcquiston01/error-log-adapter';

export type AppErrorCode =
  'PROJECT_INVALID' | 'EXPORT_FAILED' | 'STORAGE_FAILED';

/**
 * Logs to the console and to a rotating NDJSON file under LMS_DATA_DIR.
 * Swap in another sink (Postgres, webhook, ...) here without touching callers.
 */
export function createErrorLog(
  dataDirectory: string
): ErrorLogAdapter<AppErrorCode> {
  return new CompositeErrorAdapter<AppErrorCode>([
    new ConsoleErrorAdapter<AppErrorCode>({ prefix: '[lms-package-maker]' }),
    new JsonFileErrorAdapter<AppErrorCode>(
      path.join(dataDirectory, 'logs', 'errors.ndjson'),
      { mode: 'ndjson', maxBytes: 5_000_000, maxFiles: 3 }
    ),
  ]);
}
