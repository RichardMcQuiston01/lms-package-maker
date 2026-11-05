import { describe, expect } from 'bun:test';
import { html5Exporter } from '@richardmcquiston01/lms-package-maker-exporter-html5';
import { scorm12Exporter } from '@richardmcquiston01/lms-package-maker-exporter-scorm12';
import {
  zipPackage,
  type Exporter,
  type PackageFiles,
} from '@richardmcquiston01/lms-package-maker-exporters';
import { sampleCourse } from './fixtures';
import {
  loadReactiveLms,
  testIf,
  type PackageFileIndex,
  type ReactiveLms,
} from './reactiveLms';

const reactiveLms: ReactiveLms | null = await loadReactiveLms();

function zipIndex(exporter: Exporter, lms: ReactiveLms): PackageFileIndex {
  const exported = exporter.export(sampleCourse);
  if (!exported.ok) {
    throw new Error(exported.errors.join('; '));
  }
  const zipped = zipPackage(exported.value as PackageFiles);
  if (!zipped.ok) {
    throw new Error(zipped.errors.join('; '));
  }
  return lms.createZipFileIndex(zipped.value);
}

describe('reactive-lms import', () => {
  testIf(reactiveLms !== null)(
    'detects and parses the SCORM 1.2 package',
    () => {
      const lms = reactiveLms as ReactiveLms;
      const index: PackageFileIndex = zipIndex(scorm12Exporter, lms);
      expect(lms.detectPackageType(index)).toBe('scorm_12');
      const parsed = lms.parseImsmanifest(index);
      expect(parsed.packageType).toBe('scorm_12');
      expect(parsed.title).toBe('Conformance Course');
      expect(parsed.entryHref).toBe('index.html');
      expect(parsed.activities[0]?.metadata?.['scormType']).toBe('sco');
    }
  );

  testIf(reactiveLms !== null)(
    'every file the manifest lists is in the zip',
    () => {
      const lms = reactiveLms as ReactiveLms;
      const index: PackageFileIndex = zipIndex(scorm12Exporter, lms);
      const manifest: string = new TextDecoder().decode(
        index.read('imsmanifest.xml')
      );
      const listed: string[] = [
        ...manifest.matchAll(/<file href="([^"]+)"/g),
      ].map((match: RegExpMatchArray): string => match[1] ?? '');
      expect(listed.length).toBeGreaterThan(0);
      for (const file of listed) {
        expect(index.has(file)).toBe(true);
      }
    }
  );

  testIf(reactiveLms !== null)(
    'detects and parses the HTML5 package',
    async () => {
      const lms = reactiveLms as ReactiveLms;
      const index: PackageFileIndex = zipIndex(html5Exporter, lms);
      expect(lms.detectPackageType(index)).toBe('html5');
      const parsed = await lms.parseHtml5(index);
      expect(parsed.packageType).toBe('html5');
      expect(parsed.entryHref).toBe('index.html');
    }
  );
});
