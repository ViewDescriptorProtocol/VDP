# View Descriptor Protocol (VDP)

The View Descriptor Protocol (VDP) lets an API tell its clients which templates render which data: each response carries a **view descriptor** — a compact JSON block naming a root template by URI and the sub-templates that fill its named slots. Any client — Android, iOS, browser, desktop, or a BFF — reads the same descriptor and renders with its own framework's templates.

> **Note:** This repository also contains archived content from RVST (Representational View State Transfer), VDP's predecessor. RVST schemas are in `schemas/` and old examples in `examples/example-*.json`. The VDP specification, schema, and examples supersede RVST.

## VDP Specification

- **Spec:** [view-descriptor-protocol.md](./view-descriptor-protocol.md)
- **Schema:** [vdp.v0-1.schema.json](./vdp.v0-1.schema.json)
- **Examples:** [examples/vdp-*.json](./examples/)

## Getting Started

This repository is the working draft of the VDP specification. Alongside the spec it ships the JSON Schema and a set of schema-validated example payloads you can drop into your own integration tests as fixtures.

## Key Concepts

VDP descriptors declare:
- A **template** URI pointing to the UI template to render
- **Slots** that map named insertion points to nested view descriptors (or arrays of descriptors)
- Transport via inline `_view`/`_views` (HAL-compatible) or HTTP `Link` headers (RFC 8288)

Templates handle all data binding (Qute, JSONPath, HTMT, etc.) — VDP only says *which* templates to use, not *how* to bind data.

For archived RVST concepts, see [docs/archive/concepts-and-principles.md](docs/archive/concepts-and-principles.md).

## Archived RVST Content

The original RVST standard is preserved in:
- `schemas/` — RVST JSON schemas (v1, v1-1, v1-2)
- `examples/example-*.json` — RVST example payloads
- `examples/rvst-hal-draft.json` — unfinished draft of a HAL-based RVST variant (not schema-validated)
- `docs/archive/` — RVST documentation and diagrams

## Contributing

Corrections, clarifications, design feedback, and implementation experience reports are all welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers the workflow: discuss non-trivial changes in an issue first, target pull requests at `develop`, and keep the spec, schema, and examples in sync.

## License

View Descriptor Protocol (VDP) is released under the MIT License. For more details, see the [LICENSE](LICENSE) file.
