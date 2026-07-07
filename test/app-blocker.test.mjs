import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { buildBlockText, normalizeDomain } = require("../electron/appBlocker.js");

test("focus blocker normalizes pasted URLs to safe hostnames", () => {
  assert.equal(normalizeDomain("https://www.youtube.com/watch?v=1"), "youtube.com");
  assert.equal(normalizeDomain(" Reddit.com/r/test "), "reddit.com");
});

test("focus blocker rejects malformed hosts", () => {
  assert.equal(normalizeDomain("example.com# 127.0.0.1 bank.com"), "example.com");
  assert.equal(normalizeDomain("bad host.example"), "");
  assert.equal(normalizeDomain("localhost"), "");
  assert.equal(normalizeDomain("-bad.example"), "");
  assert.equal(normalizeDomain("bad_.example"), "");
});

test("focus blocker output only contains normalized domains", () => {
  const text = buildBlockText(["https://www.youtube.com/watch?v=1", "bad host.example"]);
  assert.ok(text.includes("127.0.0.1 youtube.com"));
  assert.ok(text.includes("127.0.0.1 www.youtube.com"));
  assert.ok(!text.includes("bad host"));
});
