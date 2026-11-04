import path from 'node:path';

/** Resolves the data directory from LMS_DATA_DIR, defaulting to ./data. */
export function getDataDirectory(): string {
  const configured: string | undefined = process.env['LMS_DATA_DIR'];
  return path.resolve(
    configured !== undefined && configured !== '' ? configured : './data'
  );
}
