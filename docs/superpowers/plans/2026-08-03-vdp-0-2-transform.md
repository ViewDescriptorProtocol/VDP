# VDP 0.2 `transform` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the VDP specification, JSON Schemas, examples, CI, and the vdprotocol.org site from 0.1 to 0.2, adding the single new optional member `transform` (declarative data reshaping) plus its supporting rules.

**Architecture:** The canonical spec is `VDP/view-descriptor-protocol.md`; the site (`ViewDescriptorProtocol.github.io`, MkDocs Material) mirrors it. 0.2 adds one member — `transform` — valid on any view descriptor node, defined as a nine-production declarative grammar over RFC 6901 JSON Pointers, with a `$mapper` escape hatch for client-registered code. New v0-2 schemas sit beside the v0-1 schemas (whose `$id` URLs must keep resolving). A language-neutral test corpus (`VDP/tests/`) plus a dependency-free Node reference runner proves the transform semantics and runs in CI.

**Tech Stack:** Markdown spec, JSON Schema 2020-12, ajv-cli via podman `node:lts` (never host node), Node reference runner (no deps), MkDocs Material site, GitHub Actions CI, D2 diagrams (unchanged this release).

## Global Constraints

- **Multi-repo workspace.** `/home/jn/Projects/ViewDescriptorProtocol` is NOT a git repo. `VDP/` and `ViewDescriptorProtocol.github.io/` are separate repos. Stage files only inside the target repo; never `git add .`/`-A` from the parent.
- **Git conventions (overrides Claude Code defaults):** human-only attribution — NEVER add `Co-Authored-By: Claude`, `Claude-Session:`, "Generated with Claude Code", or any AI mention to commits. Use the existing identity `jnbdz <jn@yaloub.com>` (do not set user.name/email). Sentence-case subjects, no prefix tags, no trailing period, descriptive body. One commit per repo per task. **Commit, but do NOT push** — the user confirms pushes separately.
- **VDP work lands on `develop`** (currently checked out, clean). Site work lands on `master`. CI only runs on pushes/PRs to VDP `main`, so validate locally via podman before every commit.
- **Node only via podman:** `podman run --rm -v .:/work:Z -w /work node:lts sh -c "..."` from inside `VDP/`.
- **Keep v0-1 artifacts intact:** `vdp.v0-1.schema.json` and `vdp-discovery.v0-1.schema.json` stay in the repo and on the site unchanged — their `$id` URLs (`https://vdprotocol.org/schemas/...`) must keep resolving.
- **Site sync rule:** any schema change ⇒ re-copy schemas to site `docs/schemas/` and regenerate `docs/schema.md` (embeds schemas verbatim). Spec/changelog mirror = copy canonical file + append a blank line and the site's two `*[abbr]:` lines (take them from the current tail of `docs/specification.md` / `docs/changelog.md`). Verify with `mkdocs build --strict`.
- **Editorconfig:** UTF-8, LF, final newline, 2-space indent for `.md`/`.json`/`.yml`, no trailing whitespace except Markdown.
- **Template URI semantics (standing project rule):** template URIs are identifiers/namespaces first, locators second. Never depict CDN-fetch as the only model. `$mapper` URIs follow the same identity-first rules and are **never fetched**.
- **RVST archive is frozen** — do not touch anything under `VDP/schemas/` or `docs/archive/`.
- **Version strings:** every current-protocol-version occurrence in the spec (`Version: 0.1` header, §12.2 media-type example, §13.1 `VDP-Version: 0.1`, §13.2 `"version": "0.1"`) becomes `0.2`. Historical changelog entries are NOT edited.

## Design brief (embedded — the executor has no other copy)

### The `transform` member

Optional on any view descriptor node. Adapts the API response representation into the JSON model the node's template expects. Declarative data, not code: no expression language, no parser, no sandbox.

```json
{
  "template": "example.com/templates/data-table",
  "transform": {
    "heading": "/dataset/title",
    "rows": "/data"
  }
}
```

**Key principle:** the transform belongs to the data, not to the template. A template URI names a renderable unit with a fixed data contract; the descriptor node is where "this projection of the data" meets "this template."

### Grammar (nine productions)

```
Transform  = Pointer | Mapping | MapperRef

Pointer    = string                       ; RFC 6901 JSON Pointer; "" = whole input
Mapping    = { Key: Node, ... }           ; Key MUST NOT begin with "$"
Node       = Pointer | Mapping | List | Projection
           | Entries | Defaulted | Count | Merge
List       = [ Node, ... ]
Projection = { "$map": Pointer, "$to": Node }
Entries    = { "$entries": Pointer, "$to"?: Node }
Defaulted  = { "$get": Pointer, "$default": <any JSON> }
Count      = { "$count": Pointer }
Merge      = { "$merge": [ Node, ... ] }
MapperRef  = { "$mapper": URI }
```

Design points to carry into spec prose:

