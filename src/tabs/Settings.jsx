import { useEffect, useState } from "react";
import { Segmented, Slider, Switch } from "../components/Controls.jsx";
import { Icon } from "../components/Icons.jsx";
import { ACCENTS, TWEAK_DEFAULTS, WORDMARK_FONTS } from "../theme/useTweaks.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { POMO_DEFAULTS } from "../hooks/usePomodoro.js";
import { SOUNDS } from "../lib/wallpaper.js";
import ConfirmButton from "../components/ConfirmButton.jsx";
import BlockerPanel from "../components/BlockerPanel.jsx";
import AlarmsPanel from "../components/AlarmsPanel.jsx";
import AppearanceModePreset from "../components/AppearanceModePreset.jsx";
import { BG_TRACKS } from "../lib/bgMusicPlayer.js";
import { applyBackupData, downloadBackup, readBackupFile } from "../lib/backup.js";
import ChatGPTAccessPanel from "../components/ChatGPTAccessPanel.jsx";
import pkg from "../../package.json";

/* Settings - the full preferences screen.
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

function Row({ name, hint, children, className = "" }) {
  return (
    <div className={["setting-row", className].filter(Boolean).join(" ")}>
      <div>
        <div className="name">{name}</div>
        {hint && <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export default function Settings({
  tweaks,
  setTweak,
  settings,
  setSection,
  resetSettings,
  resetData,
  goals = [],
  archivedGoals = [],
  restoreGoal,
  removeGoal,
  confirmBeforeDelete = true,
  requestNotifyPermission,
  notifyPermission = "default",
  customWallpapers = [],
  onWallpaperChange,
  onUploadCustomWallpaper,
  onRemoveCustomWallpaper,
  onResetWallpaperPresets,
  hasRecoveryGoal = false,
  isGuest = false,
  alarms = [],
  addAlarm,
  updateAlarm,
  removeAlarm,
  onTestAlarm,
}) {
  // Pomodoro timings live in their own key (shared with the timer engine).
  const [pomoStored, setPomo] = useLocalStorage("ligand.pomodoro", POMO_DEFAULTS);
  const pomo = { ...POMO_DEFAULTS, ...pomoStored };
  const patchPomo = (patch) => setPomo((p) => ({ ...p, ...patch }));

  // "My looks" - user-saved appearance snapshots. Same storage key the old
  // save-your-theme flow used, so looks saved before the light/dark preset
  // rework come right back. A snapshot is the whole tweaks record; applying
  // one routes through setTweak, which normalizes any legacy fields.
  const [userPresets, setUserPresets] = useLocalStorage("ligand.userPresets", []);
  const [savingLook, setSavingLook] = useState(false);
  const [lookName, setLookName] = useState("");
  const saveLook = () => {
    const name = lookName.trim();
    if (!name) return;
    // Snapshot the LIVE colors for the chip's mini preview, so the swatch
    // shows exactly what the look looked like when it was saved.
    let swatch = null;
    try {
      const cs = getComputedStyle(document.documentElement);
      swatch = [
        cs.getPropertyValue("--bg").trim(),
        cs.getPropertyValue("--panel").trim(),
        cs.getPropertyValue("--accent").trim(),
        cs.getPropertyValue("--ink").trim(),
      ];
    } catch {
      swatch = null;
    }
    setUserPresets((prev) => [
      ...prev.filter((p) => p.name !== name),
      { id: `user-${Date.now()}`, name, tweaks: { ...tweaks }, swatch },
    ]);
    setLookName("");
    setSavingLook(false);
  };
  const applyLook = (p) => setTweak({ ...p.tweaks });
  const deleteLook = (id) => setUserPresets((prev) => prev.filter((p) => p.id !== id));

  const { notifications, habits, assistant, wallpaper, behavior, profile, uiSounds = {}, bgMusic = {}, ai = {}, desktop = {}, sleep = {} } = settings;
  const aiLocked = isGuest;
  const aiLockedHint = "Sign in to use AI features.";

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

        <ChatGPTAccessPanel goals={goals} />

        {/* Appearance (mirrors Tweaks) */}
        <Section icon={<Icon.Wand />} title="Appearance">
          <Row name="Theme" hint="Auto follows your system light/dark setting">
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
          <div className="appearance-preset-grid">
            <AppearanceModePreset
              mode="light"
              paletteId={tweaks.lightPalette}
              onPaletteChange={(lightPalette) => setTweak({ lightPalette })}
              wallpaper={wallpaper}
              customWallpapers={customWallpapers}
              onWallpaperChange={(selection) =>
                onWallpaperChange?.("light", selection)
              }
              onUploadCustom={onUploadCustomWallpaper}
              onRemoveCustom={onRemoveCustomWallpaper}
            />
            <AppearanceModePreset
              mode="dark"
              paletteId={tweaks.darkPalette}
              onPaletteChange={(darkPalette) => setTweak({ darkPalette })}
              wallpaper={wallpaper}
              customWallpapers={customWallpapers}
              onWallpaperChange={(selection) =>
                onWallpaperChange?.("dark", selection)
              }
              onUploadCustom={onUploadCustomWallpaper}
              onRemoveCustom={onRemoveCustomWallpaper}
            />
          </div>

          {/* My looks - save the current combination (palettes, accent,
             radius, density, all of it) under a name and switch back any
             time. Restores the save-your-theme flow the preset rework lost. */}
          <div className="mylooks">
            <div className="mylooks-head">
              <span className="mylooks-title">My looks</span>
              {!savingLook && (
                <button className="btn ghost sm" onClick={() => setSavingLook(true)}>
                  <Icon.Star width={13} height={13} /> Save this look
                </button>
              )}
            </div>
            {savingLook && (
              <div className="mylooks-save">
                <input
                  className="input"
                  autoFocus
                  placeholder="Name it (e.g. Night glass)"
                  value={lookName}
                  maxLength={30}
                  onChange={(e) => setLookName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveLook();
                    if (e.key === "Escape") setSavingLook(false);
                  }}
                />
                <button className="btn ghost sm" onClick={() => setSavingLook(false)}>
                  Cancel
                </button>
                <button
                  className="btn primary sm"
                  onClick={saveLook}
                  disabled={!lookName.trim()}
                  style={{ opacity: lookName.trim() ? 1 : 0.5 }}
                >
                  Save
                </button>
              </div>
            )}
            {userPresets.length > 0 ? (
              <div className="mylooks-row">
                {userPresets.map((p) => (
                  <span key={p.id} className="mylooks-chip">
                    <button
                      type="button"
                      className="mylooks-apply"
                      title="Apply this look"
                      onClick={() => applyLook(p)}
                    >
                      <span className="mylooks-swatch" aria-hidden="true">
                        {(p.swatch && p.swatch.length
                          ? p.swatch
                          : [
                              // Looks saved before previews existed: a stand-in
                              // built from the saved accent hue.
                              "#f2f2f5",
                              "#ffffff",
                              `oklch(0.62 0.11 ${p.tweaks?.accent ?? 245})`,
                              "#26272c",
                            ]
                        ).map((c, i) => (
                          <span key={i} style={{ background: c }} />
                        ))}
                      </span>
                      {p.name}
                    </button>
                    <ConfirmButton
                      className="iconbtn sm mylooks-del"
                      title="Delete this look"
                      onConfirm={() => deleteLook(p.id)}
                      requireConfirmation={confirmBeforeDelete}
                      icon={<Icon.Close width={10} height={10} />}
                    />
                  </span>
                ))}
              </div>
            ) : (
              !savingLook && (
                <p className="mylooks-empty">
                  Dial in a look you like, then save it here to switch back
                  any time.
                </p>
              )
            )}
          </div>

          <Row name="Wordmark" hint="The Ligand logo type in the top bar">
            <div className="wordmark-row">
              {WORDMARK_FONTS.map((f) => (
                <button
                  key={f.id}
                  data-f={f.id}
                  className={"wordmark-pick" + (tweaks.wordmarkFont === f.id ? " active" : "")}
                  onClick={() => setTweak({ wordmarkFont: f.id })}
                  title={f.name}
                  aria-pressed={tweaks.wordmarkFont === f.id}
                >
                  {f.sample}
                </button>
              ))}
            </div>
          </Row>
          <Row name="Hyperfocus color" hint="The look Hyperfocus mode locks into">
            <div className="palette-row">
              {[
                { id: "crimson", name: "Crimson", swatch: "#8b0000" },
                { id: "monster", name: "Monster", swatch: "#2fca12" },
                { id: "cyber", name: "Cyber", swatch: "#00cfae" },
                { id: "violet", name: "Violet", swatch: "#8b5cf6" },
                { id: "ember", name: "Ember", swatch: "#e85f00" },
                { id: "ice", name: "Ice", swatch: "#2fb5e0" },
                { id: "mono", name: "Mono", swatch: "#e8e8ee" },
              ].map((t) => (
                <button
                  key={t.id}
                  className={"palette-pick" + ((settings.hyperfocus?.theme || "crimson") === t.id ? " active" : "")}
                  onClick={() => setSection("hyperfocus", { theme: t.id })}
                  aria-pressed={(settings.hyperfocus?.theme || "crimson") === t.id}
                >
                  <span className="palette-dot" style={{ background: t.swatch }} />
                  {t.name}
                </button>
              ))}
            </div>
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
          <Row name="Reduce motion" hint="Calmer, minimizes animation">
            <Switch
              checked={behavior.reduceMotion}
              onChange={(v) => setSection("behavior", { reduceMotion: v })}
            />
          </Row>
          <Row
            name="Desktop scrollbar"
            hint="Show the PC scroll bar"
            className="desktop-only-setting"
          >
            <Switch
              checked={behavior.showDesktopScrollbars}
              onChange={(v) => setSection("behavior", { showDesktopScrollbars: v })}
            />
          </Row>

          <div className="appearance-reset-row">
            <button
              className="btn ghost sm"
              onClick={() => {
                if (window.confirm("Reset appearance to defaults?")) {
                  setTweak(TWEAK_DEFAULTS);
                  onResetWallpaperPresets?.();
                }
              }}
            >
              <Icon.Reset width={13} height={13} /> Reset appearance
            </button>
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
                ? "Your browser is blocking notifications. Enable them in site settings"
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
          <Row
            name="Ring until dismissed"
            hint="When a focus block ends, ring an insistent alarm (kitchen-timer style) until you tap to stop"
          >
            <Switch
              checked={notifications.pomodoroAlarm ?? false}
              onChange={(v) => setSection("notifications", { pomodoroAlarm: v })}
            />
          </Row>
          <Row name="UI sounds" hint="Subtle click/ding when toggling switches, moving sliders, completing tasks">
            <Switch
              checked={uiSounds.enabled ?? true}
              onChange={(v) => setSection("uiSounds", { enabled: v })}
            />
          </Row>
          {(uiSounds.enabled ?? true) && (
            <Row name="Sound volume" hint={`${uiSounds.volume ?? 75}%`}>
              <div style={{ width: 160 }}>
                <Slider
                  value={uiSounds.volume ?? 75}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(v) => setSection("uiSounds", { volume: v })}
                  format={(v) => v + "%"}
                />
              </div>
            </Row>
          )}
          <Row
            name="Daily reminder"
            hint="Fires at the set time whenever Ligand is running, even hidden in the tray on desktop"
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
                style={{ width: 132, minWidth: 132 }}
              />
            </Row>
          )}
          {notifications.dailyReminder && (
            <Row
              name="Tie it to a routine"
              hint={'"After I ___, I\'ll open Ligand." Anchoring the check-in to something you already do makes it far more likely to happen'}
            >
              <input
                type="text"
                className="input"
                placeholder="e.g. finish breakfast"
                value={notifications.anchor ?? ""}
                maxLength={60}
                onChange={(e) => setSection("notifications", { anchor: e.target.value })}
                style={{ maxWidth: 220 }}
              />
            </Row>
          )}
          {typeof window !== "undefined" && window.electron?.isElectron && (
            <>
              <Row
                name="Keep running in the tray"
                hint="Closing the window tucks Ligand into the system tray instead of quitting, so reminders and alarms still reach you. Quit fully from the tray icon"
              >
                <Switch
                  checked={desktop.closeToTray ?? true}
                  onChange={(v) => setSection("desktop", { closeToTray: v })}
                />
              </Row>
              <Row
                name="Start with your computer"
                hint="Ligand starts quietly in the tray when you log in, so reminders work without you having to remember to open it"
              >
                <Switch
                  checked={desktop.launchAtLogin ?? false}
                  onChange={(v) => setSection("desktop", { launchAtLogin: v })}
                />
              </Row>
            </>
          )}
        </Section>

        {/* Sleep */}
        <Section
          icon={<Icon.Moon />}
          title="Sleep"
          sub="A gentle daily sleep diary. No scores, no judgments, just your own picture over time."
        >
          <Row
            name="Morning check-in"
            hint="On your first open of the morning, ask one quiet question (how did you sleep?) before showing anything else"
          >
            <Switch
              checked={sleep.morningCheckIn ?? true}
              onChange={(v) => setSection("sleep", { morningCheckIn: v })}
            />
          </Row>
          <Row
            name="Bedtime wind-down nudge"
            hint="A soft reminder 30 minutes before your target lights-out (needs notifications on)"
          >
            <Switch
              checked={sleep.bedtimeReminder ?? false}
              onChange={(v) => setSection("sleep", { bedtimeReminder: v })}
            />
          </Row>
          {(sleep.bedtimeReminder ?? false) && (
            <Row name="Target lights-out">
              <input
                type="time"
                className="input"
                value={sleep.bedtime ?? "23:00"}
                onChange={(e) => setSection("sleep", { bedtime: e.target.value })}
                style={{ width: 132, minWidth: 132 }}
              />
            </Row>
          )}
        </Section>

        {/* Photo-scan alarms. */}
        <AlarmsPanel
          alarms={alarms}
          addAlarm={addAlarm}
          updateAlarm={updateAlarm}
          removeAlarm={removeAlarm}
          onTest={onTestAlarm}
        />

        {/* Focus-mode website blocker — desktop (Electron/Windows) only; the
           component self-gates to nothing on web/PWA and other platforms. */}
        <BlockerPanel />

        {/* Background music */}
        <Section icon={<Icon.Wand />} title="Background music"
          sub="Gentle ambient loops that play across the whole app, separate from Pomodoro scene sounds."
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
            Tracks: Rain, Stream, and Waves, all CC0 ambient loops. Music plays across all tabs and pauses only when you turn it off.
          </p>
        </Section>

        {/* Pomodoro ambience */}
        <Section
          icon={<Icon.Sun />}
          title="Focus ambience"
          sub="Choose the sound used during Pomodoro focus. Light and Dark wallpapers now live in their matching presets above."
        >
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
        <Section icon={<Icon.Cloud />} title="Gemini & Privacy">
          <p style={{ fontSize: 11.5, color: "var(--ink-4)", margin: "0 0 12px", lineHeight: 1.5 }}>
            {aiLocked
              ? "AI features are available when you sign in. Guest mode keeps everything local on this device."
              : "Gemini is separate from the ChatGPT connection above. It receives only the sanitized fields needed for the feature you use. Journal text and recovery context stay off by default."}
          </p>
          {!aiLocked && (
            <div className="assistant-privacy-boundary compact" style={{ marginBottom: 8 }}>
              <Icon.Lock />
              <div>
                <strong>Private by default</strong>
                <span>Notes are never sent. Journal text requires the separate opt-in below. ChatGPT sharing choices do not enable Gemini access.</span>
              </div>
            </div>
          )}
          <Row
            name="AI goal insights"
            hint={aiLocked ? aiLockedHint : "Goal summary and 'At a glance' suggestions"}
            className={aiLocked ? "setting-row-locked" : ""}
          >
            <Switch
              checked={!aiLocked && ai.aiGoalInsights !== false}
              onChange={(v) => !aiLocked && setSection("ai", { aiGoalInsights: v })}
              disabled={aiLocked}
            />
          </Row>
          <Row
            name="AI weekly review"
            hint={aiLocked ? aiLockedHint : "The 'Your week' card on Home"}
            className={aiLocked ? "setting-row-locked" : ""}
          >
            <Switch
              checked={!aiLocked && ai.aiWeeklyReview !== false}
              onChange={(v) => !aiLocked && setSection("ai", { aiWeeklyReview: v })}
              disabled={aiLocked}
            />
          </Row>
          <Row
            name="Include journal text in AI context"
            hint={aiLocked ? aiLockedHint : "Off by default. When off, Gemini sees only bounded aggregate stats such as task and check-in counts."}
            className={aiLocked ? "setting-row-locked" : ""}
          >
            <Switch
              checked={!aiLocked && ai.includeJournalText === true}
              onChange={(v) => !aiLocked && setSection("ai", { includeJournalText: v })}
              disabled={aiLocked}
            />
          </Row>
          {hasRecoveryGoal && (
            <Row
              name="AI recovery insights"
              hint={aiLocked ? aiLockedHint : "Recovery data is kept private by default. Nothing from a recovery tracker is sent to AI unless this is on."}
              className={aiLocked ? "setting-row-locked" : ""}
            >
              <Switch
                checked={!aiLocked && ai.aiRecoveryInsights === true}
                onChange={(v) => !aiLocked && setSection("ai", { aiRecoveryInsights: v })}
                disabled={aiLocked}
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
          sub="Goals you've removed wait here. Restore them anytime, or delete one for good. That part can't be undone."
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
              onClick={() => downloadBackup()}
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
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const result = await readBackupFile(file);
                  e.target.value = ""; // allow re-picking same file
                  if (!result.ok) {
                    alert(result.error);
                    return;
                  }
                  if (!window.confirm("Import will overwrite your current Ligand data. Continue?")) return;
                  applyBackupData(localStorage, result.data);
                  window.location.reload();
                }}
              />
            </label>
          </Row>
          <Row name="Reset preferences" hint="Theme, notifications, etc. - keeps your data">
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
          <Row name="Erase all data" hint="Goals, tasks, habits and journal. Can't be undone">
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

        {/* About + updates */}
        <AboutSection />
      </div>
    </>
  );
}

