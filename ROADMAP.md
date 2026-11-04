# Roadmap

Ordered so each milestone is testable against reactive-lms, which supports
HTML5 and SCORM 1.2 import today.

## M0 – Foundation

- [ ] Monorepo scaffold (TypeScript, Prettier, ESLint, CI)
- [ ] Course Model + JSON Schema (`packages/model`)
- [ ] Zip + exporter interface (`packages/exporters`)

## M1 – HTML5 and SCORM 1.2

- [ ] Content Runtime with SCORM 1.2 adapter
- [ ] HTML5 and SCORM 1.2 exporters
- [ ] Conformance harness: XSD validation + reactive-lms round trip

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
