import { useState } from "react";
import { Segmented, Slider, Switch } from "../components/Controls.jsx";
import { Icon } from "../components/Icons.jsx";
import { ACCENTS } from "../theme/useTweaks.js";
import AlarmsPanel from "../components/AlarmsPanel.jsx";
import pkg from "../../package.json";

/* MobileSettings - a simplified, phone-focused settings list shown instead of
   the full desktop Settings when the viewport is <768px. Only surfaces the
   controls that make sense on a phone; the desktop-only bits (Pomodoro
   timings, wallpaper gallery, AI config, density, radius, ambient glow, etc.)
   stay on the desktop Settings page.

   IMPORTANT: theme here is the SEPARATE mobile theme (ligand.mobileTheme) so
   changing it on a phone never touches the desktop `tweaks.theme` and vice
   versa. Accent, notifications, habits and sound are shared app preferences. */

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

// Same export payload as the desktop Settings "Export data" action.
function exportData() {
  const keys = [
    "ligand.data",
    "ligand.settings",
    "ligand.tweaks",
    "ligand.mobileTheme",
    "ligand.pomodoro",
    "ligand.userPresets",
  ];
  const dump = {};
  keys.forEach((k) => {
    const v = localStorage.getItem(k);
    if (v) dump[k] = JSON.parse(v);
  });
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ligand-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
}) {
  const { notifications, habits, uiSounds = {} } = settings;
  const [signingOut, setSigningOut] = useState(false);
  const loggedIn = Boolean(accountEmail);

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
        {/* Theme (the mobile home for what used to be the floating Theme/Tweaks
           panel on desktop). Theme is phone-local; accent, radius and density
           are shared app-wide tweaks. */}
        <Section icon={<Icon.Wand />} title="Theme">
          <Row name="Mode" hint="This phone only. Your PC keeps its own theme">
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
          <Row name="Habit reminders" hint="A gentle nudge when you open the app">
            <Switch
              checked={notifications.dailyReminder}
              onChange={(v) => setSection("notifications", { dailyReminder: v })}
            />
          </Row>
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
        <AlarmsPanel
          alarms={alarms}
          addAlarm={addAlarm}
          updateAlarm={updateAlarm}
          removeAlarm={removeAlarm}
        />

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
            <button className="btn ghost sm" onClick={exportData}>
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