/* About: version, channel, and (Windows app only) a manual update check.
   On web/PWA the service worker self-updates in the background
   (vite-plugin-pwa autoUpdate), so there is nothing to click — the note
   says so instead of showing a dead button. */
function AboutSection() {
  const isElectron = typeof window !== "undefined" && Boolean(window.electron?.isElectron);
  const [status, setStatus] = useState(null); // {state, ...}

  useEffect(() => {
    if (!isElectron || !window.electron?.onUpdateStatus) return undefined;
    const off = window.electron.onUpdateStatus(setStatus);
    const offAvail = window.electron.onUpdateAvailable?.((info) =>
      setStatus({ state: "available", version: info?.version })
    );
    const offDone = window.electron.onUpdateDownloaded?.((info) =>
      setStatus({ state: "downloaded", version: info?.version })
    );
    return () => {
      off?.();
      offAvail?.();
      offDone?.();
    };
  }, [isElectron]);

  const check = async () => {
    setStatus({ state: "checking" });
    const res = await window.electron?.checkForUpdates?.();
    if (res && !res.ok) {
      setStatus(
        res.reason === "dev"
          ? { state: "error", message: "Updates only run in the installed app." }
          : { state: "error", message: res.reason }
      );
    }
    // On success the event stream (checking/none/available/progress/
    // downloaded) drives the status text.
  };

  const statusText = (() => {
    if (!status) return null;
    switch (status.state) {
      case "checking": return "Checking…";
      case "none": return "You're up to date.";
      case "available": return `Update available${status.version ? ` (v${status.version})` : ""}, downloading…`;
      case "progress": return `Downloading… ${status.percent ?? 0}%`;
      case "downloaded": return `v${status.version || ""} downloaded. Restart to install.`;
      case "error": return `Update check failed: ${status.message}`;
      default: return null;
    }
  })();

  return (
    <Section icon={<Icon.Spark />} title="About">
      <Row name="Version">
        <span className="mono" style={{ fontSize: 13, color: "var(--ink-2)" }}>
          {pkg.version}
        </span>
      </Row>
      <Row
        name={isElectron ? "Windows app updates" : "Web app updates"}
        hint={
          isElectron
            ? "Checks GitHub Releases; downloads install on restart"
            : "The web app updates itself automatically in the background"
        }
      >
        {isElectron ? (
          status?.state === "downloaded" ? (
            <button className="btn sm primary" onClick={() => window.electron?.quitAndInstall?.()}>
              Restart to update
            </button>
          ) : (
            <button className="btn ghost sm" onClick={check} disabled={status?.state === "checking"}>
              Check for updates
            </button>
          )
        ) : (
          <span style={{ fontSize: 12, color: "var(--ink-4)" }}>Automatic</span>
        )}
      </Row>
      {statusText && (
        <p className="set-note" role="status">{statusText}</p>
      )}
    </Section>
  );
}
