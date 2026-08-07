import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("song chip CSS enforces responsive flex truncation and no hardcoded max-width", () => {
  const cssPath = path.join(__dirname, "../src/index.css");
  const css = fs.readFileSync(cssPath, "utf8");

  // .song-chip must have max-width: 100% and min-width: 0 rather than max-width: 260px
  const chipRuleMatch = css.match(/\.song-chip\s*\{([^}]+)\}/);
  assert.ok(chipRuleMatch, "defines .song-chip class");
  const chipRuleBody = chipRuleMatch[1];
  assert.ok(!chipRuleBody.includes("260px"), ".song-chip does not hardcode 260px width");
  assert.ok(chipRuleBody.includes("max-width: 100%"), ".song-chip allows max-width: 100%");
  assert.ok(chipRuleBody.includes("min-width: 0"), ".song-chip has min-width: 0 for flex truncation");

  // .song-chip-text must truncate cleanly with ellipsis
  assert.ok(css.includes(".song-chip-text"), "defines .song-chip-text wrapper");
  assert.ok(css.includes("text-overflow: ellipsis"), "uses text-overflow: ellipsis");
  assert.ok(css.includes("white-space: nowrap"), "prevents awkward wrapping inside chip");
});

test("compact song disclosure container uses reduced border radius", () => {
  const cssPath = path.join(__dirname, "../src/index.css");
  const css = fs.readFileSync(cssPath, "utf8");

  // .song-title-disclosure.compact must not use 999px pill border-radius
  const compactMatch = css.match(/\.song-title-disclosure\.compact\s*\{([^}]+)\}/);
  assert.ok(compactMatch, "finds .song-title-disclosure.compact rule");
  const ruleBody = compactMatch[1];
  assert.ok(!ruleBody.includes("999px"), "does not use excessive 999px border-radius when expanded");
  assert.ok(ruleBody.includes("var(--r-md)"), "uses var(--r-md) for clean rectangular space");
});

test("Journal component includes structured song title and chip wrappers", () => {
  const journalPath = path.join(__dirname, "../src/tabs/Journal.jsx");
  const journalSrc = fs.readFileSync(journalPath, "utf8");

  assert.ok(journalSrc.includes("song-chip-text"), "Journal.jsx includes song-chip-text container");
  assert.ok(journalSrc.includes("song-chip-title"), "Journal.jsx includes song-chip-title");
  assert.ok(journalSrc.includes("song-chip-artist"), "Journal.jsx includes song-chip-artist");
  assert.ok(journalSrc.includes("song-title-text"), "Journal.jsx includes song-title-text container");
});
