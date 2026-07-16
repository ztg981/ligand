import { Icon } from "./Icons.jsx";
import { DARK_PALETTES, LIGHT_PALETTES } from "../theme/palettes.js";
import {
  WALLPAPERS,
  wallpaperSelectionForMode,
} from "../lib/wallpaper.js";

export default function AppearanceModePreset({
  mode,
  paletteId,
  onPaletteChange,
  wallpaper,
  customWallpapers = [],
  onWallpaperChange,
  onUploadCustom,
  onRemoveCustom,
}) {
  const isDark = mode === "dark";
  const palettes = isDark ? DARK_PALETTES : LIGHT_PALETTES;
  const selectedWallpaper = wallpaperSelectionForMode(wallpaper, mode);
  const builtIns = WALLPAPERS.filter(
    (item) => item.id === "none" || item.tone === mode
  );

  return (
    <section className={`appearance-preset appearance-preset-${mode}`}>
      <div className="appearance-preset-head">
        <span className="appearance-preset-icon" aria-hidden="true">
          {isDark ? <Icon.Moon /> : <Icon.Sun />}
        </span>
        <span>
          <strong>{isDark ? "Dark" : "Light"} preset</strong>
          <small>{isDark ? "Used whenever the app is dark" : "Used whenever the app is light"}</small>
        </span>
      </div>

      <div className="appearance-preset-label">Look</div>
      <div className="palette-row appearance-palette-row">
        {palettes.map((palette) => (
          <button
            key={palette.id}
            type="button"
            className={"palette-pick" + (paletteId === palette.id ? " active" : "")}
            onClick={() => onPaletteChange?.(palette.id)}
            title={palette.desc}
            aria-pressed={paletteId === palette.id}
          >
            <span className="palette-dot" style={{ background: palette.swatch }} />
            {palette.name}
          </button>
        ))}
      </div>

      <div className="appearance-preset-label">Wallpaper</div>
      <div className="wp-gallery appearance-wallpaper-grid">
        {builtIns.map((item) => (
          <button
            key={item.id}
            type="button"
            className={"wp-tile " + (selectedWallpaper.id === item.id ? "active" : "")}
            style={{
              background:
                item.id === "none"
                  ? isDark
                    ? "#15161a"
                    : "#faf6f0"
                  : item.bg,
            }}
            onClick={() => onWallpaperChange?.({ id: item.id })}
            title={item.name}
            aria-pressed={selectedWallpaper.id === item.id}
          >
            <span className="wp-name">{item.name}</span>
          </button>
        ))}

        {customWallpapers.map((photo, index) => {
          const active =
            selectedWallpaper.id === "custom" &&
            selectedWallpaper.customId === photo.id;
          return (
            <div
              key={photo.id}
              className={"wp-tile wp-custom " + (active ? "active" : "")}
              style={{
                backgroundImage: `url(${photo.url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              onClick={() =>
                onWallpaperChange?.({ id: "custom", customId: photo.id })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onWallpaperChange?.({ id: "custom", customId: photo.id });
                }
              }}
            >
              <span className="wp-name">Photo {index + 1}</span>
              <button
                type="button"
                className="wp-remove"
                title="Remove this photo"
                aria-label="Remove this photo"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveCustom?.(photo.id);
                }}
              >
                <Icon.Close />
              </button>
            </div>
          );
        })}

        {customWallpapers.length < 5 && (
          <label className="wp-tile wp-add" title={`Upload a ${mode} wallpaper`}>
            <Icon.Plus />
            <span className="wp-name">Upload</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                onUploadCustom?.(event.target.files?.[0], mode);
                event.target.value = "";
              }}
            />
          </label>
        )}
      </div>
    </section>
  );
}
