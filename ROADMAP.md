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
- [x] SCORM 1.2 XSD files shipped in each package; manifest validated against them in tests

## M2 – Authoring MVP

- [x] Next.js app + Prisma: projects, modules and pages (HTML pages, sanitised on save)
- [x] Sign-in with email and password; courses are private to their owner
- [x] Pluggable identity (`packages/identity`): built-in accounts, trusted proxy header, single user, or your own provider
- [x] Media uploads (images, audio, video) stored through the storage adapters; 25 MB per file
- [x] Live preview using the real runtime (sandboxed frame, last saved version)
- [x] Export SCORM 1.2 and HTML5 downloads from the editor
- [x] Visual page editor (rich text, tables, media; HTML view kept for markup it cannot hold)
- [x] Quizzes (single and multiple choice) with points, a pass mark and pass-the-quiz completion; more question types and question banks still to come

## M3 – Modern standards

- [x] SCORM 2004 4th Edition export (single SCO, pass mark, no sequencing rules yet)
- [ ] SCORM 2004 sequencing and navigation
- [x] xAPI (TinCan) export: statements and State API progress
- [x] cmi5 export (one AU; launch, token fetch, launch data, statement rules)

## M4 – Distribution and extras

- [ ] AICC export
- [x] Docker image (Dockerfile and compose; the image build is not yet run in CI)
- [ ] Electron app
- [ ] Templates, themes, accessibility checks (WCAG 2.2 AA)
