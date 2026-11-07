# cmi5 course structure schema

`CourseStructure.xsd` is the XML Schema that the cmi5 specification gives for
the course structure file (`cmi5.xml`). It is vendored **unmodified**, and it
is **not** part of exported packages: cmi5 does not require a package to carry
it. The tests use it to check that the `cmi5.xml` this package writes is valid.

It is covered by the Apache License 2.0 (`LICENSE-cmi5-spec`, copied
unchanged from the specification repository):

> Copyright 2012-2021 Advanced Distributed Learning (ADL) Initiative, U.S.
> Department of Defense, All rights reserved. Licensed under the Apache
> License, Version 2.0.

## Where the copy comes from

Taken from `AICC/CMI-5_Spec_Current` at commit
`0ff5b3058778035acdb604aedc1f672083970f67` (`v1/CourseStructure.xsd`).

## Checksums (SHA-256)

| File                  | SHA-256                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `CourseStructure.xsd` | `6a0b04962f5baa4603ee28e84ce4c74a122f322a548c8fdc14d93b2a23781d75` |
| `LICENSE-cmi5-spec`   | `2feefabf95200867ecd02c95e90a550398d3ed115aeb4d8b23b8896ed11e4d07` |
