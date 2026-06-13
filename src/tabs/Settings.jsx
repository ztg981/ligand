import { Segmented, Slider, Switch } from "../components/Controls.jsx";
import { Icon } from "../components/Icons.jsx";
import { ACCENTS } from "../theme/useTweaks.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { POMO_DEFAULTS } from "../hooks/usePomodoro.js";
import { WALLPAPERS, SOUNDS } from "../lib/wallpaper.js";
import ConfirmButton from "../components/ConfirmButton.jsx";

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
}) {
  // Pomodoro timings live in their own key (shared with the timer engine).
  const [pomoStored, setPomo] = useLocalStorage("ligand.pomodoro", POMO_DEFAULTS);
  const pomo = { ...POMO_DEFAULTS, ...pomoStored };
  const patchPomo = (patch) => setPomo((p) => ({ ...p, ...patch }));

  const { notifications, habits, assistant, wallpaper, behavior, profile } = settings;

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
          sub="Gentle nudges for finished focus blocks, overdue goals, urgent tasks, and welcome-backs. They also collect in the bell up top."
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
          <Row name="Daily reminder" hint="A nudge at a set time each day">
            <div className="row" style={{ gap: 8 }}>
              <SoonTag />
              <Switch
                checked={notifications.dailyReminder}
                onChange={(v) => setSection("notifications", { dailyReminder: v })}
              />
            </div>
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

        {/* Wallpaper & sound */}
        <Section
          icon={<Icon.Sun />}
          title="Wallpaper & sound"
          sub="Set the backdrop behind everything. Each wallpaper brings its own light or dark mood so text stays easy to read."
        >
          <div style={{ marginBottom: 6 }}>
            <div className="name" style={{ marginBottom: 6 }}>Wallpaper</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
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
            </div>
            <p className="set-note">
              Custom wallpapers (your own colors and images) are coming soon.
            </p>
          </div>
          <Row name="Ambient sound">
            <div className="row" style={{ gap: 8 }}>
              <SoonTag />
              <select
                className="input"
                value={wallpaper.sound}
                onChange={(e) => setSection("wallpaper", { sound: e.target.value })}
                style={{ maxWidth: 140 }}
                disabled
              >
                {SOUNDS.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
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
