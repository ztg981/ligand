import assert from "node:assert/strict";
import test from "node:test";
import { paletteFor, PALETTE_DEFAULTS, LIGHT_PALETTES, DARK_PALETTES } from "../src/theme/palettes.js";

test("paletteFor picks the chosen palette for the active mode", () => {
  const tweaks = { lightPalette: "meadow", darkPalette: "navy" };
  assert.equal(paletteFor("light", tweaks), "meadow");
  assert.equal(paletteFor("dark", tweaks), "navy");
});

test("paletteFor falls back to defaults for missing or cross-mode ids", () => {
  assert.equal(paletteFor("light", {}), PALETTE_DEFAULTS.lightPalette);
  assert.equal(paletteFor("dark", {}), PALETTE_DEFAULTS.darkPalette);
  // A dark palette id stored in the light slot must not leak through.
  assert.equal(paletteFor("light", { lightPalette: "navy" }), "paper");
  assert.equal(paletteFor("dark", { darkPalette: "meadow" }), "midnight");
});

test("palette ids are unique across modes (attribute is unambiguous)", () => {
  const ids = [...LIGHT_PALETTES, ...DARK_PALETTES].map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});
