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

### Usage

```bash
bun run test        # unit tests
bun run typecheck   # packages and web app
cd apps/web && bunx prisma migrate dev && bun run dev
```

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
