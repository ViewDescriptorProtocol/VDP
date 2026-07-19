# Contributing to the View Descriptor Protocol

The VDP specification is an early working draft (v0.1, alpha). Contributions — corrections, clarifications, design feedback, and implementation experience reports — are welcome.

## How to contribute

- **Discuss first.** For anything beyond a small fix, open a GitHub issue describing the problem or proposal before writing a pull request.
- **Branches.** Development happens on `develop`; `main` is fast-forwarded from it. Target pull requests at `develop`.
- **Scope.** Keep each pull request to one logical change.

## Keeping the spec, schema, and examples in sync

A change to the descriptor format usually touches three places — update all of them in the same pull request:

- the specification (`view-descriptor-protocol.md`),
- the JSON Schema (`vdp.v0-1.schema.json`),
- the examples (`examples/vdp-*.json`).

Validate the examples against the schema before submitting:

```bash
npm install --no-save ajv-cli ajv-formats
npx ajv-cli test -s vdp.v0-1.schema.json -d 'examples/vdp-*.json' --valid -c ajv-formats
```

CI runs the same validation on every pull request.

## Conventions

- Template URLs in examples are format-neutral resources — no `.html` (or other) extensions.
- Diagrams are authored as [D2](https://d2lang.com) files in `docs/diagrams/`; CI regenerates the SVGs in `docs/images/` on pushes to `main`.
- Editor settings are in `.editorconfig`: UTF-8, LF line endings, final newline, 2-space indentation for Markdown, YAML, and JSON.
- Add an entry to `CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format) for any normative change.
- Content under `docs/archive/`, `schemas/`, and `examples/example-*.json` is archived RVST material — it is preserved for reference and not open to changes.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
