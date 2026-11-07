# SCORM 2004 (4th Edition) schemas

These schema files are the ones the SCORM 2004 Content Aggregation Model asks
every package to carry next to `imsmanifest.xml`. They are vendored
**unmodified** and are not covered by this repository's Apache-2.0 license.
They keep their original notices:

- `imscp_v1p1.xsd`: IMS Content Packaging ("Copyright (c) 2001 IMS GLC, Inc.",
  IMS Global Learning Consortium).
- `adlcp_v1p3.xsd`, `adlseq_v1p3.xsd`, `adlnav_v1p3.xsd`: the ADL (Advanced
  Distributed Learning) SCORM 2004 content packaging, sequencing and
  navigation extensions.
- `imsss_v1p0*.xsd`: IMS Simple Sequencing.
- `xml.xsd`, `XMLSchema.dtd`, `datatypes.dtd`: W3C schema documents that
  `imscp_v1p1.xsd` imports (the `xml:` namespace).

The IMS and ADL files carry no license text of their own beyond the notice
above. Check their terms before you republish this package.

The package does not use IEEE LOM metadata, so the `lom*.xsd` files are not
included.

## Where the copies come from

Taken from `adaptlearning/adapt-contrib-spoor` at commit
`2d8737c2982ee4617c862e7c21e44c31bbd4e7dd` (`scorm/2004/`). That set matches
SCORM 2004 4th Edition (`adlcp_v1p3.xsd` and `adlseq_v1p3.xsd` are version
2.0).

`cybercussion/SCOBot` at commit `017a47ede547dd0c698f9b629d4dfb965b91d52b`
(`schemas/`) holds the same `adlnav_v1p3.xsd`, `imsss_v1p0*.xsd` and
`xml.xsd` (compared ignoring whitespace). Its `adlcp_v1p3.xsd` and
`adlseq_v1p3.xsd` are older (version 1.0, without the 4th Edition additions),
its `imscp_v1p1.xsd` imports `xml.xsd` from a w3.org URL, and its DTDs differ
only in a revision comment, so those were not used.

## Checksums (SHA-256)

| File                        | SHA-256                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `adlcp_v1p3.xsd`            | `87cefec31b160a1ecc9ffd1475bee6cb0e2d71b2bcd76ba1a08df0ac90cf8f7d` |
| `adlnav_v1p3.xsd`           | `1fc2678e9acaee07ba8b0da93caa5f52da5167f2999c4adbd0a4ad74c15c8bfb` |
| `adlseq_v1p3.xsd`           | `162b5ca35a3fc43107efe0f78f5216c76f6cad8e13921c8332b7b82db7c4ae08` |
| `imscp_v1p1.xsd`            | `a5333c5b9a392d4f21d20b188eb77dec2f04021642a6232f3c07ef8032fe233e` |
| `imsss_v1p0.xsd`            | `53565d8b23842d5b667beffa4ed100e3e06cdd778b60b85efc38e7a9a1f52a90` |
| `imsss_v1p0auxresource.xsd` | `c0dd16d707f37c4d26484d7c233eea6d9ccbb8bad643040359f4b4f2944c057a` |
| `imsss_v1p0control.xsd`     | `c8564177ca7b1c241d6ca893652f6946eb91fee450dce8607ba2189ba88e7969` |
| `imsss_v1p0delivery.xsd`    | `58d4f343e3302e2986a641b066a3f0b30bd895b62d358a184cb5c3455427392c` |
| `imsss_v1p0limit.xsd`       | `debda0a7fe2a1ce6e063383c4efc9fbd5f2341355c85d66062742657be2418a9` |
| `imsss_v1p0objective.xsd`   | `776e091df47e934432c78703e552482e83165f75c9bf89c6320ee035ecd7ae69` |
| `imsss_v1p0random.xsd`      | `3442393c455d8a984853c1c7cdf1bf6ccf4d0c58452c0e39b6c0aab65339f597` |
| `imsss_v1p0rollup.xsd`      | `85100e4c7ba8eff77102d73d2ce265ddd803d13191a1d2b81bf3bf8bb1eac554` |
| `imsss_v1p0seqrule.xsd`     | `b8fbd362e2408d318ae97cc70a7d3a8a536db29150b7ef7b355f394d06027023` |
| `imsss_v1p0util.xsd`        | `b7234f3f62ede3f8dc6cd35053805ad021b4642b54f34b7960945981be95a438` |
| `xml.xsd`                   | `95907dad3dea7debdd26bddeab77e3946b95370329994beefa74253be105c3e2` |
| `XMLSchema.dtd`             | `a5e98f4f28d11c58f132ee771350f41930a10a5d22acc280e0ce8501e5603bbe` |
| `datatypes.dtd`             | `d46c4f4c9384a0dc2f922c71af0405ebe1d64fae77cfd860b64f9600ca395427` |
