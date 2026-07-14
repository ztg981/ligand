import { useEffect, useRef, useState } from "react";
import { Segmented, Slider, Switch } from "../components/Controls.jsx";
import { Icon } from "../components/Icons.jsx";
import { ACCENTS } from "../theme/useTweaks.js";
import { DARK_PALETTES, LIGHT_PALETTES } from "../theme/palettes.js";
import AlarmsPanel from "../components/AlarmsPanel.jsx";
import { downloadBackup } from "../lib/backup.js";
import pkg from "../../package.json";

/* MobileSettings - a simplified, phone-focused settings list shown instead of
   the full desktop Settings when the viewport is <768px. Only surfaces the
   controls that make sense on a phone; the desktop-only bits (Pomodoro
   timings, wallpaper gallery, AI config, density, radius, ambient glow, etc.)
   stay on the desktop Settings page.

   All preferences shown here use phone/iPad-local storage. Account content
   still syncs, but appearance, notifications, habits and sound cannot rewrite
   the PC's settings. */

function Section({ icon, title, children }) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          {icon} {title}
        </div>
      </div>
      {children}
    </div>
  );
}

function Row({ name, hint, children }) {
  return (
    <div className="setting-row">
      <div>
        <div className="name">{name}</div>
        {hint && (
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>{hint}</div>
        )}
      </div>
      {children}
    </div>
  );
}

