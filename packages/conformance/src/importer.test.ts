import { describe, expect } from 'bun:test';
import { html5Exporter } from '@richardmcquiston01/lms-package-maker-exporter-html5';
import { scorm12Exporter } from '@richardmcquiston01/lms-package-maker-exporter-scorm12';
import { scorm2004Exporter } from '@richardmcquiston01/lms-package-maker-exporter-scorm2004';
import { xapiExporter } from '@richardmcquiston01/lms-package-maker-exporter-xapi';
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
    'detects and parses the SCORM 2004 package',
    () => {
      const lms = reactiveLms as ReactiveLms;
      const index: PackageFileIndex = zipIndex(scorm2004Exporter, lms);
      expect(lms.detectPackageType(index)).toBe('scorm_2004');
      const parsed = lms.parseImsmanifest(index);
      expect(parsed.packageType).toBe('scorm_2004');
      expect(parsed.title).toBe('Conformance Course');
      expect(parsed.entryHref).toBe('index.html');
      expect(parsed.activities[0]?.metadata?.['scormType']).toBe('sco');
    }
  );

  testIf(reactiveLms !== null)(
    'every file the SCORM 2004 manifest lists is in the zip',
    () => {
      const lms = reactiveLms as ReactiveLms;
      const index: PackageFileIndex = zipIndex(scorm2004Exporter, lms);
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
    'detects the xAPI package from its tincan.xml, not as HTML5',
    () => {
      const lms = reactiveLms as ReactiveLms;
      const index: PackageFileIndex = zipIndex(xapiExporter, lms);
      expect(index.has('tincan.xml')).toBe(true);
      expect(index.has('index.html')).toBe(true);
      expect(lms.detectPackageType(index)).toBe('xapi');
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

  testIf(reactiveLms !== null)(
    'a SCORM package with media is still read, and every listed file is in the zip',
    () => {
      const lms = reactiveLms as ReactiveLms;
      const png = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
      ]);
      const exported = scorm12Exporter.export(
        {
          ...sampleCourse,
          modules: [
            {
              id: 'm1',
              title: 'Intro',
              pages: [
                {
                  id: 'p1',
                  title: 'One',
                  html: '<img src="media/pic.png" alt="">',
                },
              ],
            },
          ],
        },
        { assets: new Map([['media/pic.png', png]]) }
      );
      if (!exported.ok) throw new Error(exported.errors.join('; '));
      const zipped = zipPackage(exported.value as PackageFiles);
      if (!zipped.ok) throw new Error(zipped.errors.join('; '));
      const index: PackageFileIndex = lms.createZipFileIndex(zipped.value);
      expect(lms.detectPackageType(index)).toBe('scorm_12');
      expect(lms.parseImsmanifest(index).entryHref).toBe('index.html');
      expect(index.has('media/pic.png')).toBe(true);
      const manifest: string = new TextDecoder().decode(
        index.read('imsmanifest.xml')
      );
      expect(manifest).toContain('<file href="media/pic.png"/>');
      for (const match of manifest.matchAll(/<file href="([^"]+)"/g)) {
        expect(index.has(match[1] ?? '')).toBe(true);
      }
    }
  );
});
