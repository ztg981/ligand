import { useState } from "react";
import { Segmented, Slider, Switch } from "../components/Controls.jsx";
import { Icon } from "../components/Icons.jsx";
import { ACCENTS, TWEAK_DEFAULTS } from "../theme/useTweaks.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { POMO_DEFAULTS } from "../hooks/usePomodoro.js";
import { WALLPAPERS, SOUNDS } from "../lib/wallpaper.js";
import ConfirmButton from "../components/ConfirmButton.jsx";
import { BG_TRACKS } from "../lib/bgMusicPlayer.js";

/* Built-in one-click appearance presets */
const BUILT_IN_PRESETS = [
  {
    id: "calm",
    name: "Calm",
    desc: "Light · low glow · sage",
    tweaks: { theme: "light", accent: 165, ambient: 25, radius: 16, density: "comfy" },
  },
  {
    id: "focus",
    name: "Focus",
    desc: "Dark · minimal glow · blue",
    tweaks: { theme: "dark", accent: 245, ambient: 15, radius: 8, density: "compact" },
  },
  {
    id: "cozy",
    name: "Cozy",
    desc: "Light · warm glow · amber",
    tweaks: { theme: "light", accent: 70, ambient: 65, radius: 18, density: "comfy" },
  },
];

/* Settings — the full preferences screen.
   Mirrors the floating Tweaks (appearance), plus Pomodoro timings,
   notifications, wallpaper/sound, the assistant, habits, and data.
   Placeholder systems (notifications, wallpaper, sound) save the choice
   and are clearly marked "coming soon" so nothing feels broken. */

function Section({ icon, title, sub, children }) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          {icon} {title}
        </div>
      </div>
      {sub && (
        <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 6px", lineHeight: 1.45 }}>
          {sub}
        </p>
      )}
      {children}
    </div>
  );
}

