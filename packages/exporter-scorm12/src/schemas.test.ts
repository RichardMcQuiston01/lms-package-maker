import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateXML } from 'xmllint-wasm';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import {
  buildScorm12Manifest,
  scorm12Exporter,
  scorm12SchemaFiles,
} from './index.js';

const course: CourseModel = {
  modelVersion: 1,
  id: '1 weird/id & more',
  title: 'Safety <101> & "Health"',
  description: '',
  language: 'en',
  completion: { kind: 'viewAll' },
  modules: [
    {
      id: 'm1',
      title: 'Intro',
      pages: [{ id: 'p1', title: 'Hi', html: '<p>Hi</p>' }],
    },
  ],
};

/**
 * Imports the content packaging and ADL extension schemas together, so that
 * adlcp attributes such as `scormtype` are checked rather than skipped.
 */
const COMBINED_SCHEMA = `<?xml version="1.0"?>
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <xsd:import namespace="http://www.imsproject.org/xsd/imscp_rootv1p1p2" schemaLocation="imscp_rootv1p1p2.xsd"/>
  <xsd:import namespace="http://www.adlnet.org/xsd/adlcp_rootv1p2" schemaLocation="adlcp_rootv1p2.xsd"/>
</xsd:schema>`;

async function validate(manifest: string): Promise<readonly string[]> {
  const result = await validateXML({
    xml: [{ fileName: 'imsmanifest.xml', contents: manifest }],
    schema: [{ fileName: 'combined.xsd', contents: COMBINED_SCHEMA }],
    preload: Object.entries(scorm12SchemaFiles).map(([fileName, contents]) => ({
      fileName,
      contents,
    })),
  });
  return result.valid ? [] : result.errors.map((error) => error.message);
}

describe('SCORM 1.2 manifest schema validation', () => {
  test('the generated manifest is valid', async () => {
    expect(await validate(buildScorm12Manifest(course))).toEqual([]);
  });

  test('the check is real: a bad scormtype is rejected', async () => {
    const broken: string = buildScorm12Manifest(course).replace(
      'adlcp:scormtype="sco"',
      'adlcp:scormtype="bogus"'
    );
    const errors: readonly string[] = await validate(broken);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain('scormtype');
  });

  test('the check is real: a missing organizations element is rejected', async () => {
    const broken: string = buildScorm12Manifest(course).replace(
      /<organizations[\s\S]*<\/organizations>/,
      ''
    );
    expect((await validate(broken)).length).toBeGreaterThan(0);
  });
});

describe('schema files in the package', () => {
  test('all four are written at the package root', () => {
    const result = scorm12Exporter.export(course);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const name of [
        'imscp_rootv1p1p2.xsd',
        'adlcp_rootv1p2.xsd',
        'ims_xml.xsd',
        'imsmd_rootv1p2p1.xsd',
      ]) {
        expect(result.value.has(name)).toBe(true);
      }
    }
  });

  test('the manifest points at them', () => {
    const manifest: string = buildScorm12Manifest(course);
    for (const name of Object.keys(scorm12SchemaFiles)) {
      if (name !== 'ims_xml.xsd') {
        expect(manifest).toContain(name);
      }
    }
  });

  test('exported bytes match the vendored files and the NOTICE checksums', async () => {
    const result = scorm12Exporter.export(course);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const directory: string = path.join(import.meta.dir, '..', 'schemas');
    const notice: string = await readFile(
      path.join(directory, 'NOTICE.md'),
      'utf8'
    );
    for (const name of Object.keys(scorm12SchemaFiles)) {
      const onDisk: Buffer = await readFile(path.join(directory, name));
      const exported: Uint8Array | undefined = result.value.get(name);
      expect(Buffer.from(exported ?? new Uint8Array()).equals(onDisk)).toBe(
        true
      );
      const checksum: string = createHash('sha256')
        .update(onDisk)
        .digest('hex');
      // Prettier pads Markdown tables, so match the row loosely.
      const tick = '`';
      const row = new RegExp(
        `${tick}${name}${tick}\\s*\\|\\s*${tick}${checksum}${tick}`
      );
      expect(notice).toMatch(row);
    }
  });
});
