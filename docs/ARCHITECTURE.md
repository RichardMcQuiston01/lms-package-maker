# Architecture

## Goal

Author learning content once, then export it as an HTML5 package that any LMS
can import: SCORM 1.2, SCORM 2004 (3rd/4th ed.), xAPI (TinCan), cmi5, AICC, and
plain HTML5.

## Core idea: one model, many exporters

```
 Authoring UI ──► Course Model (JSON, versioned) ──► Exporter (per standard) ──► .zip
                                   │                         ▲
                                   └──► Preview / Player ────┘ (same runtime)
```

- **Course Model** – a standards-neutral JSON document: course, modules,
  pages/slides, assessments, completion and scoring rules, assets. Validated by
  a JSON Schema; this is the only thing the editor writes.
- **Content Runtime** – one small JS file bundled into every package. It speaks a
  single internal API (`initialize`, `setProgress`, `setScore`, `complete`,
  `suspend`, `terminate`) and routes it to whichever LMS API it discovers at
  launch (`window.API`, `window.API_1484_11`, xAPI/cmi5 launch params, AICC HACP,
  or a no-op in plain HTML5). Content never calls a standard directly.
- **Exporters** – pure functions `(CourseModel, options) -> Map<path, bytes>`.
  Each emits the standard's manifest plus shared assets and the runtime, then
  the zip step packages the map. No filesystem or network access, so they run
  in the browser, Node, Docker, and Electron alike.

| Exporter  | Manifest / descriptor            | Tracking transport           |
| --------- | -------------------------------- | ---------------------------- |
| html5     | `index.html`                     | `postMessage` (optional)     |
| scorm12   | `imsmanifest.xml` (ADL CP 1.2)   | `window.API`                 |
| scorm2004 | `imsmanifest.xml` (+ sequencing) | `window.API_1484_11`         |
| xapi      | `tincan.xml`                     | xAPI statements to an LRS    |
| cmi5      | `cmi5.xml`                       | xAPI + cmi5 launch handshake |
| aicc      | `.crs` `.au` `.des` `.cst`       | HACP / JS API                |

LTI is a _link_ rather than a package, so it is out of scope for export and
handled by the LMS (see reactive-lms roadmap).

## Proposed layout (monorepo)

| Package                | Responsibility                                        |
| ---------------------- | ----------------------------------------------------- |
| `packages/model`       | Course Model types + JSON Schema + validation         |
| `packages/runtime`     | Content Runtime bundled into packages                 |
| `packages/exporters`   | One exporter per standard, pure functions             |
| `packages/conformance` | Manifest XSD validation + LMS import/launch tests     |
| `apps/web`             | Next.js app (authoring UI, API, Prisma); Docker image |
| `apps/desktop`         | Electron shell around the same web app                |

Stack follows house preferences: TypeScript (Google style), Next.js, Prisma,
TailwindCSS. `model`, `runtime`, and `exporters` stay framework-free so every
delivery target (web, Docker, Electron, CLI) shares them.

## Testing with reactive-lms

[reactive-lms](https://github.com/RichardMcQuiston01/reactive-lms) already
imports and launches HTML5 and SCORM 1.2 and detects the other formats, so it is
the first real consumer of our output.

1. **Static conformance** – every exporter output is validated against the
   standard's XSDs / schemas in CI.
2. **Round-trip against reactive-lms** – CI (docker compose) boots reactive-lms,
   imports each fixture package through its API, launches it with Playwright,
   drives the content to completion, and asserts the recorded status and score.
3. **Feedback loop** – failures that are really LMS gaps (e.g. SCORM 2004 import
   not yet parsed) become issues in reactive-lms; we pin the supported version
   in the conformance package.

## Milestones

See [ROADMAP.md](../ROADMAP.md).