- RFC 6901 pointers, not a new path syntax. `""` addresses the whole input.
- **Every bare string leaf is a pointer.** No literal form — removes path-vs-literal ambiguity.
- Inside `$to`, pointers are relative to the current element (`/key` = the element's `key` member).
- `$entries` emits `{"key": ..., "value": ...}` per object member, in document order, reusing `$to`.
- **No `$const`** — a literal at a key is a template parameter by another name (Design Decision #2 puts those out of scope). Literals exist only inside `$default`. Note in the spec that `{"$get": "/nonexistent", "$default": true}` is an obvious workaround and is not endorsed.
- Mapping keys beginning with `$` are reserved for constructs; an unrecognized `$`-prefixed member is a malformed transform (§9.3).
- `MapperRef` is valid only as the entire `transform` value (top level), not as an inner `Node`.

**Deliberately excluded** (say so explicitly in the spec — this line keeps the grammar from becoming an expression language): filtering, sorting, slicing, paging, conditional selection, cross-field derivation (e.g. `firstName` + `lastName`), grouping, date/number/currency formatting, type coercion, emptiness flags. These belong to the server (what rows to return), the template (locale and presentation), or `$mapper`.

### `$mapper` escape hatch

```json
{ "transform": { "$mapper": "https://example.com/mappers/dataset-to-table" } }
```

References mapping code the client has registered in its own language. The client does **not** fetch the URI — it is an identifier, matched verbatim, governed by the same rules as template URIs (§5.4, §6.3). Unknown mapper URI → slot failure per §9.1. `$mapper` support is OPTIONAL for clients; inline transform support is REQUIRED. Discovery documents SHOULD declare the mapper URIs their descriptors may reference (new `mappers` member, §13.2) so servers can avoid emitting descriptors a client cannot satisfy.

### Normative semantics (the eleven rules)

1. **Independent projection (critical).** Each node's `transform` is evaluated against the original API response representation, never against the model produced by an ancestor's `transform`. Rationale: the transform is relative to the data, not the parent view; chaining would mean a root transform that discards a field silently empties every descendant. Parent chaining as an opt-in was rejected (two meanings for pointers, render-ordering constraints, no benefit — transforms are pointer walks over an already-parsed document). If sibling duplication becomes a real problem, the additive future answer is `$source` (a pointer narrowing the original representation for a subtree), which preserves one meaning for pointers. Include this diagram:

   ```
   API response ──> root transform   ──> root template model
                ──> slot A transform ──> slot A template model
                ──> slot B transform ──> slot B template model
   ```

2. **Transform input.** The input is the API response representation **with the embedded descriptor removed**: for the §4.2 inline body transport, `_view` and `_views` are stripped before evaluation, so the same descriptor behaves identically whether delivered by `Link` header, response body, or discovery. Without this rule a descriptor becomes transport-bound, which breaks descriptor caching.
3. **Template input.** When `transform` is present, the template receives exactly the transform result. The untransformed representation MUST NOT also be made available to the template. (Otherwise implementations expose the original data alongside the model, templates start depending on it, and break on every other client.)
4. **Absent transform** → template receives the representation unchanged. Identity is the default.
5. **Missing pointers** resolve to `null`. Not an error — it is the common case. A pointer cannot distinguish an explicit JSON `null` from an absent member; `$default` applies to both. `$default` is how an author forces a value.
6. **`$map` on a non-array** yields `null`. Not a descriptor error. (Same for `$entries` on a non-object.)
7. **Empty mapping** `{}` is legal and produces `{}`. It is not an identity transform.
8. **`$entries` ordering.** MUST emit members in document order; conforming clients MUST parse JSON objects order-preservingly. (JSON member order is not semantically significant, so without this rule the same descriptor produces differently ordered lists per platform. Free on the target stacks: Jackson preserves insertion order, Kotlin `Map` literals are `LinkedHashMap`, kotlinx.serialization `JsonObject` preserves order.) `$map` is unaffected — arrays are ordered by definition.
9. **`$merge` conflicts:** last operand wins on key collision. Operands that do not evaluate to objects (including `null`) are skipped.
10. **Pointer escaping / numeric segments:** RFC 6901 as written (`~0` → `~`, `~1` → `/`); for numeric segments against objects with numeric-string keys, cite RFC 6901's own resolution rather than defining new behaviour.
11. **Nesting:** `transform` is valid on every view descriptor node, including nodes inside `views` and inside slot arrays. (`$count` semantics: array → element count; object → member count; anything else → `null`.)

### Descriptor references (§3.7 addition)

A referenced descriptor SHOULD NOT contain `transform` — a shared descriptor exists to be reused across many responses; a transform binds it to one representation shape. Shared subtrees contribute structure only. The closed-object rule is unchanged: a reference site contains exactly `descriptor` and therefore cannot carry a transform either (it could only reach the referenced root, not the inner slots).

### Error handling (maps onto existing §9)

| Condition | Outcome |
|---|---|
| Malformed transform (unknown `$` construct, invalid pointer syntax) | Invalid view descriptor → §9.3 |
| Pointer resolves to nothing | `null`, render continues — not an error |
| `$map` target is not an array | `null` — not an error |
| Unrecognized `$mapper` URI | Slot failure → §9.1 |
| Transform declared and fails, on a slot node | Slot failure → §9.1 |
| Transform declared and fails, on the root node | Error template only |

**§9.4 rule 2 amendment:** when a transform was declared and failed, the client MUST NOT render the template against untransformed input — the shapes do not match; the result would be silently wrong output rather than a visible error.

### Security (§10) — collapses, not expands

1. Transforms are inert data: they cannot read files, environment variables, or the network; cannot loop or recurse unboundedly; not Turing-complete. No sandbox, no execution limits, no CVE surface.
2. `$mapper` executes only code the client itself registered. A descriptor can name a mapper but cannot supply one.

The template URI allowlist remains the load-bearing control, unchanged. Note explicitly that **CORS is not a usable control here** — it protects a resource owner from a hostile page, not a fetcher from a hostile resource, and does not apply to server-side BFF requests at all. CSP `connect-src` is browser-only defence in depth. SRI stays as in 0.1.

### Extensibility rule (new, general)

> Clients MUST reject a view descriptor node containing a member they do not recognize, unless the member name begins with `x-`.

Rationale: a 0.1 client receiving a 0.2 descriptor would otherwise ignore `transform` and render the template against the wrong shape — silently wrong output, worse than an error. Vendor extensions stay ignorable via `x-`; spec additions are must-understand and gated by the version. Done now while the installed base is small. (The discovery document keeps its existing opposite rule — ignore unknown members — that is §13.2's own extensibility clause and is unchanged.)

### Rejected alternatives (for Design Decisions)

- **jq:** (1) portability — jackson-jq/gojq/jqjs/libjq diverge on regex dialect, key ordering (gojq has no `keys_unsorted`), large-integer arithmetic, JSON extensions; divergences live inside any single jq version, so pinning doesn't fix them; (2) security — a jq expression is executable program logic, making descriptors a code-delivery vehicle needing sandboxing, resource limits, CVE tracking (jq 1.8.2 fixed six memory-safety issues incl. heap overflow, stack overflow via path depth, hash-collision DoS); (3) power mismatch — VDP needs ~a dozen reshaping operations, jq is a complete programming language.
- **JMESPath:** formally specified with a compliance suite, but no Kotlin Multiplatform implementation (JVM `burtcorp/jmespath-java` and Swift `adam-fowler/jmespath.swift` exist; KMP would need an Obj-C interop bridge on iOS). If an implementation must be written anyway, the compliance suite is a consolation prize.
- **Custom expression language:** zero implementations day one, near-certain feature creep toward re-implementing jq, no AI training corpus (transforms will largely be AI-authored).
- **Root-only transform + per-slot source pointers:** two mechanisms rather than one; couples the tree (swapping a slot's template forces editing the root transform); reintroduces chaining (slot data becomes whatever the root transform left behind).

### Changelog callout (important)

Earlier design discussion used `"transform": "<string>"` to mean a **jq expression**. In the final design a string means a **JSON Pointer** and an object means a mapping. Same syntax, different semantics — say this in the changelog so anyone who saw the earlier framing is not misled.

### Known limitation (non-normative note in schema docs)

The schema validates descriptor *shape*; it cannot verify a transform's *output* matches the template's contract (`{heading}` vs `{title}` renders blank and is schema-valid). Natural future direction: template-declared model schemas published at the template URI, validated once at cache-warm time.

### "Transform is a smell" (non-normative note)

Where the representation is already standardized (e.g. OData's `value` / `@odata.count` envelope), do not transform — fix the shape at the source. A transform is an adapter, not a default.

---

## File Structure

**VDP repo (branch `develop`):**

- Modify: `view-descriptor-protocol.md` — all spec edits (Tasks 2–7)
- Create: `vdp.v0-2.schema.json` — descriptor schema with Transform defs (Task 8)
- Create: `vdp-discovery.v0-2.schema.json` — discovery schema + `mappers` (Task 8)
- Create: `examples/vdp-transform.json`, `examples/vdp-transform-mapper.json`, `examples/discovery-mappers.json` (Task 8)
- Modify: `examples/discovery-basic.json`, `examples/discovery-templated.json` — version `0.2` (Task 8)
- Create: `tests/README.md`, `tests/descriptors/{valid,invalid}/*.json`, `tests/transforms/*/{input,transform,expected}.json`, `tests/rendering/*/…` (Task 9)
- Create: `tests/run-transforms.mjs` — dependency-free reference runner (Task 10)
- Modify: `.github/workflows/test-and-diagrams.yml` — v0-2 validation, corpus, runner (Task 10)
- Modify: `CHANGELOG.md` (Task 7), `README.md` if it names 0.1 (Task 11)

**Parent dir (not a repo):** Modify `CLAUDE.md` — schema versions, validation commands (Task 11).

**Site repo (branch `master`):**

- Modify: `docs/specification.md`, `docs/changelog.md` (mirrors), `docs/schema.md` (regenerated)
- Create: `docs/schemas/vdp.v0-2.schema.json`, `docs/schemas/vdp-discovery.v0-2.schema.json`
- Modify: any of `docs/index.md`, `docs/examples.md`, `docs/implementers-guide.md`, `docs/deployment-scenarios.md`, `docs/related-projects.md` that state 0.1-only facts (Task 12)

---

### Task 1: Grammar validation against quarkus-pha (gate)

**Files:**
- Create: `/tmp/claude-1000/-home-jn-Projects-ViewDescriptorProtocol/3f3e6d28-9239-454d-9c8e-81a318cf5494/scratchpad/grammar-validation.md` (scratch — NOT committed)
- Read-only: `/home/jn/Projects/SiteNetSoft/quarkus-pha/runtime/src/main/resources/templates/**/*.html`, `/home/jn/Projects/SiteNetSoft/quarkus-pha/integration-tests/src/main/resources/templates/**/*.html` (ignore `build/` copies)

**Interfaces:**
- Produces: a PASS/FAIL verdict on the nine-production grammar. PASS = every sampled template's data needs are expressible as a transform from a plausible API response (or legitimately belong to server/template/`$mapper` per the exclusion list). FAIL = a *reshaping* need (not logic/formatting) that the grammar cannot express — STOP and report to the user before any spec writing.

- [ ] **Step 1: Enumerate template cases.** List the `src/main/resources` templates in both quarkus-pha modules (layouts, compositions, components, demos, extensions). Pick ~20 covering: layouts with `{#insert}` slots, the demos (`dashboard.html`, `data-management.html`, `landing.html`, `settings.html`, `empty-state.html`, `json-models.html`, `licenses.html`), and components/compositions (`icon.html`, `cookie-banner.html`, `theme-selector.html`, nav layouts).
- [ ] **Step 2: Extract each template's data contract.** For each template, read it and write down the model it consumes — every `{value.expr}` Qute expression, `{#for}` iteration source, `{#if}` condition input. Record as a JSON shape sketch.
- [ ] **Step 3: Write a candidate transform per case.** For each template, invent a plausible *differently-shaped* API response (renamed fields, wrapped envelope like `{"data": [...], "meta": {...}}`, nested where the template wants flat) and write the transform mapping response → template model using only the nine productions. Classify anything inexpressible: (a) belongs to server (filtering/sorting/derivation), (b) belongs to template (formatting/locale/conditional presentation), (c) `$mapper` territory, or (d) **genuine reshaping gap — grammar failure**.
- [ ] **Step 4: Write the verdict.** Save the case table (template → model sketch → transform → classification) and PASS/FAIL to the scratchpad file. Pay attention to whether `$count`, `$entries`, `$merge`, `List`, `$default` each earn their place — note any production with zero natural uses (informational, not a failure).
- [ ] **Step 5: Gate.** If FAIL: stop the plan, report the gap to the user with the failing case. If PASS: proceed to Task 2. No commit (scratch artifact only).

---

### Task 2: Spec — §2 terminology, new §3.8 Transforms, §3.9 grammar renumber, §3.10 Extensibility

**Files:**
- Modify: `VDP/view-descriptor-protocol.md` (§2 ~line 25–34, §3.6 line 174, §3.7 line 196–203, §3.8 line 205–224, cross-refs)

**Interfaces:**
- Produces: section numbers used by all later tasks — Transforms = **§3.8** (subsections §3.8.1 Grammar, §3.8.2 Evaluation Semantics, §3.8.3 Mapper References, §3.8.4 What Transforms Are Not), Formal Grammar = **§3.9**, Extensibility = **§3.10**. Later tasks and the schema description reference these numbers exactly.

- [ ] **Step 1: §2 Terminology.** Rewrite the **Slot**-adjacent definitions: change the **View Descriptor** entry's phrase "a root template URI and its slot assignments" to "a root template URI, its slot assignments, and optionally a transform per node (Section 3.8)". Add to the **Template URI** entry, after "renderable template in the client's rendering framework.": "A template is a *renderable unit* — a Qute template, a Thymeleaf fragment, a React component, a Compose composable, a SwiftUI view. VDP does not require a text template. A template URI implies the **data contract** of the unit it names: the JSON model that unit consumes. The same URI MUST mean the same contract on every platform — otherwise the URI is not one identity." Add a new terminology entry: "**Transform**: A declarative mapping (Section 3.8) that adapts an API response representation into the JSON model a node's template expects. A transform is data, not code."
- [ ] **Step 2: Insert `### 3.8 Transforms` after §3.7.** Content (write in spec voice, keep all normative keywords):
  - Opening: the `transform` member, optional on any view descriptor node; the data-table example from the design brief; the key principle paragraph (transform belongs to the data, not the template — a template does not carry a transform; a descriptor node does, because the node is where this projection of the data meets this template).
  - `#### 3.8.1 Grammar` — the nine-production grammar block verbatim from the design brief, followed by the design points: bare string leaf = RFC 6901 pointer (`""` = whole input), no literal form, `$to` pointers relative to the current element, `$`-prefix reserved (unknown `$` member = malformed, §9.3), `MapperRef` only as the whole transform value, no `$const` (with the `$default` workaround non-endorsement note), and the **deliberately excluded list** with the server/template/`$mapper` assignment sentence.
  - `#### 3.8.2 Evaluation Semantics` — the eleven rules from the design brief as normative prose, in this order: independent projection (with the ASCII diagram and the rejected-chaining/`$source` rationale as a note), transform input (descriptor stripped — cross-ref §4.2), template input (MUST NOT expose untransformed data), identity default, missing pointers → `null` (incl. null-vs-absent indistinguishability), `$map`/`$entries` on wrong type → `null`, empty mapping, `$entries` document ordering (MUST, with the platform-freebie note as non-normative), `$merge` last-wins + non-object operands skipped, `$count` (array length / object member count / else `null`), RFC 6901 escaping and numeric segments, nesting validity (every node incl. `views` members and slot array elements).
  - `#### 3.8.3 Mapper References` — the `$mapper` example, identifier-not-locator (matched verbatim, never fetched, same rules as template URIs — cross-ref §5.4/§6.3), unknown mapper → §9.1 slot failure, OPTIONAL for clients while inline transforms are REQUIRED (cross-ref §15.2), discovery SHOULD declare mapper URIs (cross-ref §13.2).
  - `#### 3.8.4 When Not to Transform` — non-normative: standardized representations (OData `value`/`@odata.count` envelope) should not be adapted; fix the shape at the source; a transform is an adapter, not a default.
- [ ] **Step 3: §3.7 addition.** Append to the §3.7 rules list: "A referenced descriptor SHOULD NOT contain `transform`. A shared descriptor exists to be reused across many responses; a transform binds it to one representation shape, defeating that purpose. Shared subtrees contribute structure only — template, slots, nesting. (A reference site cannot carry a transform: a descriptor reference contains exactly the `descriptor` member, and a transform there could in any case only reach the referenced descriptor's root node, not the inner slots of the shared subtree.)"
- [ ] **Step 4: Renumber old §3.8 → §3.9.** Retitle `### 3.8 Formal Grammar` to `### 3.9 Formal Grammar`. Extend the grammar block: add `"transform"?: Transform` to the `ViewDescriptor` production, and append the nine transform productions to the block (so §3.9 stays the complete formal grammar). Update every cross-reference: run `grep -n "Section 3\.8\|§3\.8" view-descriptor-protocol.md` — expect at least §15.1's "formal grammar (Section 3.8)" → `Section 3.9`. Do NOT touch historical CHANGELOG.md mentions of §3.8.
- [ ] **Step 5: Add `### 3.10 Extensibility`.** The MUST-reject rule verbatim from the design brief plus its rationale paragraph (0.1 client silently mis-rendering a 0.2 descriptor; `x-` for vendor extensions; discovery document unaffected — its §13.2 ignore-unknown clause is its own and unchanged).
- [ ] **Step 6: Verify.** `grep -n "3\.8\|3\.9\|3\.10" view-descriptor-protocol.md` — confirm no stale references; read the new sections once for flow. Markdown only, no build needed.
- [ ] **Step 7: Commit** (in `VDP/`): stage only `view-descriptor-protocol.md`. Subject: `Add transforms, formal grammar update, and the extensibility rule to Section 3`. Body: 2–4 sentences (new §3.8 with grammar/semantics/mapper, §3.7 SHOULD NOT rule, grammar renumbered to §3.9, new §3.10 must-understand rule).

---

### Task 3: Spec — transport, framework mapping, and resolution algorithm (§4, §6.1, §8)

**Files:**
- Modify: `VDP/view-descriptor-protocol.md` (§4.2 ~line 257, §4.4 ~line 319, §6.1 table line 433, §8 lines 589–602)

**Interfaces:**
- Consumes: §3.8/§3.9/§3.10 numbering from Task 2.

- [ ] **Step 1: §4.2.** After the `_views` example, add: "When a node of an inline descriptor declares a `transform` (Section 3.8), the transform input is the response body **with `_view` and `_views` removed**. The same descriptor therefore behaves identically whether delivered inline, by `Link` header, or via discovery — without this rule a descriptor would be bound to its transport, which breaks descriptor caching (Section 5.2)."
- [ ] **Step 2: §4.4.** Add discovery to the precedence discussion: after the 3-item list, add "A view descriptor obtained via discovery (Section 13.2) is a **prefetch/preload hint for the default representation**; the descriptor delivered with a response is always authoritative and takes precedence over any prefetched descriptor."
- [ ] **Step 3: §6.1.** Change the Qute row from `` `{#insert slotName}{/insert}` `` / `` `{#insert mainContent}Default{/insert}` `` to `` `{#include}` with explicit parameters `` / `` `{#include $slot.template _model=$slot.model /}` `` — plus a sentence under the table: "With per-node models (Section 3.8), slot mechanisms that inherit the enclosing data context (such as Qute's `{#insert}`) are insufficient; the include must be explicitly parameterised with the slot's own model. Frameworks with lambda-based slots (Compose, SwiftUI, React) pass per-slot models natively." (If the executor finds the exact Qute include syntax cell awkward, keep the mechanism cell as `{#include}` (parameterised) and put the concrete syntax in the sentence below — the normative point is inherit-vs-parameterised, not Qute syntax trivia.)
- [ ] **Step 4: §8 step 6.** Replace `6. **Render** the composed template tree with the API response data.` with:

  ```markdown
  6. **Render per node.** For each node of the resolved template tree: if the node declares a `transform` (Section 3.8), evaluate it against the original response representation (with any embedded `_view`/`_views` removed, Section 4.2) and render the node's template against exactly the transform result; otherwise render it against the representation unchanged. Each node's transform reads the original representation — never an ancestor's transform output (Section 3.8.2). Frameworks whose slots are lambdas (Compose, SwiftUI, React) absorb per-node models natively; engines whose insertion points inherit the enclosing data context must render each slot independently and inject the rendered output (Section 6.1).
  ```
- [ ] **Step 5: Verify.** Re-read the four edited spots; `grep -n "transform" view-descriptor-protocol.md` should now hit §2, §3, §4.2, §4.4 area, §6.1, §8.
- [ ] **Step 6: Commit** (in `VDP/`): `Wire transforms into transport, slot mapping, and the resolution algorithm`.

---

### Task 4: Spec — error handling and security (§9, §10)

**Files:**
- Modify: `VDP/view-descriptor-protocol.md` (§9.1 ~line 608, §9.3 ~line 631, §9.4 ~line 639, new §9.6, §10 lines 665–681)

**Interfaces:**
- Consumes: §3.8 numbering, error table from the design brief.

- [ ] **Step 1: §9.1.** Extend the "treated as template fetch failures of the affected slot" list with: "An unrecognized `$mapper` URI (Section 3.8.3) — the client has no registered mapper matching the identifier." and "A declared transform that fails to evaluate on a slot node (Section 9.6)."
- [ ] **Step 2: §9.3.** Extend the malformed list: "…missing required `template` field, wrong types, a malformed transform — an unrecognized `$`-prefixed member or invalid JSON Pointer syntax (Section 3.8.1) — or, per Section 3.10, any unrecognized member whose name does not begin with `x-`)".
- [ ] **Step 3: §9.4 rule 2 amendment.** Replace rule 2 with: "A root template failure prevents rendering entirely — the client falls back to raw data or a default template. **Exception:** when the root node declared a `transform` and it failed, the client MUST NOT render the template against untransformed input and MUST NOT fall back to the raw representation — the shapes do not match, and the result is silently wrong output rather than a visible error. The client renders an error template only."
- [ ] **Step 4: New `### 9.6 Transform Failures`.** Content: the distinction between *malformed* transforms (a validation matter — §9.3, unknown `$` construct or invalid pointer syntax, detectable before evaluation) and *evaluation outcomes that are not errors* — a pointer resolving to nothing yields `null` (§3.8.2), `$map` on a non-array yields `null`; render continues. Then the failure table from the design brief as a Markdown table (six rows: malformed → §9.3; missing pointer → null, not an error; `$map` non-array → null, not an error; unknown `$mapper` → §9.1; transform fails on slot node → §9.1; transform fails on root node → error template only, per amended §9.4).
- [ ] **Step 5: §10.** Add a short "Transforms" paragraph after the intro paragraph: "Transforms (Section 3.8) add no executable surface: a transform is inert data. It cannot read files, environment variables, or the network; it cannot loop or recurse unboundedly; it is not Turing-complete. No sandboxing, resource limits, or execution tracking is required. `$mapper` (Section 3.8.3) executes only code the client itself registered — a descriptor can name a mapper but cannot supply one. The template URI allowlist below remains the load-bearing control." Then amend the **CORS** bullet: keep the existing sentence and append "CORS is not a template-trust control: it protects a resource owner from a hostile page, not a fetcher from a hostile resource, and does not apply to server-side BFF requests at all. The allowlist above is the control; CSP `connect-src` is browser-only defence in depth."
- [ ] **Step 6: Verify + commit** (in `VDP/`): grep the new §9.6 cross-refs resolve (3.8.1/3.8.2/3.8.3 exist). Commit: `Define transform failure handling and security posture`.

---

### Task 5: Spec — §7 examples rewritten for per-node models

**Files:**
- Modify: `VDP/view-descriptor-protocol.md` (§7, lines 458–587)

**Interfaces:**
- Consumes: transform grammar from Task 2. Implementers copy these examples — stale ones propagate the 0.1 whole-response model.

- [ ] **Step 1: §7.2 dashboard — the flagship.** Keep the API response as-is (it already has `stats`, `recentActivity`, `chartData`). Rewrite `dashboard.json` so each leaf slot declares its transform:

  ```json
  {
    "template": "example.com/templates/layouts/sidebar",
    "slots": {
      "sidebarNav": {
        "template": "example.com/templates/components/navigation/nav",
        "transform": { "items": "/_links" }
      },
      "mainContent": {
        "template": "example.com/templates/demos/dashboard",
        "slots": {
          "statsCards": {
            "template": "example.com/templates/components/data-display/card",
            "transform": {
              "cards": {
                "$entries": "/stats",
                "$to": { "label": "/key", "value": "/value" }
              }
            }
          },
          "activityTable": {
            "template": "example.com/templates/components/data-display/table",
            "transform": {
              "columns": { "$get": "/columns", "$default": ["user", "action", "item", "time"] },
              "rows": "/recentActivity"
            }
          },
          "revenueChart": {
            "template": "example.com/templates/components/charts/chart",
            "transform": { "labels": "/chartData/labels", "series": "/chartData/values" }
          }
        }
      }
    }
  }
  ```

  Below it, a short walkthrough: each transform reads the **original response** (`/stats`, `/recentActivity`, `/chartData` all resolve against the same document); the `card` template's contract is `{cards: [{label, value}]}` regardless of which API feeds it; the layout and dashboard nodes carry no transform, so they receive the representation unchanged (they render structure, not data).
- [ ] **Step 2: §7.1 login.** Leave the response unchanged; add one sentence: the template's contract here happens to match the representation, so no transform is declared — identity is the default (Section 3.8.2).
- [ ] **Step 3: §7.3 OData.** Add after the example: "The OData envelope (`value`, `@odata.*`) is a standardized representation; a client-side template for OData lists SHOULD be written against that shape rather than adapted to a different contract with a transform (Section 3.8.4). Where a shared template's contract genuinely differs, a transform such as `{ \"rows\": \"/value\" }` bridges it."
- [ ] **Step 4: §7.4 multi-view.** Give the `compact` view a transform showing per-view adaptation of the *same* response: `"transform": { "title": "/name", "price": "/price", "thumbnail": "/images/0" }` on the `product-card` node, and note that `default` declares none.
- [ ] **Step 5: §7.5 BFF.** Update the sequence line `BFF -> Renders composed template tree with data (using Qute, Thymeleaf, etc.)` to `BFF -> Renders each node against its own model (transform output, or the response unchanged) and composes the output (Qute, Thymeleaf, etc.)`.
- [ ] **Step 6: Verify + commit** (in `VDP/`): every example is valid JSON (paste each into `python3 -m json.tool` or check by eye carefully); pointers in examples resolve against the §7.2 response shape. Commit: `Rewrite the examples for per-node models`.

---

### Task 6: Spec — discovery, conformance, references, design decisions (§11–§16, Design Decisions)

**Files:**
- Modify: `VDP/view-descriptor-protocol.md` (§11 table ~line 684, §13.2 ~line 761, §13.3 ~line 807, §15.1/§15.2 ~lines 898–919, §16.1 table ~line 933, Design Decisions ~line 963)

**Interfaces:**
- Consumes: §3.8 numbering; `mappers` discovery member name (exact key: `mappers`) — Task 8's schema uses the same name.

- [ ] **Step 1: §13.2 `mappers` member.** In the discovery example JSON, add after `trustedTemplateUrls`: `"mappers": ["https://example.com/mappers/dataset-to-table"]`. Add prose: "The optional `mappers` member lists the `$mapper` URIs (Section 3.8.3) that descriptors from this API may reference. A client SHOULD compare the list against its registered mappers before relying on endpoints whose descriptors need them; a server SHOULD NOT emit a `$mapper` URI it does not declare here. Like template URIs, mapper URIs are identifiers — listing one does not make it fetchable." Also add, cross-referencing §4.4: "Discovery `endpoints` entries are a prefetch/preload hint for the default representation of each endpoint; the descriptor delivered with an actual response is authoritative (Section 4.4)."
- [ ] **Step 2: §13.3.** Confirm the `x-vdp` text still reads as discovery-as-hint; append one sentence: "As with the discovery document, `x-vdp` metadata is advisory — the descriptor delivered with a response is authoritative (Section 4.4)."
- [ ] **Step 3: §15.1 (server).** Add bullets: "MUST emit only transforms valid per the Section 3.8.1 grammar (equivalently, that validate against the published JSON Schema)." and "SHOULD declare in its discovery document (Section 13.2) every `$mapper` URI its descriptors may reference."
- [ ] **Step 4: §15.2 (client).** Add bullets: "MUST implement transform evaluation (Section 3.8) — the full inline grammar; `$mapper` support (Section 3.8.3) is OPTIONAL." / "MUST evaluate every transform against the original response representation (Section 3.8.2) and give the template exactly the transform result." / "MUST reject descriptor nodes containing unrecognized members whose names do not begin with `x-` (Section 3.10)." / "MUST parse JSON objects order-preservingly wherever `$entries` results are rendered (Section 3.8.2)." Also amend the existing bullet "MUST reject invalid view descriptors (Section 9.3)…" to mention malformed transforms are §9.3 territory.
- [ ] **Step 5: §11 + §16.1 RFC 6901 row.** §11 table add row: `| [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901) (JSON Pointer) | Transform pointers (Section 3.8) use JSON Pointer syntax and resolution as written |`. §16.1 table add (keep RFC-number order): `| [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901) | JavaScript Object Notation (JSON) Pointer | Transform pointer syntax, escaping, and numeric-segment resolution — Section 3.8 |`.
- [ ] **Step 6: Design Decision #2 (template parameters) — revisit, keep the conclusion.** Replace the entry with: "**Template parameters** (e.g., passing `{\"compact\": true}` to a template): **Still not in scope.** A transform (Section 3.8) is arguably a way of passing a model — but it *adapts data that already exists in the response*; it does not configure the template. That line is why the transform grammar has no `$const`: a literal at a key is a template parameter by another name. Literals appear only inside `$default`, as a fallback for real data. Configuration and styling remain the template's own affair."
- [ ] **Step 7: Design Decision #3 (data-to-template mapping) — rewrite, conclusion inverted.** Replace with: "**Data-to-template mapping** (specifying which JSON fields feed which template): **In scope as of 0.2 — as declarative reshaping only.** 0.1 left each template to extract data from the whole response, which quietly coupled every template to every response shape and made a template URI's data contract mean different things behind different endpoints. The `transform` member (Section 3.8) moves the mapping into the descriptor: a pointer-based reshaping with no logic, no filtering, no computation — those remain server-side (or in client-registered `$mapper` code). jq was rejected (implementations diverge across platforms on regex, key ordering, and numerics; an expression is executable code requiring a sandbox; VDP needs a dozen operations, not a language), JMESPath was rejected (no Kotlin Multiplatform implementation — the compliance suite doesn't pay for writing one), and a custom expression language was rejected (zero implementations, guaranteed creep toward re-implementing jq, no AI training corpus). A root-only transform with per-slot source pointers was rejected because it is two mechanisms and couples the tree — swapping a slot's template would force edits to the root transform."
- [ ] **Step 8: Verify + commit** (in `VDP/`): grep for `mappers`, `6901`, re-read both design decisions. Commit: `Add mapper discovery, transform conformance, and updated design decisions`.

---

### Task 7: Spec version bump + changelog

**Files:**
- Modify: `VDP/view-descriptor-protocol.md` (line 4 `**Version:** 0.1`; §12.2 `version=0.1` example; §13.1 `VDP-Version: 0.1`; §13.2 `"version": "0.1"`)
- Modify: `VDP/CHANGELOG.md` (top of `[Unreleased]`)

**Interfaces:**
- Consumes: everything Tasks 2–6 wrote (the changelog describes it).

- [ ] **Step 1: Bump version strings.** `grep -n "0\.1" view-descriptor-protocol.md` — change the header to `**Version:** 0.2`, §12.2 example to `application/vdp+json; version=0.2`, §13.1 to `VDP-Version: 0.2`, §13.2 example to `"version": "0.2"`. Leave RFC numbers, `v0-1` schema filenames in historical text, and anything in CHANGELOG untouched. Also update CHANGELOG.md's intro line "entries below track the evolution of the v0.1 draft" → "…of the draft".
- [ ] **Step 2: Changelog entries.** Under `## [Unreleased]` / `### Added`, dated 2026-08-03 (adjust to actual date), add entries covering: (1) the `transform` member — one-paragraph summary of grammar (nine productions over RFC 6901 pointers), independent projection, identity default, `$mapper`, REQUIRED/OPTIONAL split, new §3.8 and renumbered §3.9; **include the semantics callout verbatim:** "Note: earlier design discussion used `\"transform\": \"<string>\"` to mean a jq expression. In the final design a string is an RFC 6901 JSON Pointer and an object is a mapping — same syntax, different semantics."; (2) the §3.10 extensibility rule (must-understand members, `x-` escape); (3) §9.6 + §9.4 rule 2 amendment; (4) discovery `mappers` member; (5) new schemas `vdp.v0-2.schema.json` / `vdp-discovery.v0-2.schema.json` and the `tests/` corpus (written in this release — reference forward, Tasks 8–10 create them in the same push); (6) under `### Changed`: protocol version 0.1 → 0.2, §6.1 Qute row `{#insert}` → parameterised `{#include}`, §7 examples rewritten for per-node models, Design Decision #3 rewritten (mapping now in scope as declarative reshaping).
- [ ] **Step 3: Commit** (in `VDP/`): stage both files. Subject: `Bump the specification to 0.2`. Body summarizing the version bump + changelog documentation.

---

### Task 8: JSON Schemas v0-2 + examples

**Files:**
- Create: `VDP/vdp.v0-2.schema.json` (full content below)
- Create: `VDP/vdp-discovery.v0-2.schema.json` (delta from v0-1, below)
- Create: `VDP/examples/vdp-transform.json`, `VDP/examples/vdp-transform-mapper.json`, `VDP/examples/discovery-mappers.json`
- Modify: `VDP/examples/discovery-basic.json`, `VDP/examples/discovery-templated.json` (`"version": "0.2"`)
- Do NOT modify: `vdp.v0-1.schema.json`, `vdp-discovery.v0-1.schema.json`

**Interfaces:**
- Produces: `vdp.v0-2.schema.json` with `$defs`: `ViewDescriptor`, `MultiViewDescriptor`, `DescriptorReference`, `TemplateURI`, `Slots`, `SlotDescriptor`, `SlotValue`, `JsonPointer`, `Transform`, `TransformNode`, `TransformMapping`, `TransformList`, `TransformProjection`, `TransformEntries`, `TransformDefaulted`, `TransformCount`, `TransformMerge`, `TransformMapperRef`. Tasks 9–10 validate fixtures against this file; Task 12 copies both schemas to the site.

- [ ] **Step 1: Write `vdp.v0-2.schema.json`.** Start from v0-1 (copy) and apply: new `$id` `https://vdprotocol.org/schemas/vdp.v0-2.schema.json`, title `View Descriptor Protocol (VDP) v0.2`, description updated to mention transforms and the §3.10 extensibility rule. On `ViewDescriptor`, `MultiViewDescriptor`, and `DescriptorReference`: replace `"additionalProperties": false` with `"patternProperties": { "^x-": true }, "unevaluatedProperties": false` (schema-level enforcement of §3.10). Add to `ViewDescriptor.properties`: `"transform": { "$ref": "#/$defs/Transform" }`. Add these `$defs` (exact content):

  ```json
  "JsonPointer": {
    "type": "string",
    "pattern": "^(/([^/~]|~[01])*)*$",
    "description": "An RFC 6901 JSON Pointer. The empty string addresses the whole transform input. A pointer that resolves to nothing yields null (spec Section 3.8.2) — that is not an error."
  },
  "Transform": {
    "description": "A transform (spec Section 3.8): a JSON Pointer, a Mapping, or a MapperRef. Evaluated against the original response representation (with any embedded _view/_views removed), never against an ancestor node's transform output.",
    "if": { "type": "object", "required": ["$mapper"] },
    "then": { "$ref": "#/$defs/TransformMapperRef" },
    "else": { "$ref": "#/$defs/TransformNode" }
  },
  "TransformNode": {
    "description": "A transform node: Pointer | Mapping | List | Projection | Entries | Defaulted | Count | Merge. Discriminated on key presence with if/then/else so validation errors name the intended construct.",
    "if": { "type": "object", "required": ["$map"] },
    "then": { "$ref": "#/$defs/TransformProjection" },
    "else": {
      "if": { "type": "object", "required": ["$entries"] },
      "then": { "$ref": "#/$defs/TransformEntries" },
      "else": {
        "if": { "type": "object", "required": ["$get"] },
        "then": { "$ref": "#/$defs/TransformDefaulted" },
        "else": {
          "if": { "type": "object", "required": ["$count"] },
          "then": { "$ref": "#/$defs/TransformCount" },
          "else": {
            "if": { "type": "object", "required": ["$merge"] },
            "then": { "$ref": "#/$defs/TransformMerge" },
            "else": {
              "if": { "type": "string" },
              "then": { "$ref": "#/$defs/JsonPointer" },
              "else": {
                "if": { "type": "array" },
                "then": { "$ref": "#/$defs/TransformList" },
                "else": { "$ref": "#/$defs/TransformMapping" }
              }
            }
          }
        }
      }
    }
  },
  "TransformMapping": {
    "type": "object",
    "description": "An output object: each key becomes a member of the produced model, each value is a transform node evaluated against the same input. Keys MUST NOT begin with '$' (reserved for constructs); an unrecognized '$'-prefixed member makes the descriptor invalid (spec Section 9.3). {} is legal and produces {}.",
    "propertyNames": { "pattern": "^(?!\\$)" },
    "additionalProperties": { "$ref": "#/$defs/TransformNode" }
  },
  "TransformList": {
    "type": "array",
    "description": "An output array built from transform nodes, each evaluated against the same input.",
    "items": { "$ref": "#/$defs/TransformNode" }
  },
  "TransformProjection": {
    "type": "object",
    "description": "Projects each element of the array at $map through $to. Inside $to, pointers are relative to the current element. A non-array $map target yields null (not an error).",
    "properties": {
      "$map": { "$ref": "#/$defs/JsonPointer" },
      "$to": { "$ref": "#/$defs/TransformNode" }
    },
    "required": ["$map", "$to"],
    "patternProperties": { "^x-": true },
    "unevaluatedProperties": false
  },
  "TransformEntries": {
    "type": "object",
    "description": "Emits {\"key\": ..., \"value\": ...} per member of the object at $entries, in document order (spec Section 3.8.2), optionally reshaped through $to. A non-object target yields null.",
    "properties": {
      "$entries": { "$ref": "#/$defs/JsonPointer" },
      "$to": { "$ref": "#/$defs/TransformNode" }
    },
    "required": ["$entries"],
    "patternProperties": { "^x-": true },
    "unevaluatedProperties": false
  },
  "TransformDefaulted": {
    "type": "object",
    "description": "The value at $get, or the literal $default when the pointer resolves to nothing (or to an explicit null — the two are indistinguishable, spec Section 3.8.2).",
    "properties": {
      "$get": { "$ref": "#/$defs/JsonPointer" },
      "$default": true
    },
    "required": ["$get", "$default"],
    "patternProperties": { "^x-": true },
    "unevaluatedProperties": false
  },
  "TransformCount": {
    "type": "object",
    "description": "The element count of the array at $count, or the member count of the object at $count; null for anything else.",
    "properties": {
      "$count": { "$ref": "#/$defs/JsonPointer" }
    },
    "required": ["$count"],
    "patternProperties": { "^x-": true },
    "unevaluatedProperties": false
  },
  "TransformMerge": {
    "type": "object",
    "description": "Shallow-merges the object results of the operand nodes; last operand wins on key collision. Operands that do not evaluate to objects (including null) are skipped.",
    "properties": {
      "$merge": {
        "type": "array",
        "items": { "$ref": "#/$defs/TransformNode" },
        "minItems": 1
      }
    },
    "required": ["$merge"],
    "patternProperties": { "^x-": true },
    "unevaluatedProperties": false
  },
  "TransformMapperRef": {
    "type": "object",
    "description": "A reference to mapping code the client has registered (spec Section 3.8.3). The URI is an identifier, matched verbatim, never fetched — the same identity rules as template URIs. Valid only as the entire transform value. Client support is OPTIONAL; an unrecognized mapper URI is a slot failure (spec Section 9.1).",
    "properties": {
      "$mapper": {
        "type": "string",
        "format": "uri-reference",
        "minLength": 1
      }
    },
    "required": ["$mapper"],
    "patternProperties": { "^x-": true },
    "unevaluatedProperties": false
  }
  ```

  Note: every `if` includes `"type": "object"` alongside `required` — `required` alone is vacuously true for non-objects and would misroute strings/arrays into construct branches.
- [ ] **Step 2: Write `vdp-discovery.v0-2.schema.json`.** Copy `vdp-discovery.v0-1.schema.json`; change `$id` to `https://vdprotocol.org/schemas/vdp-discovery.v0-2.schema.json`, title to v0.2, bump the version-example text in the `version` description to `"0.2"`, and add to `properties`:

  ```json
  "mappers": {
    "type": "array",
    "description": "The $mapper URIs (spec Section 3.8.3) that descriptors from this API may reference. Mapper URIs are identifiers, matched verbatim against the client's registered mappers — listing one does not make it fetchable.",
    "items": {
      "type": "string",
      "format": "uri-reference",
      "minLength": 1
    }
  }
  ```
- [ ] **Step 3: Examples.** Create `examples/vdp-transform.json` — the §7.2 dashboard descriptor from Task 5 Step 1, verbatim. Create `examples/vdp-transform-mapper.json`:

  ```json
  {
    "template": "example.com/templates/data-table",
    "transform": { "$mapper": "https://example.com/mappers/dataset-to-table" }
  }
  ```

  Create `examples/discovery-mappers.json` — copy `discovery-basic.json`, set `"version": "0.2"`, add the `mappers` array with `"https://example.com/mappers/dataset-to-table"`. Update `discovery-basic.json` and `discovery-templated.json` to `"version": "0.2"`.
- [ ] **Step 4: Validate locally (podman, from `VDP/`):**

  ```bash
  podman run --rm -v .:/work:Z -w /work node:lts sh -c "npm install --no-save ajv-cli ajv-formats && npx ajv-cli test --spec=draft2020 -s vdp.v0-2.schema.json -d 'examples/vdp-*.json' --valid -c ajv-formats && npx ajv-cli test --spec=draft2020 -s vdp-discovery.v0-2.schema.json -d 'examples/discovery-*.json' --valid -c ajv-formats"
  ```

  Expected: every file PASSES (all 0.1 examples are forward-valid — `transform` is optional). If ajv chokes on the `^(?!\$)` lookahead or `unevaluatedProperties`, fix the schema (fallback for the mapping key rule: `"pattern": "^[^$]"` plus allowing the empty key via `"pattern": "^($|[^$])"` — but try the lookahead first; ajv compiles ECMA regexes and supports 2020-12 `unevaluatedProperties`).
- [ ] **Step 5: Negative smoke test.** In the scratchpad (NOT the repo), write `bad-transform.json` `{"template": "t", "transform": {"$filter": "/x"}}` and `bad-member.json` `{"template": "t", "custom": 1}`; run ajv with `--invalid` against `vdp.v0-2.schema.json`; both must be rejected. (`{"$filter": "/x"}` falls through to `TransformMapping`, whose `propertyNames` bans `$` keys.)
- [ ] **Step 6: Commit** (in `VDP/`): stage the two new schemas + examples. Subject: `Add the v0.2 JSON Schemas and transform examples`.

---

### Task 9: Test corpus

**Files:**
- Create: `VDP/tests/README.md`
- Create: `VDP/tests/descriptors/valid/*.json` (5 files), `VDP/tests/descriptors/invalid/*.json` (6 files)
- Create: `VDP/tests/transforms/<case>/{input,transform,expected}.json` (18 cases)
- Create: `VDP/tests/rendering/<case>/{response,descriptor,expected}.json` (2 cases)

**Interfaces:**
- Produces: the corpus contract Task 10's runner implements: transforms case = directory with `input.json` + `expected.json` + optional `transform.json` (absent ⇒ identity); rendering case = `response.json` + `descriptor.json` + `expected.json` where expected maps node paths (`"root"`, `"slots.<name>"`) to that node's model.

- [ ] **Step 1: `tests/README.md`.** Document: purpose (language-neutral fixtures — the artifact that proves a descriptor renders identically on every implementation); layout of the three fixture kinds and their contracts (as in Interfaces above, plus: descriptor fixtures under `valid/` MUST be accepted by `vdp.v0-2.schema.json` and under `invalid/` MUST be rejected); how to run them with the reference runner (`tests/run-transforms.mjs`, Task 10) via podman; and one caveat: JavaScript reorders integer-like object keys on `JSON.parse`, so `$entries` document-ordering fixtures avoid integer-like keys — a conforming client on a stack with that behaviour needs an order-preserving parse for such objects (spec Section 3.8.2).
- [ ] **Step 2: Descriptor fixtures — valid** (each accepted by the v0-2 schema):
  - `valid/transform-pointer.json`: `{"template": "example.com/templates/detail", "transform": "/data/0"}`
  - `valid/transform-mapping.json`: `{"template": "example.com/templates/data-table", "transform": {"heading": "/dataset/title", "rows": "/data"}}`
  - `valid/transform-constructs.json`: a descriptor using `$map`+`$to`, `$entries`, `$get`+`$default`, `$count`, `$merge`, and a List in one `slots` tree (compose from the Task 5 dashboard plus `"summary": {"$merge": ["/defaults", "/overrides"]}` and `"pair": ["/a", "/b"]`)
  - `valid/transform-mapper.json`: `{"template": "example.com/templates/data-table", "transform": {"$mapper": "https://example.com/mappers/dataset-to-table"}}`
  - `valid/x-extension.json`: `{"template": "example.com/templates/card", "x-vendor-note": {"anything": true}, "transform": {"title": "/name"}}`
  - `valid/empty-mapping.json`: `{"template": "example.com/templates/static-panel", "transform": {}}`
- [ ] **Step 3: Descriptor fixtures — invalid** (each rejected):
  - `invalid/unknown-dollar-construct.json`: `{"template": "t", "transform": {"$filter": "/items"}}`
  - `invalid/unknown-member.json`: `{"template": "t", "custom": true}`
  - `invalid/transform-on-reference-site.json`: `{"template": "t", "slots": {"nav": {"descriptor": "https://example.com/views/nav.json", "transform": {"a": "/b"}}}}`
  - `invalid/bad-pointer-syntax.json`: `{"template": "t", "transform": {"title": "no-leading-slash"}}` (also exercises `~2` rejection: use `{"title": "/a~2b"}` in a second member — actually put both members in this one file)
  - `invalid/projection-missing-to.json`: `{"template": "t", "transform": {"rows": {"$map": "/items"}}}`
  - `invalid/mapper-inside-node.json`: `{"template": "t", "transform": {"rows": {"$mapper": "https://example.com/mappers/m"}}}` (MapperRef is top-level only; inner object with `$mapper` falls to Mapping → `$` key banned)
- [ ] **Step 4: Transform triples.** Create these 18 case directories (`input.json` / `transform.json` / `expected.json` shown as I / T / E; `(none)` = omit the file):

  | case | I | T | E |
  |---|---|---|---|
  | `identity-absent` | `{"a": 1, "b": [2, 3]}` | (none) | `{"a": 1, "b": [2, 3]}` |
  | `pointer-empty` | `{"a": 1}` | `""` | `{"a": 1}` |
  | `pointer-simple` | `{"dataset": {"title": "Sales"}}` | `"/dataset/title"` | `"Sales"` |
  | `pointer-array-index` | `{"data": [{"id": 1}, {"id": 2}]}` | `"/data/0"` | `{"id": 1}` |
  | `pointer-numeric-object-key` | `{"0": "zero", "items": {"1": "one"}}` | `{"first": "/0", "second": "/items/1"}` | `{"first": "zero", "second": "one"}` |
  | `mapping-flat-rename` | `{"dataset": {"title": "Sales"}, "data": [1, 2]}` | `{"heading": "/dataset/title", "rows": "/data"}` | `{"heading": "Sales", "rows": [1, 2]}` |
  | `mapping-nested-output` | `{"title": "T", "meta": {"subtitle": "S"}}` | `{"header": {"main": "/title", "sub": "/meta/subtitle"}}` | `{"header": {"main": "T", "sub": "S"}}` |
  | `map-with-to` | `{"items": [{"n": "a", "v": 1}, {"n": "b", "v": 2}]}` | `{"rows": {"$map": "/items", "$to": {"name": "/n", "value": "/v"}}}` | `{"rows": [{"name": "a", "value": 1}, {"name": "b", "value": 2}]}` |
  | `map-nested` | `{"orders": [{"id": 1, "lines": [{"sku": "x"}]}, {"id": 2, "lines": []}]}` | `{"orders": {"$map": "/orders", "$to": {"id": "/id", "items": {"$map": "/lines", "$to": "/sku"}}}}` | `{"orders": [{"id": 1, "items": ["x"]}, {"id": 2, "items": []}]}` |
  | `map-non-array` | `{"items": {"not": "an array"}}` | `{"rows": {"$map": "/items", "$to": "/x"}}` | `{"rows": null}` |
  | `entries-plain` | `{"scores": {"math": 90, "art": 80}}` | `{"list": {"$entries": "/scores"}}` | `{"list": [{"key": "math", "value": 90}, {"key": "art", "value": 80}]}` |
  | `entries-with-to` | `{"scores": {"math": 90, "art": 80}}` | `{"list": {"$entries": "/scores", "$to": {"label": "/key", "points": "/value"}}}` | `{"list": [{"label": "math", "points": 90}, {"label": "art", "points": 80}]}` |
  | `entries-document-order` | `{"legend": {"zebra": 1, "apple": 2, "mango": 3}}` | `{"$entries": "/legend"}` | `[{"key": "zebra", "value": 1}, {"key": "apple", "value": 2}, {"key": "mango", "value": 3}]` |
  | `default-present-and-absent` | `{"user": {"name": "Ada"}}` | `{"name": {"$get": "/user/name", "$default": "anonymous"}, "role": {"$get": "/user/role", "$default": "viewer"}}` | `{"name": "Ada", "role": "viewer"}` |
  | `count` | `{"items": [1, 2, 3], "attrs": {"a": 1, "b": 2}, "s": "str"}` | `{"n": {"$count": "/items"}, "m": {"$count": "/attrs"}, "x": {"$count": "/s"}, "missing": {"$count": "/nope"}}` | `{"n": 3, "m": 2, "x": null, "missing": null}` |
  | `merge-last-wins` | `{"defaults": {"a": 1, "b": 1}, "overrides": {"b": 2}, "notobj": 5}` | `{"$merge": ["/defaults", "/overrides", "/notobj", "/missing"]}` | `{"a": 1, "b": 2}` |
  | `list-node` | `{"a": 1, "b": {"c": 2}}` | `{"pair": ["/a", "/b/c"]}` | `{"pair": [1, 2]}` |
  | `missing-pointer-null` | `{"present": 1}` | `{"there": "/present", "gone": "/absent/deep"}` | `{"there": 1, "gone": null}` |
  | `rfc6901-escaping` | `{"a/b": 1, "m~n": 2}` | `{"slash": "/a~1b", "tilde": "/m~0n"}` | `{"slash": 1, "tilde": 2}` |
- [ ] **Step 5: Rendering fixtures** (descriptor-level semantics):
  - `rendering/independent-projection/`: `response.json` = `{"dataset": {"title": "Sales"}, "data": [1, 2], "user": {"name": "Ada"}}`; `descriptor.json` = root node `{"template": "example.com/templates/layout", "transform": {"heading": "/dataset/title"}, "slots": {"who": {"template": "example.com/templates/user-badge", "transform": {"name": "/user/name"}}}}`; `expected.json` = `{"root": {"heading": "Sales"}, "slots": {"who": {"name": "Ada"}}}`. The point: the root transform discards `/user`, yet the slot still sees it — slot transforms read the original response.
  - `rendering/embedded-transport-strip/`: `response.json` = `{"_view": {"template": "example.com/templates/summary", "transform": {"keys": {"$entries": ""}}}, "revenue": 42}`; `descriptor.json` = the same descriptor as embedded (`{"template": "example.com/templates/summary", "transform": {"keys": {"$entries": ""}}}`); `expected.json` = `{"root": {"keys": [{"key": "revenue", "value": 42}]}}`. The point: `_view` is stripped from the transform input, so `$entries` over `""` sees only `revenue`.
- [ ] **Step 6: Validate descriptor fixtures now** (podman, from `VDP/`): v0-2 schema accepts all of `tests/descriptors/valid/*.json` (`--valid`) and rejects all of `tests/descriptors/invalid/*.json` (`--invalid`). Fix any fixture/schema disagreement before committing — if `invalid/bad-pointer-syntax.json` is NOT rejected, the `JsonPointer` pattern is wrong, not the fixture.
- [ ] **Step 7: Commit** (in `VDP/`): `Add the language-neutral test corpus for 0.2 transforms`.

---

### Task 10: Reference runner + CI

**Files:**
- Create: `VDP/tests/run-transforms.mjs`
- Modify: `VDP/.github/workflows/test-and-diagrams.yml`

**Interfaces:**
- Consumes: corpus contract from Task 9; `vdp.v0-2.schema.json` from Task 8.
- Produces: `node tests/run-transforms.mjs` exits 0 iff every transforms/ and rendering/ case matches; CI validates examples against v0-2, corpus descriptors valid/invalid, and runs the runner.

- [ ] **Step 1: Write `tests/run-transforms.mjs`** (complete content — non-normative reference implementation of spec §3.8.2, no dependencies):

  ```js
  #!/usr/bin/env node
  // Non-normative reference runner for the VDP 0.2 transform corpus (spec Section 3.8).
  // Usage: node tests/run-transforms.mjs   (from the repository root)
  import { readdirSync, readFileSync, existsSync } from "node:fs";
  import { join, dirname } from "node:path";
  import { fileURLToPath } from "node:url";

  const testsDir = dirname(fileURLToPath(import.meta.url));

  function resolvePointer(doc, pointer) {
    if (pointer === "") return doc === undefined ? null : doc;
    let cur = doc;
    for (const raw of pointer.slice(1).split("/")) {
      const token = raw.replace(/~1/g, "/").replace(/~0/g, "~");
      if (Array.isArray(cur)) {
        if (!/^(0|[1-9][0-9]*)$/.test(token)) return null;
        cur = cur[Number(token)];
      } else if (cur !== null && typeof cur === "object") {
        if (!Object.prototype.hasOwnProperty.call(cur, token)) return null;
        cur = cur[token];
      } else {
        return null;
      }
      if (cur === undefined) return null;
    }
    return cur;
  }

  function evalNode(node, input) {
    if (typeof node === "string") return resolvePointer(input, node);
    if (Array.isArray(node)) return node.map((n) => evalNode(n, input));
    if (node !== null && typeof node === "object") {
      if ("$map" in node) {
        const arr = resolvePointer(input, node.$map);
        return Array.isArray(arr) ? arr.map((el) => evalNode(node.$to, el)) : null;
      }
      if ("$entries" in node) {
        const obj = resolvePointer(input, node.$entries);
        if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return null;
        const pairs = Object.entries(obj).map(([key, value]) => ({ key, value }));
        return "$to" in node ? pairs.map((p) => evalNode(node.$to, p)) : pairs;
      }
      if ("$get" in node) {
        const v = resolvePointer(input, node.$get);
        return v === null ? node.$default : v;
      }
      if ("$count" in node) {
        const v = resolvePointer(input, node.$count);
        if (Array.isArray(v)) return v.length;
        if (v !== null && typeof v === "object") return Object.keys(v).length;
        return null;
      }
      if ("$merge" in node) {
        const out = {};
        for (const op of node.$merge) {
          const v = evalNode(op, input);
          if (v !== null && typeof v === "object" && !Array.isArray(v)) Object.assign(out, v);
        }
        return out;
      }
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = evalNode(v, input);
      return out;
    }
    return null;
  }

  function applyTransform(transform, input) {
    return transform === undefined ? input : evalNode(transform, input);
  }

  function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b); // corpus fixtures use matching member order
  }

  const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
  let failures = 0;
  let cases = 0;

  function check(name, actual, expected) {
    cases++;
    if (!deepEqual(actual, expected)) {
      failures++;
      console.error(`FAIL ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
    } else {
      console.log(`ok   ${name}`);
    }
  }

  const transformsDir = join(testsDir, "transforms");
  for (const name of readdirSync(transformsDir).sort()) {
    const dir = join(transformsDir, name);
    const input = readJson(join(dir, "input.json"));
    const tPath = join(dir, "transform.json");
    const transform = existsSync(tPath) ? readJson(tPath) : undefined;
    check(`transforms/${name}`, applyTransform(transform, input), readJson(join(dir, "expected.json")));
  }

  const renderingDir = join(testsDir, "rendering");
  for (const name of readdirSync(renderingDir).sort()) {
    const dir = join(renderingDir, name);
    const response = readJson(join(dir, "response.json"));
    const descriptor = readJson(join(dir, "descriptor.json"));
    const expected = readJson(join(dir, "expected.json"));
    const input = { ...response };
    delete input._view;
    delete input._views;
    const models = { root: applyTransform(descriptor.transform, input) };
    if (descriptor.slots) {
      models.slots = {};
      for (const [slot, sd] of Object.entries(descriptor.slots)) {
        models.slots[slot] = applyTransform(sd.transform, input);
      }
    }
    check(`rendering/${name}`, models, expected);
  }

  console.log(`${cases - failures}/${cases} corpus cases passed`);
  process.exit(failures === 0 ? 0 : 1);
  ```

  (The rendering harness handles one level of slots — enough for the two fixtures; extend only if a future fixture needs depth.)
- [ ] **Step 2: Run it** (podman, from `VDP/`): `podman run --rm -v .:/work:Z -w /work node:lts node tests/run-transforms.mjs`. Expected: `20/20 corpus cases passed`, exit 0. Any FAIL is a fixture bug or a semantics misunderstanding — resolve against the spec §3.8.2 text (the spec is authoritative; fix whichever of fixture/runner disagrees with it).
- [ ] **Step 3: Sabotage check** (verify the runner can fail): temporarily change one expected value, rerun, confirm non-zero exit and a FAIL line; revert.
- [ ] **Step 4: Update CI** (`.github/workflows/test-and-diagrams.yml`). Replace the "Validate VDP examples" step's schema with `vdp.v0-2.schema.json`, the discovery step's with `vdp-discovery.v0-2.schema.json`, and add after them:

  ```yaml
        - name: Validate corpus descriptor fixtures
          run: |
            npx ajv-cli test --spec=draft2020 -s vdp.v0-2.schema.json -d 'tests/descriptors/valid/*.json' --valid -c ajv-formats
            npx ajv-cli test --spec=draft2020 -s vdp.v0-2.schema.json -d 'tests/descriptors/invalid/*.json' --invalid -c ajv-formats

        - name: Run transform corpus
          run: |
            node tests/run-transforms.mjs
  ```

  Leave the RVST step and diagram steps untouched.
- [ ] **Step 5: Full local CI rehearsal** (podman, from `VDP/`): one command chaining all four validations (examples×2, corpus valid, corpus invalid) plus the runner. All green.
- [ ] **Step 6: Commit** (in `VDP/`): `Add the reference transform runner and corpus validation to CI`.

---

### Task 11: Housekeeping — CLAUDE.md, README

**Files:**
- Modify: `/home/jn/Projects/ViewDescriptorProtocol/CLAUDE.md` (not in any repo — no commit for it)
- Modify: `VDP/README.md` (only if it states a version or schema filename)

- [ ] **Step 1: CLAUDE.md.** Update "Current VDP schema versions" to name `vdp.v0-2.schema.json` and `vdp-discovery.v0-2.schema.json` (v0-1 kept published for `$id` resolution); update both podman validation commands to the v0-2 schema filenames; add one line for the corpus: "Run the transform corpus: `podman run --rm -v .:/work:Z -w /work node:lts node tests/run-transforms.mjs` (from `VDP/`)." Update the VDP bullet's description to mention transforms ("…which templates to use for which data, using slots, template URIs, and per-node declarative transforms").
- [ ] **Step 2: README.** `grep -n "0\.1\|v0-1" VDP/README.md` — update any current-version claims to 0.2 / v0-2 (leave historical/changelog-style text alone). If no hits, skip.
- [ ] **Step 3: Commit** (in `VDP/`, only if README changed): `Update the README for 0.2`.

---

### Task 12: Site mirror + build gate

**Files (all in `ViewDescriptorProtocol.github.io/`, branch `master`):**
- Modify: `docs/specification.md`, `docs/changelog.md`, `docs/schema.md`
- Create: `docs/schemas/vdp.v0-2.schema.json`, `docs/schemas/vdp-discovery.v0-2.schema.json`
- Modify (as needed): `docs/index.md`, `docs/examples.md`, `docs/implementers-guide.md`, `docs/deployment-scenarios.md`, `docs/related-projects.md`

**Interfaces:**
- Consumes: final spec + changelog + schemas from Tasks 2–10.

- [ ] **Step 1: Mirror spec + changelog.** Capture the current trailing `*[abbr]:` lines from each of `docs/specification.md` and `docs/changelog.md` (e.g. `tail -5`), then regenerate each as: canonical file content + blank line + those same abbr lines. Use `cat`, not manual editing.
- [ ] **Step 2: Schemas.** Copy `VDP/vdp.v0-2.schema.json` and `VDP/vdp-discovery.v0-2.schema.json` into `docs/schemas/` (v0-1 copies stay — their `$id` URLs must keep serving). `diff` each copy against the canonical file to confirm byte-identity.
- [ ] **Step 3: Regenerate `docs/schema.md`.** Follow its existing structure: update the "Current versions" list to the v0-2 files (linked at their `$id` URLs), add a "Previous versions" line linking the v0-1 files ("superseded by v0.2; kept published so their `$id` URLs continue to resolve"), and re-embed the **v0-2** schema contents verbatim in the two code blocks. Add a short non-normative note after the descriptor schema: the schema validates descriptor shape, not transform output — a transform producing `{"heading": …}` for a template wanting `{"title": …}` is schema-valid and renders blank; a future direction is template-declared model schemas published at the template URI, validated at cache-warm time.
- [ ] **Step 4: Page sweep.** `grep -rn "0\.1\|v0-1\|data binding\|whole response" docs/*.md` — in `index.md`, `examples.md`, `implementers-guide.md`, `deployment-scenarios.md`, `related-projects.md`, update statements 0.2 falsifies: current-version claims, "templates extract data from the API response" framings (now: each node's template receives its own model — the transform output or the untouched representation), and any example worth upgrading to show a `transform`. Do not rewrite pages wholesale — minimal true-statement edits. The `overrides/` and `assets/` dirs and D2 SVGs are untouched (no diagram depicts data flow per node; if the sweep finds one that now lies, flag it to the user rather than regenerating — diagram workflow is a separate memory-documented process).
- [ ] **Step 5: Build gate.** In the site repo: `make build` — actually run `python -m mkdocs build --strict` via the Makefile path (`make build` uses the venv if present). Expected: zero warnings/errors. Fix anything strict mode flags (typically broken anchors from the §3.8/§3.9 renumber).
- [ ] **Step 6: Commit** (in `ViewDescriptorProtocol.github.io/`): one commit. Subject: `Mirror the 0.2 specification, schemas, and changelog`. Body listing: spec/changelog mirrored, v0-2 schemas published alongside v0-1, schema.md regenerated, page sweep for per-node models.

---

### Task 13: Final verification + handoff

- [ ] **Step 1: Full validation sweep** (podman, from `VDP/`): examples against both v0-2 schemas, corpus valid/invalid, runner — all green in one chained command.
- [ ] **Step 2: Cross-reference audit.** `grep -n "Section 3\.[89]\|Section 3\.10\|Section 9\.6\|3\.8\.[1-4]" VDP/view-descriptor-protocol.md` — every referenced section exists; no reference to the old §3.8 grammar remains mislabeled.
- [ ] **Step 3: Git status audit.** `git status` in both repos: clean trees, all intended commits present (`git log --oneline develop` in VDP, `master` in site). Nothing pushed.
- [ ] **Step 4: Report to the user.** Summarize: the Task 1 validation verdict, every commit made (repo + subject), the local validation evidence, and ask whether to (a) push VDP `develop`, (b) fast-forward `main` and push (which triggers CI), (c) push the site, and (d) whether to tag `0.2.0-alpha` now or leave it under `[Unreleased]`.

---

## Self-Review Notes

- **Spec coverage vs the design brief:** §2 (Task 2), §3+grammar+§3.7 (Task 2), §4.2 strip + §4.4 discovery precedence (Task 3 — brief said "§4.3" but in the actual spec the inline body transport is **§4.2**; §4.3 is OData), §6.1 Qute (Task 3), §7 examples (Task 5), §8 step 6 (Task 3), §9 rules + §9.4 amendment (Task 4), §10 (Task 4), §13.2/§13.3 (Task 6), §15.1/15.2 (Task 6), Design Decisions #2/#3 (Task 6), OData non-normative note (Tasks 2/5), extensibility rule (Task 2 + schema in Task 8), version+changelog incl. jq-string callout (Task 7), schema with if/then discrimination + x- enforcement + known-limitation note (Tasks 8/12), corpus incl. every minimum-coverage bullet (Task 9 — identity, `""`, array index, rename, nested output, `$map`+`$to`, nested `$map`, non-array `$map`, `$entries` ±`$to`, document order, `$default` ±, `$count`, `$merge` collision, List, missing pointer, `~0`/`~1`, independent projection, embedded strip, unknown `$` reject, unknown member reject, `x-` accept), quarkus-pha gate (Task 1), writing order honored (validate → spec → schema → corpus → remaining/site).
- **Decisions this plan makes that the brief left open** (surface these in the final report): `$count` on objects = member count (else null); `$merge` skips non-object operands; `$entries` on non-object → null; mapping keys MUST NOT begin with `$` (this is what makes "unknown `$` construct" detectable); MapperRef restricted to the top-level transform value per the grammar; discovery member named `mappers`; a dependency-free reference runner is included so `expected.json` values are executable, not asserted; changelog stays under `[Unreleased]` (tagging is the user's call).
- **Type/name consistency:** `$defs` names in Task 8 = the list in its Interfaces block; corpus contract (Task 9 Interfaces) = what the Task 10 runner reads; section numbers §3.8/§3.8.1–4/§3.9/§3.10/§9.6 used consistently across Tasks 2–12.
