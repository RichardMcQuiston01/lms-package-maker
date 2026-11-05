# Roadmap

Ordered so each milestone is testable against reactive-lms, which supports
HTML5 and SCORM 1.2 import today.

## M0 – Foundation

- [x] Monorepo scaffold (TypeScript, Prettier, CI); ESLint still to add
- [x] Next.js + Tailwind + Prisma app shell with storage and error-log adapters
- [x] Course Model types and validation (`packages/model`); JSON Schema still to add
- [x] Zip + exporter interface (`packages/exporters`)

## M1 – HTML5 and SCORM 1.2

- [x] Content Runtime with SCORM 1.2 and postMessage adapters (`packages/runtime`)
- [x] HTML5 and SCORM 1.2 exporters (`packages/exporter-html5`, `packages/exporter-scorm12`)
- [x] Conformance tests against a pinned reactive-lms checkout (import, real `CmiStore` SCORM 1.2 API, `postMessage` mapper) in CI
- [ ] Validate manifests against the XSD schemas
- [ ] Ship the SCORM 1.2 XSD files in the package and validate the manifest against them

## M2 – Authoring MVP

- [ ] Next.js app + Prisma: projects, pages, media
- [ ] Live preview using the real runtime
- [ ] Quizzes with scoring and completion rules

## M3 – Modern standards

- [ ] SCORM 2004 (with sequencing)
- [ ] xAPI (TinCan) and cmi5

## M4 – Distribution and extras

- [ ] AICC export
- [ ] Docker image and Electron app
- [ ] Templates, themes, accessibility checks (WCAG 2.2 AA)
