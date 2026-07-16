import assert from "node:assert/strict";
import test from "node:test";
import {
  wallpaperSelectionForMode,
  wallpaperSettingsForMode,
  withoutCustomWallpaper,
} from "../src/lib/wallpaper.js";

test("legacy wallpapers migrate to the matching light or dark preset", () => {
  assert.deepEqual(wallpaperSelectionForMode({ id: "sage" }, "light"), {
    id: "sage",
    customId: null,
  });
  assert.deepEqual(wallpaperSelectionForMode({ id: "sage" }, "dark"), {
    id: "none",
    customId: null,
  });
  assert.deepEqual(wallpaperSelectionForMode({ id: "navy" }, "dark"), {
    id: "navy",
    customId: null,
  });
});

test("light and dark wallpaper presets remain independent", () => {
  const withLight = wallpaperSettingsForMode(
    { id: "navy", sound: "rain" },
    "light",
    { id: "rose" }
  );
  assert.equal(withLight.lightId, "rose");
  assert.equal(withLight.darkId, "navy");
  assert.equal(withLight.sound, "rain");

  const withDark = wallpaperSettingsForMode(withLight, "dark", {
    id: "custom",
    customId: "photo-1",
  });
  assert.equal(withDark.lightId, "rose");
  assert.equal(withDark.darkId, "custom");
  assert.equal(withDark.darkCustomId, "photo-1");
  assert.equal(withDark.id, "none");
});

test("removing a custom photo clears only presets that use it", () => {
  const settings = {
    lightId: "custom",
    lightCustomId: "photo-1",
    darkId: "custom",
    darkCustomId: "photo-2",
  };
  const next = withoutCustomWallpaper(settings, "photo-1");
  assert.equal(next.lightId, "none");
  assert.equal(next.lightCustomId, null);
  assert.equal(next.darkId, "custom");
  assert.equal(next.darkCustomId, "photo-2");
});
