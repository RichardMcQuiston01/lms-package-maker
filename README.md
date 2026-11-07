# @richardmcquiston01/lms-package-maker

- Author: [Richard McQuiston](mailto:richard.mcquiston@gmail.com)
- Website: https://richardmcquiston.com/

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/P1V529Z7ZP)

## Table of Contents

| [Overview](#overview) | [Getting Started](#getting-started) | [Buy Me a Coffee](#buy-me-a-coffee) | [License](#license) | [Copyright](#copyright) |

## Overview

Generate LMS compatible learning content with the ability to export into as many formats as possible(SCORM, xAPI, LTI, etc.). Available via a Web Application, Docker container, or Electron application.

Author content once and export it as an HTML5 package that any LMS can import: SCORM 1.2, SCORM 2004, xAPI, cmi5, AICC, or plain HTML5. Packages are verified against [reactive-lms](https://github.com/RichardMcQuiston01/reactive-lms) so both projects improve together.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and [ROADMAP.md](ROADMAP.md) for milestones.

[Back to Top](#table-of-contents)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.4+ (workspaces, tests)
- Node.js 22+
- PostgreSQL 16+ (Prisma)

### Installation

```bash
bun install
cp apps/web/.env.example apps/web/.env
```

### Packages

Each package under `packages/` is built to be published on its own (ESM, typed, `exports` map). They are marked `private` until a release is cut; remove that flag to publish.

| Package | Purpose |
| --- | --- |
| `identity` | The `IdentityProvider` contract, plus `header` and `single-user` providers |
| `model` | Course Model types and validation |
| `runtime` | Browser runtime: SCORM 1.2 API, SCORM 2004 API, xAPI (LRS) or `postMessage` to the host |
| `player` | Static course player generated from a Course Model |
| `exporters` | `Exporter` interface and deterministic zip |
| `exporter-html5` | Plain HTML5 package |
| `exporter-scorm12` | SCORM 1.2 package, with the SCORM 1.2 schema files (see `schemas/NOTICE.md` for origin and license) |
| `exporter-xapi` | xAPI (TinCan) package with `tincan.xml` |
| `exporter-scorm2004` | SCORM 2004 4th Edition package, with the content packaging, ADL and simple sequencing schema files (see `schemas/NOTICE.md`) |

The browser scripts are bundled from source into `*.generated.ts` files (`bun run build:bundles`); a test fails if they are stale.

### Conformance tests

`packages/conformance` runs exported packages against a pinned [reactive-lms](https://github.com/RichardMcQuiston01/reactive-lms) commit (`packages/conformance/reactive-lms.json`): its package detection and manifest parser, its real SCORM 1.2 `CmiStore` as `window.API` in Chromium, and its HTML5 `postMessage` mapper. reactive-lms reads SCORM 2004 manifests but has no `API_1484_11` yet, so the SCORM 2004 runtime is checked in Chromium against a strict stand-in host (`packages/conformance/src/scorm2004Host.ts`) that enforces the SCORM 2004 call order, value ranges and `session_time` format. reactive-lms detects `tincan.xml` packages but has no LRS, so the xAPI runtime is checked against a stand-in LRS (`packages/conformance/src/standInLrs.ts`), a real local HTTP server that checks the version header, authorization, statement shape, State API parameters and the CORS preflight.

```bash
bun run conformance:fetch   # clone the pinned commit into .cache/ and install it
bun run conformance:browser # install the Chromium that the pinned Playwright expects
bun run test                # conformance tests skip locally if the checkout is missing
```

On CI (`CI` set) a missing checkout fails the run. To move the pin, change the commit in `reactive-lms.json`, run `conformance:fetch`, and make the tests pass.

### Browser tests

`packages/e2e` drives the built web app in Chromium: sign-up, authoring, media upload, a quiz, preview, SCORM and HTML5 export and sign-out with built-in accounts, plus header mode (including a forged header and the proxy secret) and single-user mode. They start `next start` themselves, so build first and give them a migrated database:

```bash
bun run build:web
DATABASE_URL=postgresql://... bun run test   # skipped locally if the build or DATABASE_URL is missing; a failure on CI
```

### Docker

```bash
cp .env.example .env   # set AUTH_SECRET (openssl rand -base64 48) and POSTGRES_PASSWORD
docker compose up --build
```

Open http://localhost:3000. The image runs the Next standalone server as a non-root user, applies migrations on start (set `SKIP_MIGRATIONS=true` to skip), keeps uploads and exports in the `/data` volume and answers `/api/health`. It reads the same settings as the app (`DATABASE_URL`, `AUTH_SECRET`, `IDENTITY_PROVIDER`, ...). Instead of `DATABASE_URL` you can give `DATABASE_HOST`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME` (and `DATABASE_PORT`); the entrypoint builds the URL and encodes the password, which is what compose does. For `header` or `single-user` identity, pass those variables to the `app` service.

### Usage

```bash
bun run test        # unit tests
bun run typecheck   # packages and web app
cd apps/web && bunx prisma migrate dev && bun run dev
```

Open http://localhost:3000, create a course, edit its pages, watch the preview, then export SCORM 1.2, SCORM 2004, xAPI or HTML5 from the toolbar. Exports are also kept under `LMS_DATA_DIR`.

The database tests need `DATABASE_URL` pointing at a migrated PostgreSQL database; without it they are skipped locally, and CI provides one.

### Quizzes

Add questions to any page in the editor (a page with questions becomes a quiz page). A question has one right answer or several, is worth 1 to 100 points, and can show an explanation after the learner answers. Pick how the course finishes under Completion:

- **Every page viewed** (default): questions are practice. The score is still reported.
- **Quiz passed**: set a pass mark in percent. Each time the learner has answered every question, the package reports that attempt as it happened: its score (0 to 100, `cmi.core.score.*`) and *passed* or *failed*. Learners can press Try again, and every completed attempt is reported, including a worse one after a pass. The package never decides which attempt counts; the system that records the data does. If you want the best attempt, implement that where results are stored. The SCORM manifest declares the pass mark (`adlcp:masteryscore`).

Scoring is exact: a pick-several question is right only when the learner picks exactly the right set, with no partial credit. Answers, the latest score and visited pages are saved in the LMS's suspend data, so learners resume where they left off.

The right answers travel inside the package so it can mark answers without a server, which is how SCORM 1.2 content works. A determined learner can read them in the page source; use an LMS-side assessment if that matters.

### SCORM 2004

The SCORM 2004 (4th Edition) export has the same single-SCO shape as SCORM 1.2: the player handles pages and quizzes, and the package reports through `API_1484_11`:

- Status is sent as `cmi.completion_status` and `cmi.success_status`. A pass sets both *completed* and *passed*; a fail sets *failed* and leaves completion *incomplete*, so the learner can retry. Every attempt is reported, as in SCORM 1.2.
- Scores go to `cmi.score.raw`, `min`, `max` and `scaled`; progress goes to `cmi.progress_measure`; `session_time` is an ISO 8601 duration.
- A pass mark is declared as the primary objective's minimum normalized measure (`imsss:minNormalizedMeasure`), the counterpart of `adlcp:masteryscore`. Success is then also derived from the scaled score by the LMS.
- **No sequencing or navigation rules are used.** Pages are navigated inside the player.

If an LMS offers both `API` and `API_1484_11`, each package uses the one it was built for.

### xAPI

The xAPI (TinCan) export is a `tincan.xml` plus the player. Import it into an LRS or LMS that launches TinCan packages. The LRS opens `index.html` with the standard launch parameters (`endpoint`, `auth`, `actor`, `registration`) and the package talks to it directly from the browser:

- Statements: `initialized`, `scored` (when a quiz is marked), `completed`, `passed`, `failed` (each with `result.score` when there is one) and `terminated` (with `result.duration`). The course Activity id is `urn:lms-package-maker:course:<course id>`, the same on every export. As with SCORM, every quiz attempt is reported as it happened.
- Saved progress (page, answers, status) lives in the LRS State API under the state id `lms-package-maker.state`, so a learner resumes.
- The LRS must allow cross-origin requests from where the package is hosted (CORS) with the `Authorization`, `Content-Type` and `X-Experience-API-Version` headers.
- Opened without launch parameters (a preview, or from disk) the package runs on its own and sends nothing. A broken launch (an `endpoint` without an `actor`, or an LRS that refuses the request) is shown at the top of the page; the course still works.
- Not included: statements per page or per question, cmi5 (a separate export), and the TinCan XML schema (`tincan.xsd`), whose origin and license I could not confirm, so `tincan.xml` is checked for well-formedness only.

### Media

Upload PNG, JPEG, GIF, WebP images, MP3, WAV, OGG, M4A audio and MP4, WebM video from the editor's Media panel, then press Insert to put the file into the open page. Files are kept through [storage-adapters](https://github.com/RichardMcQuiston01/storage-adapters) under `LMS_DATA_DIR`. Pages refer to a file as `src="media:<id>"`; exports copy the files into the package under `media/`, rewrite the links to those paths and list the files in the SCORM manifest.

- The type comes from the file's first bytes, not its name. SVG is refused because it can carry script.
- The limit is 25 MB per file and 100 files per course. The storage adapters hold text values, so bytes are stored as base64 (about a third larger) and read whole into memory; larger video needs a binary-capable store.
- A file that a page still uses cannot be deleted. Audio and video can only use uploaded files, not outside addresses.
- Preview plays audio and video but cannot seek, because the preview route does not support range requests yet.

### Identity

The app asks one question of whatever signs people in: *who is this request from?* The answer comes from an **identity provider**, chosen with `IDENTITY_PROVIDER`:

| Provider | Use it when | Settings |
| --- | --- | --- |
| `builtin` (default) | You run the app on its own and want simple email and password accounts | `ALLOW_SIGN_UP` |
| `header` | A login proxy (oauth2-proxy, Authelia, an SSO ingress, ...) in front of the app already authenticates people | `IDENTITY_PROXY_SECRET` (required), `IDENTITY_USER_HEADER`, `IDENTITY_NAME_HEADER`, `IDENTITY_EMAIL_HEADER`, `IDENTITY_SECRET_HEADER`, `IDENTITY_SIGN_IN_URL`, `IDENTITY_SIGN_OUT_URL` |
| `single-user` | One person runs the app on their own machine (for example a desktop build) | `SINGLE_USER_NAME`; in production also `IDENTITY_SINGLE_USER_ACKNOWLEDGED=true` |

Courses belong to the id the provider returns. The app never looks inside an id, so a host can use whatever it already has; it only checks that the id is 1 to 255 characters without control characters. With any provider other than `builtin`, the app's own sign-in, sign-up and sign-out pages and routes are off (they answer 404).

**`header` mode is only safe when the app can be reached through the proxy alone.** Anyone who can reach the app directly could send the user header themselves, so the proxy must also send the shared secret (`IDENTITY_SECRET_HEADER`, default `x-identity-proxy-secret`); a request without it is treated as signed out. The app refuses to start in `header` mode without a secret.

**Bring your own login.** The contract is the small package [`@richardmcquiston01/lms-package-maker-identity`](packages/identity): implement `IdentityProvider` (`identify({ headers })` returns the person, nobody, or an error) and pass it where the app builds its services (`apps/web/lib/identity/fromEnvironment.ts`). The same package holds the `header` and `single-user` providers.

Account management beyond signing in (password reset, email verification, sharing, an admin screen) is **out of scope on purpose**: use a provider that already does it.

#### Built-in accounts

Sign in with an email and password (scrypt-hashed). The first account is created from the sign-up page and takes over any courses made before sign-in existed. After that sign-up is closed unless `ALLOW_SIGN_UP=true`. Sessions last 14 days in an HttpOnly, SameSite=Lax cookie, repeated failed sign-ins are rate limited (per server process), and state-changing requests from other sites are refused (for every provider).

In production set `AUTH_SECRET` (at least 32 random characters, `openssl rand -base64 48`), which signs the short-lived preview links for every provider, and serve the app over HTTPS so the cookie is marked `Secure`.

Stack: Next.js, Prisma, TailwindCSS. Stored files use [storage-adapters](https://github.com/RichardMcQuiston01/storage-adapters) and errors go through [error-log-adapter](https://github.com/RichardMcQuiston01/error-log-adapter), so both sinks can be swapped without changing application code.

### Examples

[Back to Top](#table-of-contents)

## Buy Me a Coffee

If this app, code, or repository has helped you or someone you know, please consider donating. I appreciate any help to offset the costs of development and/or AI Credits.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/P1V529Z7ZP)

[Back to Top](#table-of-contents)

## License

Apache 2

[Back to Top](#table-of-contents)

## Copyright

(c)2026 Richard McQuiston. All rights reserved.

[Back to Top](#table-of-contents)
