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
