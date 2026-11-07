import { describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { validateXML } from 'xmllint-wasm';
import { zipPackage } from '@richardmcquiston01/lms-package-maker-exporters';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import { buildTincanManifest, xapiActivityId, xapiExporter } from './index.js';

const course: CourseModel = {
  modelVersion: 1,
  id: '1 weird/id & more',
  title: 'Safety <101> & "Health"',
  description: 'About <safety>',
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

const decode = (bytes: Uint8Array | undefined): string =>
  new TextDecoder().decode(bytes);

describe('tincan.xml', () => {
  test('is well-formed and describes one launchable course activity', async () => {
    const xml: string = buildTincanManifest(course);
    const result = await validateXML({
      xml: [{ fileName: 'tincan.xml', contents: xml }],
      schema: [
        {
          fileName: 'any.xsd',
          contents: `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://projecttincan.com/tincan.xsd" xmlns="http://projecttincan.com/tincan.xsd" elementFormDefault="qualified">
  <xs:element name="tincan"><xs:complexType><xs:sequence><xs:any processContents="skip" maxOccurs="unbounded"/></xs:sequence></xs:complexType></xs:element>
</xs:schema>`,
        },
      ],
    });
    // Well-formedness and the namespace; the full TinCan schema is not bundled.
    expect(result.valid).toBe(true);
    expect(xml).toContain('xmlns="http://projecttincan.com/tincan.xsd"');
    expect(xml).toContain(`id="${xapiActivityId(course)}"`);
    expect(xml).toContain('type="http://adlnet.gov/expapi/activities/course"');
    expect(xml).toContain(
      '<name lang="en">Safety &lt;101&gt; &amp; &quot;Health&quot;</name>'
    );
    expect(xml).toContain(
      '<description lang="en">About &lt;safety&gt;</description>'
    );
    expect(xml).toContain('<launch lang="en">index.html</launch>');
  });

  test('the check is real: broken XML is rejected', async () => {
    const broken: string = buildTincanManifest(course).replace(
      '</activities>',
      ''
    );
    const result = await validateXML({
      xml: [{ fileName: 'tincan.xml', contents: broken }],
      schema: [
        {
          fileName: 'any.xsd',
          contents:
            '<?xml version="1.0"?><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="x"/></xs:schema>',
        },
      ],
    });
    expect(result.valid).toBe(false);
  });

  test('falls back to the title when the course has no description', () => {
    expect(buildTincanManifest({ ...course, description: '' })).toContain(
      '<description lang="en">Safety &lt;101&gt; &amp; &quot;Health&quot;</description>'
    );
  });

  test('the activity id is a stable absolute IRI', () => {
    expect(xapiActivityId(course)).toBe(
      'urn:lms-package-maker:course:1_weird_id___more'
    );
    expect(xapiActivityId(course)).toBe(xapiActivityId({ ...course }));
  });
});

describe('xapiExporter', () => {
  test('writes tincan.xml and the player, and no SCORM manifest', () => {
    const result = xapiExporter.export(course);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect([...result.value.keys()].sort()).toEqual([
      'assets/player.css',
      'assets/player.js',
      'assets/runtime.js',
      'index.html',
      'tincan.xml',
    ]);
    expect(decode(result.value.get('tincan.xml'))).toContain('index.html');
  });

  test('tells the runtime it is an xAPI package and names the activity', () => {
    const result = xapiExporter.export(course);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const html: string = decode(result.value.get('index.html'));
      expect(html).toContain('"runtimeApi":"xapi"');
      expect(html).toContain(
        `"xapi":{"activityId":"${xapiActivityId(course)}"}`
      );
      expect(html).toContain('"language":"en"');
    }
  });

  test('zips deterministically with tincan.xml at the root', () => {
    const result = xapiExporter.export(course);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const first = zipPackage(result.value);
    expect(first).toEqual(zipPackage(result.value));
    if (first.ok) {
      expect(Object.keys(unzipSync(first.value))).toContain('tincan.xml');
    }
  });

  test('passes the player errors through and refuses unsafe media paths', () => {
    expect(
      xapiExporter.export({
        ...course,
        completion: { kind: 'passQuiz', minScorePercent: 80 },
      }).ok
    ).toBe(false);
    expect(
      xapiExporter.export(course, {
        assets: new Map([['../evil.png', new Uint8Array([1])]]),
      }).ok
    ).toBe(false);
    const withMedia = xapiExporter.export(course, {
      assets: new Map([['media/a.png', new Uint8Array([1, 2, 3])]]),
    });
    expect(withMedia.ok && withMedia.value.has('media/a.png')).toBe(true);
  });
});
