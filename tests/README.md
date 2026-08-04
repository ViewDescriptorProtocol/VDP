# VDP Test Corpus

Language-neutral fixtures for the View Descriptor Protocol, plain JSON, runnable by any implementation. This corpus is the artifact that proves a descriptor renders identically across implementations — a BFF on the JVM, a Kotlin Multiplatform client, a Go demo, a browser.

## Layout

### `descriptors/`

Descriptor documents with an expected validation outcome against the current schema (`vdp.v0-2.schema.json`):

- `valid/*.json` — MUST be accepted.
- `invalid/*.json` — MUST be rejected. Covers malformed transforms (unknown `$` construct, invalid pointer syntax, `$map` without `$to`, `$mapper` in node position), unrecognized members without the `x-` prefix (spec Section 3.10), and a transform on a descriptor reference site (spec Section 3.7).

### `transforms/`

Transform evaluation triples (spec Section 3.8.2). Each case is a directory:

- `input.json` — the transform input (the response representation).
- `transform.json` — the transform. **Absent file = no transform declared**: the expected result is the input unchanged (identity default).
- `expected.json` — the exact evaluation result. May be any JSON value, including a bare string or `null`.

### `rendering/`

Descriptor-level semantics that single transforms cannot express:

- `response.json` — a full API response (may embed `_view`/`_views`).
- `descriptor.json` — the view descriptor to resolve.
- `expected.json` — the per-node models: `{"root": <root model>, "slots": {"<name>": <slot model>}}`.

`independent-projection` proves each node's transform reads the **original** response (a root transform that discards a field must not empty a slot that still needs it). `embedded-transport-strip` proves `_view`/`_views` are removed from the transform input (spec Section 4.2).

## Running

The non-normative reference runner evaluates every `transforms/` and `rendering/` case:

```bash
podman run --rm -v .:/work:Z -w /work node:lts node tests/run-transforms.mjs
```

Schema fixtures are checked with ajv:

```bash
podman run --rm -v .:/work:Z -w /work node:lts sh -c "npm install --no-save ajv-cli ajv-formats && npx ajv-cli test --spec=draft2020 -s vdp.v0-2.schema.json -d 'tests/descriptors/valid/*.json' --valid -c ajv-formats && npx ajv-cli test --spec=draft2020 -s vdp.v0-2.schema.json -d 'tests/descriptors/invalid/*.json' --invalid -c ajv-formats"
```

Both run in CI.

## Caveat: object member order

Spec Section 3.8.2 requires `$entries` to emit members in document order, which requires order-preserving JSON object parsing. JavaScript's `JSON.parse` reorders *integer-like* keys (`"1"`, `"42"`) ahead of the rest; the ordering fixtures therefore avoid integer-like keys. A conforming client on a stack with that behaviour needs an order-preserving parse for objects whose member order reaches an `$entries` result.
