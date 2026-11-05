# SCORM 1.2 schemas

These four XML Schema files are the schemas that the SCORM 1.2 Content
Aggregation Model asks every package to be able to validate against. They are
vendored **unmodified** and are not covered by this repository's Apache-2.0
license. They keep their original notices:

- `imscp_rootv1p1p2.xsd`, `ims_xml.xsd`, `imsmd_rootv1p2p1.xsd`: IMS Content
  Packaging 1.1.2 and IMS Meta-data 1.2.1 ("Copyright (c) 2001 IMS GLC, Inc.",
  IMS Global Learning Consortium).
- `adlcp_rootv1p2.xsd`: the ADL (Advanced Distributed Learning) SCORM 1.2
  extension schema.

Every SCORM 1.2 package is expected to carry these files next to
`imsmanifest.xml`, which is why the exporter writes them into each package.

## Where the copies come from

Taken from `cybercussion/SCOBot` at commit
`017a47ede547dd0c698f9b629d4dfb965b91d52b` (`schemas/scorm12_schemas/`) and
checked against `adaptlearning/adapt-contrib-spoor` at commit
`2d8737c2982ee4617c862e7c21e44c31bbd4e7dd` (`scorm/1.2/`). The two sets differ
only in whitespace and line breaks.

## Checksums (SHA-256)

| File                   | SHA-256                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `adlcp_rootv1p2.xsd`   | `e1e807986d60ac9f7bfe00a4afa5087505278b705d620ab0b863ab9b01cf490e` |
| `ims_xml.xsd`          | `32b0698c1f4f310b84edbc0b138fa6cf73443dc4b3aac86bebad92b2c6cc1bbd` |
| `imscp_rootv1p1p2.xsd` | `c076c71ce9ea220bcc1bd9eae3ca019f8bcce1a43634567723f1c2d8ae04cc81` |
| `imsmd_rootv1p2p1.xsd` | `04f1ba5c82c46c19720ecac1e7d5952e9e7b602528db22abebf45f31bd5ee7ff` |