export default function MobileSettings({
  mobileTheme = "auto",
  setMobileTheme,
  tweaks,
  setTweak,
  settings,
  setSection,
  requestNotifyPermission,
  notifyPermission = "default",
  accountEmail = null,
  onSignOut,
  onRequestAuth,
  alarms = [],
  addAlarm,
  updateAlarm,
  removeAlarm,
  onTestAlarm,
  focusSection = null, // e.g. "alarms" — scroll that card into view on open
  onFocusHandled,
}) {
  const { notifications, habits, uiSounds = {}, sleep = {} } = settings;
  const [signingOut, setSigningOut] = useState(false);
  const loggedIn = Boolean(accountEmail);
  const alarmsRef = useRef(null);

  useEffect(() => {
    if (focusSection === "alarms" && alarmsRef.current) {
      alarmsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      alarmsRef.current.classList.add("settings-focus-flash");
      const t = setTimeout(
        () => alarmsRef.current?.classList.remove("settings-focus-flash"),
        1600
      );
      onFocusHandled?.();
      return () => clearTimeout(t);
    }
    return undefined;
  }, [focusSection, onFocusHandled]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Preferences</div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">The essentials, tuned for your phone.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: 12 }}>
        {/* Theme is the mobile home for what used to be the floating desktop
           Theme/Tweaks panel. Every control in this section is device-local. */}
        <Section icon={<Icon.Wand />} title="Theme">
          <Row name="Mode" hint="This phone only. Auto follows your system">
            <Segmented
              value={mobileTheme}
              onChange={(v) => setMobileTheme?.(v)}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "auto", label: "Auto" },
              ]}
            />
          </Row>
          <Row name="Light look" hint="The palette used whenever light mode shows">
            <div className="palette-row">
              {LIGHT_PALETTES.map((p) => (
                <button
                  key={p.id}
                  className={"palette-pick" + (tweaks.lightPalette === p.id ? " active" : "")}
                  onClick={() => setTweak?.({ lightPalette: p.id })}
                  title={p.desc}
                  aria-pressed={tweaks.lightPalette === p.id}
                >
                  <span className="palette-dot" style={{ background: p.swatch }} />
                  {p.name}
                </button>
              ))}
            </div>
          </Row>
          <Row name="Dark look" hint="The palette used whenever dark mode shows">
            <div className="palette-row">
              {DARK_PALETTES.map((p) => (
                <button
                  key={p.id}
                  className={"palette-pick" + (tweaks.darkPalette === p.id ? " active" : "")}
                  onClick={() => setTweak?.({ darkPalette: p.id })}
                  title={p.desc}
                  aria-pressed={tweaks.darkPalette === p.id}
                >
                  <span className="palette-dot" style={{ background: p.swatch }} />
                  {p.name}
                </button>
              ))}
            </div>
          </Row>
          <Row name="Accent">
            <div className="row" style={{ gap: 6 }}>
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  className={"swatch-pick " + (tweaks.accent === a.id ? "active" : "")}
                  style={{ background: a.color, width: 24, height: 24 }}
                  onClick={() => setTweak?.({ accent: a.id })}
                  title={`Hue ${a.id}`}
                />
              ))}
            </div>
          </Row>
          <Row name="Corner radius" hint={`${tweaks.radius}px`}>
            <div style={{ width: 130 }}>
              <Slider
                value={tweaks.radius}
                min={4}
                max={20}
                step={2}
                onChange={(v) => setTweak?.({ radius: v })}
                format={(v) => v + "px"}
              />
            </div>
          </Row>
          <Row name="Density">
            <Segmented
              value={tweaks.density}
              onChange={(v) => setTweak?.({ density: v })}
              options={[
                { value: "compact", label: "Compact" },
                { value: "comfy", label: "Comfy" },
              ]}
            />
          </Row>
        </Section>

        {/* Notifications */}
        <Section icon={<Icon.Bell />} title="Notifications">
          <Row
            name="Notifications"
            hint={
              notifyPermission === "denied"
                ? "Your browser is blocking notifications"
                : "System notifications + the in-app bell"
            }
          >
            <Switch
              checked={notifications.enabled}
              onChange={(v) => {
                setSection("notifications", { enabled: v });
                if (v) requestNotifyPermission?.();
              }}
            />
          </Row>
          <Row name="Ring until dismissed" hint="Insistent alarm when a focus block ends, until you tap stop">
            <Switch
              checked={notifications.pomodoroAlarm ?? false}
              onChange={(v) => setSection("notifications", { pomodoroAlarm: v })}
            />
          </Row>
          <Row name="Habit reminders" hint="A gentle daily nudge at your chosen time while Ligand is open">
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
          {notifications.dailyReminder && (
            <Row name="Tie it to a routine" hint={'"After I ___, I\'ll open Ligand"'}>
              <input
                type="text"
                className="input"
                placeholder="e.g. finish breakfast"
                value={notifications.anchor ?? ""}
                maxLength={60}
                onChange={(e) => setSection("notifications", { anchor: e.target.value })}
                style={{ maxWidth: 180 }}
              />
            </Row>
          )}
        </Section>

        {/* Sleep */}
        <Section icon={<Icon.Moon />} title="Sleep">
          <Row name="Morning check-in" hint="One quiet question — how did you sleep? — before anything else">
            <Switch
              checked={sleep.morningCheckIn ?? true}
              onChange={(v) => setSection("sleep", { morningCheckIn: v })}
            />
          </Row>
          <Row name="Bedtime nudge" hint="A soft reminder 30 min before target lights-out">
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
                style={{ maxWidth: 120 }}
              />
            </Row>
          )}
        </Section>

        {/* Habits */}
        <Section icon={<Icon.CheckCircle />} title="Habits">
          <Row name="Show streaks" hint="Display your current streak on habits">
            <Switch
              checked={habits.showStreaks}
              onChange={(v) => setSection("habits", { showStreaks: v })}
            />
          </Row>
        </Section>

        {/* Sound */}
        <Section icon={<Icon.Sound />} title="Sound">
          <Row name="UI sounds" hint="Subtle click/ding feedback">
            <Switch
              checked={uiSounds.enabled ?? true}
              onChange={(v) => setSection("uiSounds", { enabled: v })}
            />
          </Row>
          <Row name="Volume" hint={`${uiSounds.volume ?? 75}%`}>
            <div style={{ width: 130 }}>
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
        </Section>

        {/* Alarms */}
        <div ref={alarmsRef}>
          <AlarmsPanel
            alarms={alarms}
            addAlarm={addAlarm}
            updateAlarm={updateAlarm}
            removeAlarm={removeAlarm}
            onTest={onTestAlarm}
          />
        </div>

        {/* Account */}
        <Section icon={<Icon.Cloud />} title="Account">
          <Row
            name={loggedIn ? "Signed in" : "Not signed in"}
            hint={loggedIn ? accountEmail : "Local profile on this device"}
          >
            {loggedIn ? (
              <button
                className="btn ghost sm"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  try {
                    await onSignOut?.();
                  } finally {
                    setSigningOut(false);
                  }
                }}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            ) : (
              <button className="btn ghost sm" onClick={() => onRequestAuth?.()}>
                Sign in
              </button>
            )}
          </Row>
          <Row name="Export data" hint="Download everything as a JSON backup">
            <button className="btn ghost sm" onClick={() => downloadBackup()}>
              ↓ Export
            </button>
          </Row>
        </Section>

        {/* About */}
        <Section icon={<Icon.Spark />} title="About">
          <Row name="Version">
            <span className="mono" style={{ fontSize: 13, color: "var(--ink-2)" }}>
              {pkg.version}
            </span>
          </Row>
        </Section>
      </div>
    </>
  );
}
