# Design: References Section and RFC 9457 Error Responses

**Date:** 2026-07-29
**Status:** Approved

## Goal

Two additions to the VDP specification (`view-descriptor-protocol.md`, mirrored to the
website's `docs/specification.md`):

1. A consolidated References section listing every RFC the specification relies on, plus
   the non-RFC standards it cites.
2. More specific error-handling guidance: servers SHOULD use Problem Details
   (`application/problem+json`) for error responses on VDP-owned resources.

## Decisions

- **Cite RFC 9457, not RFC 7807.** RFC 7807 was obsoleted by RFC 9457 (July 2023); the
  media type and structure are identical, so the spec cites the current edition.
- **Scope of Problem Details: VDP-owned endpoints, SHOULD-level.** The recommendation
  covers standalone view descriptor resources (Section 5) and discovery documents
  (Section 13.2). Whether the data API itself uses problem details is out of VDP's
  scope. Client-side handling in Sections 9.1–9.4 is unchanged.
- **References live in a new numbered Section 16**, after Section 15 (Conformance) and
  before the unnumbered Design Decisions appendix. Section 11 (Relationship to Existing
  Standards) keeps its conceptual role and gains one Problem Details row.

## Changes

1. **New Section 9.5 (Server Error Responses)** — servers SHOULD return RFC 9457
   problem details for errors on descriptor and discovery resources, with an example
   404 response. A note clarifies that clients apply Sections 9.1–9.3 regardless of the
   error body format.
2. **New Section 16 (References)** — 16.1: table of all RFCs (number, title, use in the
   spec with section pointers); 16.2: table of non-RFC standards already cited (W3C
   SRI, JSON Schema 2020-12, HAL draft, OData 4.0, OpenAPI).
3. **New citations where standards were used but uncited:**
   - RFC 8259 (JSON) at the View Descriptor definition in Section 2.
   - RFC 9111 (HTTP Caching) at "standard HTTP caching headers" in Section 5.2.
4. **Section 11 table** — add a Problem Details (RFC 9457) row.
5. **CHANGELOG** — entries under `[Unreleased]`.
6. **Site mirror** — copy the updated spec and changelog to
   `ViewDescriptorProtocol.github.io/docs/` (specification.md and changelog.md keep
   their trailing abbreviations blocks).

## RFC inventory for Section 16.1

2119, 8174 (BCP 14 keywords); 3986 (URI syntax/resolution); 6454 (same-origin default);
6570 (discovery URI Templates); 6648 (`VDP-Platform` naming); 6838 (media types); 6839
(`+json` suffix); 8259 (JSON, new); 8288 (Web Linking); 8615 (well-known URIs); 9110
(HTTP semantics); 9111 (HTTP caching, new); 9264 (Linkset alignment); 9457 (Problem
Details, new).

Considered and rejected: RFC 4648 (SRI already fixes the digest encoding), RFC 8942
(Client Hints — different mechanism from `VDP-Platform`), RFC 6901 (JSON Pointer — not
used anywhere in the spec).
