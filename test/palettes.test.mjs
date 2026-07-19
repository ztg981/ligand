import assert from "node:assert/strict";
import test from "node:test";
import {
  paletteFor,
  accentFor,
  ambientFor,
  PALETTE_DEFAULTS,
  ACCENT_DEFAULTS,
  LIGHT_PALETTES,
  DARK_PALETTES,
} from "../src/theme/palettes.js";

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

test("accentFor / ambientFor prefer the per-mode value", () => {
  const tweaks = {
    lightAccent: 70,
    darkAccent: 290,
    lightAmbient: 40,
    darkAmbient: 80,
  };
  assert.equal(accentFor("light", tweaks), 70);
  assert.equal(accentFor("dark", tweaks), 290);
  assert.equal(ambientFor("light", tweaks), 40);
  assert.equal(ambientFor("dark", tweaks), 80);
});

test("accentFor / ambientFor fall back to the legacy global value on both modes", () => {
  // A record from before accent/ambient became per-mode carries only the
  // global fields — that single choice must apply to light AND dark.
  const legacy = { accent: 165, ambient: 30 };
  assert.equal(accentFor("light", legacy), 165);
  assert.equal(accentFor("dark", legacy), 165);
  assert.equal(ambientFor("light", legacy), 30);
  assert.equal(ambientFor("dark", legacy), 30);
});

test("accentFor / ambientFor use last-resort defaults for an empty record", () => {
  assert.equal(accentFor("light", {}), ACCENT_DEFAULTS.accent);
  assert.equal(ambientFor("dark", {}), ACCENT_DEFAULTS.ambient);
  // 0 is a valid ambient value and must not be treated as "missing".
  assert.equal(ambientFor("light", { lightAmbient: 0 }), 0);
});

test("palette ids are unique across modes (attribute is unambiguous)", () => {
  const ids = [...LIGHT_PALETTES, ...DARK_PALETTES].map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});
