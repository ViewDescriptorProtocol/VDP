# View Descriptor Protocol (VDP)

View Descriptor Protocol (VDP) is a protocol for server-driven template binding across web, mobile, and desktop platforms. A JSON descriptor tells any client (Android, iOS, Browser, Desktop) which templates to use for which data, using slots and template URIs.

> **Note:** This repository also contains archived content from RVST (Representational View State Transfer), VDP's predecessor. RVST schemas are in `schemas/` and old examples in `examples/example-*.json`. The VDP specification, schema, and examples supersede RVST.

## VDP Specification

- **Spec:** [view-descriptor-protocol.md](./view-descriptor-protocol.md)
- **Schema:** [vdp.v0-1.schema.json](./vdp.v0-1.schema.json)
- **Examples:** [examples/vdp-*.json](./examples/)

## Getting Started

This repository serves as the working draft for the VDP specification. It includes the JSON Schema and example payloads which you can use as a basis for your integration tests.

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

We encourage contributions from the community! Please read our [CONTRIBUTING guidelines](CONTRIBUTING.md) to learn how you can help improve VDP.

## License

View Descriptor Protocol (VDP) is released under the MIT License. For more details, see the [LICENSE](LICENSE) file.