function Row({ name, hint, children }) {
  return (
    <div className="setting-row">
      <div>
        <div className="name">{name}</div>
        {hint && <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

const SoonTag = () => (
  <span className="chip" style={{ fontSize: 10 }}>
    Coming soon
  </span>
);

export default function Settings({
  tweaks,
  setTweak,
  settings,
  setSection,
  resetSettings,
  resetData,
  archivedGoals = [],
  restoreGoal,
  removeGoal,
  confirmBeforeDelete = true,
  requestNotifyPermission,
  notifyPermission = "default",
  customWallpapers = [],
  setCustomWallpapers,
  hasRecoveryGoal = false,
}) {
  // Pomodoro timings live in their own key (shared with the timer engine).
  const [pomoStored, setPomo] = useLocalStorage("ligand.pomodoro", POMO_DEFAULTS);
  const pomo = { ...POMO_DEFAULTS, ...pomoStored };
  const patchPomo = (patch) => setPomo((p) => ({ ...p, ...patch }));

  // User presets — stored separately so they survive a Settings reset.
  const [userPresets, setUserPresets] = useLocalStorage("ligand.userPresets", []);
  const [savingPresetName, setSavingPresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);

  const saveUserPreset = () => {
    const name = savingPresetName.trim();
    if (!name) return;
    const preset = { id: `user-${Date.now()}`, name, tweaks: { ...tweaks } };
    setUserPresets((prev) => [...prev, preset]);
    setSavingPresetName("");
    setShowSavePreset(false);
  };
  const deleteUserPreset = (id) =>
    setUserPresets((prev) => prev.filter((p) => p.id !== id));

  // --- Custom wallpaper gallery -------------------------------------------
  // Up to 5 photos; capped at ~4 MB combined because this data syncs to the
  // cloud. Each photo also gets the existing ~1.5 MB per-image soft warning.
  const MAX_CUSTOM_WALLPAPERS = 5;
  const TOTAL_WALLPAPER_CAP = 4 * 1024 * 1024;
  const byteSize = (str) => {
    try {
      return new Blob([str]).size;
    } catch {
      return (str || "").length;
    }
  };
  const wallpaperTotalBytes = customWallpapers.reduce(
    (sum, w) => sum + byteSize(w.url),
    0
  );

  const addCustomWallpaper = (file) => {
    if (!file) return;
    if (customWallpapers.length >= MAX_CUSTOM_WALLPAPERS) {
      alert(
        `You can keep up to ${MAX_CUSTOM_WALLPAPERS} custom wallpapers. ` +
          "Remove one to add another."
      );
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      // Soft warning (kept from before) — large files may not sync reliably.
      alert(
        `That image is ${(file.size / (1024 * 1024)).toFixed(1)} MB. ` +
          "For best results use an image under 1.5 MB — large files may not " +
          "sync reliably. Try resizing or compressing it first."
      );
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target.result;
      // Hard cap on combined storage, since wallpapers sync to the database.
      if (wallpaperTotalBytes + byteSize(url) > TOTAL_WALLPAPER_CAP) {
        alert(
          "Adding this image would put your custom wallpapers over ~4 MB " +
            `combined (currently ${(wallpaperTotalBytes / (1024 * 1024)).toFixed(1)} MB). ` +
            "Since wallpapers sync to your account, remove one first or use a " +
            "smaller image."
        );
        return;
      }
      const id =
        "cw-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      setCustomWallpapers?.((prev) => [...(prev || []), { id, url }]);
      setSection("wallpaper", { id: "custom", customId: id });
    };
    reader.readAsDataURL(file);
  };

  const removeCustomWallpaper = (id) => {
    setCustomWallpapers?.((prev) => (prev || []).filter((w) => w.id !== id));
    if (wallpaper.id === "custom" && wallpaper.customId === id) {
      setSection("wallpaper", { id: "none" });
    }
  };

  const { notifications, habits, assistant, wallpaper, behavior, profile, uiSounds = {}, bgMusic = {}, ai = {} } = settings;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Preferences</div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            Make Ligand yours. Everything is saved on this device.
          </p>
        </div>
      </div>

      <div className="settings-grid">
        {/* Profile */}
        <Section icon={<Icon.Heart />} title="Profile">
          <Row name="Your name" hint="Used in your dashboard greeting">
            <input
              className="input"
              value={profile.name}
              onChange={(e) => setSection("profile", { name: e.target.value })}
              placeholder="Your name"
              style={{ maxWidth: 150 }}
            />
          </Row>
        </Section>

        {/* Appearance (mirrors Tweaks) */}
        <Section icon={<Icon.Wand />} title="Appearance">
          <Row name="Theme">
            <Segmented
              value={tweaks.theme}
              onChange={(v) => setTweak({ theme: v })}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "auto", label: "Auto" },
              ]}
            />
          </Row>
          <Row name="Accent">
            <div className="row" style={{ gap: 4 }}>
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  className={"swatch-pick " + (tweaks.accent === a.id ? "active" : "")}
                  style={{ background: a.color, width: 20, height: 20 }}
                  onClick={() => setTweak({ accent: a.id })}
                  title={`Hue ${a.id}`}
                />
              ))}
            </div>
          </Row>
          <Row name="Ambient glow" hint={`${tweaks.ambient}%`}>
            <div style={{ width: 140 }}>
              <Slider value={tweaks.ambient} min={0} max={100} step={5}
                onChange={(v) => setTweak({ ambient: v })} format={(v) => v + "%"} />
            </div>
          </Row>
          <Row name="Corner radius" hint={`${tweaks.radius}px`}>
            <div style={{ width: 140 }}>
              <Slider value={tweaks.radius} min={4} max={20} step={2}
                onChange={(v) => setTweak({ radius: v })} format={(v) => v + "px"} />
            </div>
          </Row>
          <Row name="Density">
            <Segmented
              value={tweaks.density}
              onChange={(v) => setTweak({ density: v })}
              options={[
                { value: "compact", label: "Compact" },
                { value: "comfy", label: "Comfy" },
              ]}
            />
          </Row>
          <Row name="Reduce motion" hint="Calmer — minimizes animation">
            <Switch
              checked={behavior.reduceMotion}
              onChange={(v) => setSection("behavior", { reduceMotion: v })}
            />
          </Row>

          {/* ── Presets ──────────────────────────────────────── */}
          <div style={{ marginTop: 10 }}>
            <div className="name" style={{ marginBottom: 8 }}>
              Presets
              <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6 }}>
                One click to apply a curated look
              </span>
            </div>
            <div className="preset-row">
              {BUILT_IN_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className="preset-tile"
                  onClick={() => setTweak(p.tweaks)}
                  title={p.desc}
                >
                  <span className="preset-swatch" style={{
                    background: p.id === "focus"
                      ? "linear-gradient(135deg,#1b1d2a,#3a3d52)"
                      : p.id === "calm"
                        ? "linear-gradient(135deg,#e8f5ec,#c5e4cd)"
                        : "linear-gradient(135deg,#fff3e0,#ffe0a3)",
                  }} />
                  <span className="preset-name">{p.name}</span>
                  <span className="preset-desc">{p.desc}</span>
                </button>
              ))}
              {userPresets.map((p) => (
                <div key={p.id} className="preset-tile preset-user">
                  <button
                    style={{ flex: 1, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
                    onClick={() => setTweak(p.tweaks)}
                  >
                    <span className="preset-swatch" style={{ background: "var(--panel-2)" }} />
                    <span className="preset-name">{p.name}</span>
                    <span className="preset-desc">Your preset</span>
                  </button>
                  <button
                    className="btn ghost sm"
                    style={{ position: "absolute", top: 4, right: 4, padding: "2px 4px", minWidth: 0 }}
                    onClick={() => deleteUserPreset(p.id)}
                    title="Delete preset"
                  >×</button>
                </div>
              ))}
            </div>

            {/* Save current as preset */}
            {showSavePreset ? (
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                <input
                  className="input"
                  placeholder="Preset name…"
                  value={savingPresetName}
                  onChange={(e) => setSavingPresetName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveUserPreset(); if (e.key === "Escape") setShowSavePreset(false); }}
                  autoFocus
                  style={{ flex: 1, maxWidth: 180 }}
                />
                <button className="btn sm" onClick={saveUserPreset} disabled={!savingPresetName.trim()}>
                  Save
                </button>
                <button className="btn ghost sm" onClick={() => setShowSavePreset(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn ghost sm"
                style={{ marginTop: 8 }}
                onClick={() => setShowSavePreset(true)}
              >
                + Save current as preset
              </button>
            )}

            {/* Reset tweaks to defaults */}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <button
                className="btn ghost sm"
                onClick={() => {
                  if (window.confirm("Reset appearance to defaults?")) {
                    setTweak(TWEAK_DEFAULTS);
                  }
                }}
              >
                <Icon.Reset width={13} height={13} /> Reset to defaults
              </button>
            </div>
          </div>
        </Section>

        {/* Focus timer */}
        <Section icon={<Icon.Timer />} title="Focus timer">
          <Row name="Focus length" hint={`${pomo.work} min`}>
            <div style={{ width: 140 }}>
              <Slider value={pomo.work} min={5} max={60} step={5}
                onChange={(v) => patchPomo({ work: v })} format={(v) => v + "m"} />
            </div>
          </Row>
          <Row name="Short break" hint={`${pomo.shortBreak} min`}>
            <div style={{ width: 140 }}>
              <Slider value={pomo.shortBreak} min={1} max={20} step={1}
                onChange={(v) => patchPomo({ shortBreak: v })} format={(v) => v + "m"} />
            </div>
          </Row>
          <Row name="Long break" hint={`${pomo.longBreak} min`}>
            <div style={{ width: 140 }}>
              <Slider value={pomo.longBreak} min={5} max={45} step={5}
                onChange={(v) => patchPomo({ longBreak: v })} format={(v) => v + "m"} />
            </div>
          </Row>
          <Row name="Long break every" hint={`${pomo.longEvery} focus blocks`}>
            <div style={{ width: 140 }}>
              <Slider value={pomo.longEvery} min={2} max={8} step={1}
                onChange={(v) => patchPomo({ longEvery: v })} format={(v) => "×" + v} />
            </div>
          </Row>
        </Section>

        {/* Notifications */}
        <Section
          icon={<Icon.Bell />}
          title="Notifications"
          sub="Gentle nudges for focus blocks, overdue goals, urgent tasks, open habits, and daily check-ins. They also collect in the bell up top."
        >
          <Row
            name="Enable notifications"
            hint={
              notifyPermission === "denied"
                ? "Your browser is blocking notifications — enable them in site settings"
                : notifyPermission === "unsupported"
                ? "This browser doesn't support system notifications"
                : "System (browser) notifications + the in-app bell"
            }
          >
            <Switch
              checked={notifications.enabled}
              onChange={(v) => {
                setSection("notifications", { enabled: v });
                // Ask the browser the first time the user turns this on. If
                // they've already answered, this is a silent no-op.
                if (v) requestNotifyPermission?.();
              }}
            />
          </Row>
          <Row name="Pomodoro chime" hint="Soft sound when a focus block or break ends">
            <Switch
              checked={notifications.pomodoroChime}
              onChange={(v) => setSection("notifications", { pomodoroChime: v })}
            />
          </Row>
          <Row name="UI sounds" hint="Subtle click/ding when toggling switches, moving sliders, completing tasks">
            <Switch
              checked={uiSounds.enabled ?? true}
              onChange={(v) => setSection("uiSounds", { enabled: v })}
            />
          </Row>
          <Row
            name="Daily reminder"
            hint="Nudges you when you open the app after the set time — not a background alarm"
          >
            <Switch
              checked={notifications.dailyReminder}
              onChange={(v) => setSection("notifications", { dailyReminder: v })}
            />
          </Row>
          {notifications.dailyReminder && (
            <Row name="Reminder time">
              <input
                type="time"
                className="input"
                value={notifications.reminderTime}
                onChange={(e) => setSection("notifications", { reminderTime: e.target.value })}
                style={{ maxWidth: 120 }}
              />
            </Row>
          )}
        </Section>

        {/* Background music */}
        <Section icon={<Icon.Wand />} title="Background music"
          sub="Gentle ambient loops that play across the whole app — separate from Pomodoro scene sounds."
        >
          <Row name="Background music" hint="Plays softly while you work; no autoplay until you switch it on">
            <Switch
              checked={bgMusic.enabled ?? false}
              onChange={(v) => setSection("bgMusic", { enabled: v })}
            />
          </Row>
          <Row name="Track">
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {BG_TRACKS.map((t) => (
                <button
                  key={t.id}
                  className={"btn sm" + ((bgMusic.track ?? "rain") === t.id ? " primary" : " ghost")}
                  onClick={() => setSection("bgMusic", { track: t.id })}
                  style={{ minWidth: 68 }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Row>
          <Row name="Volume" hint={bgMusic.enabled ? undefined : "Enable music to adjust volume"}>
            <div className="ctrl" style={{
              minWidth: 160,
              opacity: (bgMusic.enabled ?? false) ? 1 : 0.45,
              pointerEvents: (bgMusic.enabled ?? false) ? "auto" : "none",
            }}>
              <Slider
                value={bgMusic.volume ?? 30}
                min={0}
                max={100}
                step={5}
                onChange={(v) => setSection("bgMusic", { volume: v })}
                format={(v) => v + "%"}
              />
            </div>
          </Row>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            Tracks: Rain, Stream, and Waves — all CC0 ambient loops. Music plays across all tabs and pauses only when you turn it off.
          </p>
        </Section>

        {/* Wallpaper &amp; sound */}
        <Section
          icon={<Icon.Sun />}
          title="Wallpaper & sound"
          sub="Set the backdrop behind everything. Each wallpaper brings its own light or dark mood so text stays easy to read."
        >
          <div style={{ marginBottom: 6 }}>
            <div className="name" style={{ marginBottom: 6 }}>Wallpaper</div>
            <div className="wp-gallery">
              {/* Built-in gradients */}
              {WALLPAPERS.map((w) => (
                <button
                  key={w.id}
                  className={"wp-tile " + (wallpaper.id === w.id ? "active" : "")}
                  style={{ background: w.bg }}
                  onClick={() => setSection("wallpaper", { id: w.id })}
                  title={w.name}
                >
                  <span className="wp-name">{w.name}</span>
                </button>
              ))}

              {/* Custom photos */}
              {customWallpapers.map((cw, i) => {
                const active =
                  wallpaper.id === "custom" && wallpaper.customId === cw.id;
                return (
                  <div
                    key={cw.id}
                    className={"wp-tile wp-custom " + (active ? "active" : "")}
                    style={{
                      backgroundImage: `url(${cw.url})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                    role="button"
                    tabIndex={0}
                    title="Custom photo"
                    onClick={() => setSection("wallpaper", { id: "custom", customId: cw.id })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSection("wallpaper", { id: "custom", customId: cw.id });
                      }
                    }}
                  >
                    <span className="wp-name">Photo {i + 1}</span>
                    <button
                      className="wp-remove"
                      title="Remove this wallpaper"
                      aria-label="Remove this wallpaper"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCustomWallpaper(cw.id);
                      }}
                    >
                      <Icon.Close />
                    </button>
                  </div>
                );
              })}

              {/* Upload tile (hidden once the gallery is full) */}
              {customWallpapers.length < MAX_CUSTOM_WALLPAPERS && (
                <label className="wp-tile wp-add" title="Upload a photo">
                  <Icon.Plus />
                  <span className="wp-name">Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      addCustomWallpaper(e.target.files?.[0]);
                      e.target.value = ""; // allow re-picking the same file
                    }}
                  />
                </label>
              )}
            </div>
            <p className="set-note">
              Up to {MAX_CUSTOM_WALLPAPERS} custom photos, ~4 MB combined (they
              sync to your account). Each looks best under 1.5 MB.
            </p>
          </div>
          <Row name="Ambient sound" hint="Override the scene's default sound during Pomodoro focus">
            <select
              className="input"
              value={wallpaper.sound ?? "none"}
              onChange={(e) => setSection("wallpaper", { sound: e.target.value })}
              style={{ maxWidth: 160 }}
            >
              {SOUNDS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Row>
        </Section>

        {/* Assistant */}
        <Section
          icon={<Icon.Spark />}
          title="Assistant"
          sub="Gentle, on-device encouragement. No account, no external AI service."
        >
          <Row name="Encouraging messages" hint="Warm lines on your dashboard">
            <Switch
              checked={assistant.encouragement}
              onChange={(v) => setSection("assistant", { encouragement: v })}
            />
          </Row>
          <Row name="Tone">
            <Segmented
              value={assistant.tone}
              onChange={(v) => setSection("assistant", { tone: v })}
              options={[
                { value: "warm", label: "Warm" },
                { value: "plain", label: "Plain" },
                { value: "cheerful", label: "Cheerful" },
              ]}
            />
          </Row>
        </Section>

        {/* AI & Privacy */}
        <Section icon={<Icon.Cloud />} title="AI & Privacy">
          <p style={{ fontSize: 11.5, color: "var(--ink-4)", margin: "0 0 12px", lineHeight: 1.5 }}>
            When AI features are on, summarized data is sent to Google's Gemini
            API to generate insights. Google does not use this data to train
            their models (paid API tier). Your data is never sold.
          </p>
          <Row name="AI goal insights" hint="Goal summary and 'At a glance' suggestions">
            <Switch
              checked={ai.aiGoalInsights !== false}
              onChange={(v) => setSection("ai", { aiGoalInsights: v })}
            />
          </Row>
          <Row name="AI weekly review" hint="The 'Your week' card on Home">
            <Switch
              checked={ai.aiWeeklyReview !== false}
              onChange={(v) => setSection("ai", { aiWeeklyReview: v })}
            />
          </Row>
          <Row
            name="Include journal text in AI context"
            hint="Your journal text stays on your device when this is off — AI only sees aggregate stats (tasks done, check-in counts, streaks)."
          >
            <Switch
              checked={ai.includeJournalText === true}
              onChange={(v) => setSection("ai", { includeJournalText: v })}
            />
          </Row>
          {hasRecoveryGoal && (
            <Row
              name="AI recovery insights"
              hint="Recovery data is kept private by default — nothing from a recovery tracker is sent to AI unless this is on."
            >
              <Switch
                checked={ai.aiRecoveryInsights === true}
                onChange={(v) => setSection("ai", { aiRecoveryInsights: v })}
              />
            </Row>
          )}
        </Section>

        {/* Habits */}
        <Section icon={<Icon.Check />} title="Habits">
          <Row name="Show streaks" hint="Streaks always pause, never shatter">
            <Switch
              checked={habits.showStreaks}
              onChange={(v) => setSection("habits", { showStreaks: v })}
            />
          </Row>
          <Row name="Week starts on">
            <Segmented
              value={habits.weekStartsMonday ? "mon" : "sun"}
              onChange={(v) => setSection("habits", { weekStartsMonday: v === "mon" })}
              options={[
                { value: "sun", label: "Sun" },
                { value: "mon", label: "Mon" },
              ]}
            />
          </Row>
        </Section>

        {/* Archived goals (recycle bin) */}
        <Section
          icon={<Icon.Trash />}
          title="Archived goals"
          sub="Goals you've removed wait here. Restore them anytime, or delete one for good — that part can't be undone."
        >
          {archivedGoals.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--ink-4)", margin: 0 }}>
              Nothing archived. Removed goals will land here as a safety net.
            </p>
          ) : (
            <div>
              {archivedGoals.map((g) => (
                <div key={g.id} className="archive-row">
                  <span className="row" style={{ gap: 8, alignItems: "center", minWidth: 0 }}>
                    <span
                      className="swatch"
                      style={{ background: g.color, boxShadow: "none", flex: "none" }}
                    />
                    <span style={{ fontSize: 13, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.name}
                    </span>
                  </span>
                  <span className="row" style={{ gap: 6, flex: "none" }}>
                    <button
                      className="btn ghost sm"
                      onClick={() => restoreGoal(g.id)}
                      title="Restore goal"
                    >
                      <Icon.Reset width={13} height={13} /> Restore
                    </button>
                    <ConfirmButton
                      className="btn ghost sm"
                      title="Delete permanently"
                      confirmLabel="Delete?"
                      onConfirm={() => removeGoal(g.id)}
                      requireConfirmation={confirmBeforeDelete}
                      style={{ color: "oklch(0.55 0.16 20)" }}
                      icon={<Icon.Trash width={13} height={13} />}
                    />
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Data & behavior */}
        <Section icon={<Icon.Gear />} title="Data & behavior">
          <Row name="Confirm before deleting" hint="Ask before removing tasks or entries">
            <Switch
              checked={behavior.confirmBeforeDelete}
              onChange={(v) => setSection("behavior", { confirmBeforeDelete: v })}
            />
          </Row>
          <Row name="Export data" hint="Download all your goals, tasks and journal as JSON">
            <button
              className="btn ghost sm"
              onClick={() => {
                const keys = ["ligand.data", "ligand.settings", "ligand.tweaks", "ligand.pomodoro", "ligand.userPresets"];
                const dump = {};
                keys.forEach((k) => {
                  const v = localStorage.getItem(k);
                  if (v) dump[k] = JSON.parse(v);
                });
                const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `ligand-backup-${new Date().toISOString().slice(0, 10)}.json`;
                a.click(); URL.revokeObjectURL(url);
              }}
            >
              ↓ Export
            </button>
          </Row>
          <Row name="Import data" hint="Restore a previously exported JSON backup">
            <label className="btn ghost sm" style={{ cursor: "pointer" }}>
              ↑ Import
              <input
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    try {
                      const data = JSON.parse(ev.target.result);
                      if (!window.confirm("Import will overwrite your current data. Continue?")) return;
                      Object.entries(data).forEach(([k, v]) =>
                        localStorage.setItem(k, JSON.stringify(v))
                      );
                      window.location.reload();
                    } catch {
                      alert("Couldn't read the backup file — is it a valid Ligand JSON export?");
                    }
                  };
                  reader.readAsText(file);
                  e.target.value = ""; // allow re-picking same file
                }}
              />
            </label>
          </Row>
          <Row name="Reset preferences" hint="Theme, notifications, etc. — keeps your data">
            <button
              className="btn ghost sm"
              onClick={() => {
                if (window.confirm("Reset all preferences to their defaults? Your goals, tasks and journal stay untouched.")) {
                  resetSettings();
                }
              }}
            >
              <Icon.Reset width={13} height={13} /> Reset
            </button>
          </Row>
          <Row name="Erase all data" hint="Goals, tasks, habits and journal — can't be undone">
            <button
              className="btn ghost sm"
              style={{ color: "oklch(0.55 0.16 20)" }}
              onClick={() => {
                if (window.confirm("Erase ALL of your goals, tasks, habits and journal entries? This can't be undone.")) {
                  resetData();
                }
              }}
            >
              <Icon.Trash width={13} height={13} /> Erase
            </button>
          </Row>
          <p className="set-note">
            Ligand keeps everything in your browser's local storage on this
            device. Clearing your browser data will also clear Ligand.
          </p>
        </Section>
      </div>
    </>
  );
}
