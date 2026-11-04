import path from 'node:path';
import {
  memoryAdapter,
  withPrefix,
} from '@richardmcquiston01/storage-adapters';
import type { StorageAdapter } from '@richardmcquiston01/storage-adapters';
import { fileAdapter } from '@richardmcquiston01/storage-adapters/file';
import { nodeFileSystem } from '@richardmcquiston01/storage-adapters/file/node';

/** File-backed storage for media and exported packages. */
export function createFileStorage(dataDirectory: string): StorageAdapter {
  return withPrefix(
    fileAdapter({
      directory: path.join(dataDirectory, 'storage'),
      fileSystem: nodeFileSystem(),
    }),
    'lms-package-maker:'
  );
}

/** In-memory storage for tests. */
export function createMemoryStorage(): StorageAdapter {
  return memoryAdapter();
}
