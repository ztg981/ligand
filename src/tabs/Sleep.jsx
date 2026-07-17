import { useMemo, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import { Switch } from "../components/Controls.jsx";
import SleepRing from "../components/SleepRing.jsx";
import { todayKey } from "../lib/model.js";
import {
  buildNights,
  sleepStats,
  sleepDurationMin,
  durationLabel,
  clockLabel,
  minutesOfDay,
  weekDelta,
  wakeConsistencyLine,
  nightLine,
  QUALITY_LABELS,
} from "../lib/sleep.js";
import "./Sleep.css";

/* Sleep — the diary's own tab, built like a dedicated sleep app but in
   Ligand's voice: a pattern chart of your actual sleep windows (the part
   phone sleep apps get right — you SEE drift, not read about it), honest
   averages, a fully editable history, and your target window.

   Still a diary, not a tracker: no scores, no "sleep debt", no verdicts.
   Everything renders from the same ligand.sleep entries the morning
   check-in writes. */

const DAYS = 14;

/* ---- pattern chart axis: 8 PM → 12 PM next day (16h window) ---- */
const AXIS_START = 20 * 60; // 20:00
const AXIS_SPAN = 16 * 60;  // through 12:00 next day

function axisPos(min) {
  if (min == null) return null;
  const rel = (min - AXIS_START + 1440) % 1440;
  return Math.max(0, Math.min(AXIS_SPAN, rel));
}

const AXIS_TICKS = [
  { at: 0, label: "8 PM" },
  { at: 240, label: "12 AM" },
  { at: 480, label: "4 AM" },
  { at: 720, label: "8 AM" },
  { at: 960, label: "12 PM" },
];

function PatternChart({ nights, bedtimeTarget, wakeTarget }) {
  const tTop = axisPos(minutesOfDay(bedtimeTarget));
  const tBottom = axisPos(minutesOfDay(wakeTarget));
  const hasTarget = tTop != null && tBottom != null && tBottom > tTop;

  return (
    <div className="sltab-pattern">
      <div className="sltab-axis" aria-hidden="true">
        {AXIS_TICKS.map((t) => (
          <span key={t.at}>{t.label}</span>
        ))}
      </div>
      <div
        className="sltab-cols"
        role="img"
        aria-label={`Sleep windows for the last ${nights.length} nights on a 8 PM to noon axis.`}
      >
        {AXIS_TICKS.slice(1, -1).map((t) => (
          <span
            key={t.at}
            className="sltab-gridline"
            style={{ top: `${(t.at / AXIS_SPAN) * 100}%` }}
          />
        ))}
        {hasTarget && (
          <span
            className="sltab-target-band"
            style={{
              top: `${(tTop / AXIS_SPAN) * 100}%`,
              height: `${((tBottom - tTop) / AXIS_SPAN) * 100}%`,
            }}
            title={`Your target window: ${bedtimeTarget} → ${wakeTarget}`}
          />
        )}
        {nights.map((n) => {
          const d = new Date(`${n.key}T00:00:00`);
          const letter = d.toLocaleDateString(undefined, { weekday: "narrow" });
          let bar = null;
          if (n.entry) {
            const top = axisPos(minutesOfDay(n.entry.bedTime));
            const bottom = axisPos(minutesOfDay(n.entry.wakeTime));
            if (top != null && bottom != null && bottom > top) {
              bar = (
                <span
                  className={
                    "sltab-night-bar q" + (n.entry.quality || 3) + (n.isToday ? " today" : "")
                  }
                  style={{
                    top: `${(top / AXIS_SPAN) * 100}%`,
                    height: `${((bottom - top) / AXIS_SPAN) * 100}%`,
                  }}
                  title={`${n.key}: ${n.entry.bedTime} → ${n.entry.wakeTime} (${durationLabel(n.min)}, ${QUALITY_LABELS[n.entry.quality]})`}
                />
              );
            }
          }
          return (
            <span className="sltab-col" key={n.key} title={n.entry ? undefined : `${n.key}: not logged`}>
              {bar}
              <span className={"sltab-col-lbl" + (n.isToday ? " today" : "")}>{letter}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---- one history row + inline editor ---- */
function NightRow({ night, logSleep, removeSleep }) {
  const [editing, setEditing] = useState(false);
  const e = night.entry;
  const [bedTime, setBedTime] = useState(e?.bedTime || "23:00");
  const [wakeTime, setWakeTime] = useState(e?.wakeTime || "07:00");
  const [quality, setQuality] = useState(e?.quality || 3);
  const [note, setNote] = useState(e?.note || "");

  const d = new Date(`${night.key}T00:00:00`);
  const dateLbl = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const draftMin = sleepDurationMin(bedTime, wakeTime);

  const save = () => {
    const saved = logSleep({ date: night.key, bedTime, wakeTime, quality, note });
    if (saved) setEditing(false);
  };

  return (
    <>
      <div className="sltab-row">
        <span className="sltab-row-date">{dateLbl}</span>
        {e ? (
          <>
            <span className="sltab-row-window">
              {e.bedTime} → {e.wakeTime}
            </span>
            <span className="sltab-row-dur">{durationLabel(night.min)}</span>
            <span className="sltab-row-q" title={QUALITY_LABELS[e.quality]}>
              {Array.from({ length: e.quality }, (_, i) => (
                <span key={i} className="sltab-row-qdot" />
              ))}
            </span>
            {e.note && (
              <span className="sltab-row-note" title={e.note}>
                <Icon.Note width={12} height={12} />
              </span>
            )}
          </>
        ) : (
          <span className="sltab-row-window" style={{ color: "var(--ink-4)" }}>
            not logged
          </span>
        )}
        <button className="btn ghost sm" onClick={() => setEditing((v) => !v)}>
          {editing ? "Close" : e ? "Edit" : "Add"}
        </button>
      </div>

      {editing && (
        <div className="sltab-editor">
          <div className="sltab-editor-times">
            <input type="time" className="input" value={bedTime} onChange={(ev) => setBedTime(ev.target.value)} />
            <span style={{ color: "var(--ink-4)" }}>→</span>
            <input type="time" className="input" value={wakeTime} onChange={(ev) => setWakeTime(ev.target.value)} />
            <span className="mono" style={{ fontSize: 12, color: "var(--accent-ink)", fontWeight: 600 }}>
              {durationLabel(draftMin)}
            </span>
          </div>
          <div className="sltab-editor-q" role="radiogroup" aria-label="How it felt">
            {[1, 2, 3, 4, 5].map((q) => (
              <button
                key={q}
                role="radio"
                aria-checked={quality === q}
                className={"sltab-editor-qbtn" + (quality === q ? " on" : "")}
                onClick={() => setQuality(q)}
              >
                {QUALITY_LABELS[q]}
              </button>
            ))}
          </div>
          <input
            className="input"
            placeholder="Note (optional)"
            value={note}
            maxLength={200}
            onChange={(ev) => setNote(ev.target.value)}
          />
          <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
            {e && (
              <button
                className="btn ghost sm"
                style={{ color: "oklch(0.55 0.16 20)" }}
                onClick={() => {
                  removeSleep(night.key);
                  setEditing(false);
                }}
              >
                Remove
              </button>
            )}
            <button className="btn primary sm" onClick={save} disabled={draftMin == null}>
              <Icon.Check width={13} height={13} /> Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function Sleep({
  sleepLog = [],
  logSleep,
  removeSleep,
  sleepSettings = {},
  setSection,
  onLogNight, // opens the morning check-in (manual) for a quick today-log
}) {
  const today = todayKey();
  const nights = useMemo(() => buildNights(sleepLog, DAYS, today), [sleepLog, today]);
  const stats = useMemo(() => sleepStats(sleepLog, DAYS, today), [sleepLog, today]);
  const delta = useMemo(() => weekDelta(sleepLog, today), [sleepLog, today]);

  const todayEntry = nights[nights.length - 1]?.entry || null;
  const lastLogged = [...nights].reverse().find((n) => n.entry) || null;
  const wakeLine = wakeConsistencyLine(stats.wake);

  const bedtime = sleepSettings.bedtime ?? "23:00";
  const wakeTarget = sleepSettings.wakeTarget ?? "07:00";
  const targetMin = sleepDurationMin(bedtime, wakeTarget);

  const trendLine =
    delta.deltaMin == null
      ? null
      : delta.deltaMin >= 0
      ? `This week you're averaging ${durationLabel(delta.thisAvg)}, which is ${durationLabel(delta.deltaMin)} more than last week.`
      : `This week you're averaging ${durationLabel(delta.thisAvg)}, a little less than last week. Just information, not a verdict.`;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Sleep diary</div>
          <h1 className="page-title">Sleep</h1>
          <p className="page-sub">
            Your own picture of your nights. No scores, no judgments — logging is the whole practice.
          </p>
        </div>
        <button className="btn primary sm" onClick={onLogNight}>
          <Icon.Moon width={13} height={13} /> {todayEntry ? "Edit last night" : "Log last night"}
        </button>
      </div>

      <div className="sltab-grid">
        <div className="stack" style={{ gap: 12, minWidth: 0 }}>
        {/* Last night hero */}
        <div className="card">
          <div className="card-head">
            <div className="card-title"><Icon.Moon /> Last night</div>
          </div>
          {lastLogged ? (
            <div className="sltab-hero">
              <div className="sltab-hero-main">
                <span className="sltab-hero-dur">{durationLabel(lastLogged.min)}</span>
                <span className="sltab-hero-window">
                  {lastLogged.entry.bedTime} → {lastLogged.entry.wakeTime}
                  {!lastLogged.isToday && ` · ${lastLogged.key}`}
                </span>
              </div>
              <div className="stack" style={{ gap: 6, alignItems: "flex-start" }}>
                <span className="sltab-hero-quality">
                  {QUALITY_LABELS[lastLogged.entry.quality]}
                </span>
                {lastLogged.entry.note && (
                  <span className="sltab-hero-note">"{lastLogged.entry.note}"</span>
                )}
              </div>
            </div>
          ) : (
            <p className="sltab-hero-empty">
              Nothing logged yet. Two taps each morning — lights-out, woke-up — and
              this page becomes your own sleep picture.
            </p>
          )}
          {lastLogged && (
            <p className="sleep-lastline" style={{ marginTop: 12 }}>{nightLine(lastLogged.entry)}</p>
          )}
        </div>

        {/* Pattern chart */}
        <div className="card">
          <div className="card-head">
            <div className="card-title"><Icon.Calendar /> Your pattern</div>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {stats.count}/{DAYS} nights
            </span>
          </div>
          <PatternChart nights={nights} bedtimeTarget={bedtime} wakeTarget={wakeTarget} />
          <div className="sltab-pattern-foot">
            <span>each bar = one night in bed</span>
            <span>shaded band = your target window</span>
          </div>
        </div>

        {/* Averages */}
        {stats.count > 0 && (
          <div className="card">
            <div className="card-head">
              <div className="card-title"><Icon.Spark /> Two-week picture</div>
            </div>
            <div className="sltab-stats">
              <div className="sltab-stat">
                <span className="sltab-stat-num">{durationLabel(stats.avgMin)}</span>
                <span className="sltab-stat-lbl">avg sleep</span>
              </div>
              <div className="sltab-stat">
                <span className="sltab-stat-num">{stats.bed ? clockLabel(stats.bed.meanMin) : "—"}</span>
                <span className="sltab-stat-lbl">avg lights-out</span>
              </div>
              <div className="sltab-stat">
                <span className="sltab-stat-num">{stats.wake ? clockLabel(stats.wake.meanMin) : "—"}</span>
                <span className="sltab-stat-lbl">avg wake</span>
              </div>
              <div className="sltab-stat">
                <span className="sltab-stat-num">
                  {stats.wake ? (stats.wake.spreadMin <= 45 ? "Steady" : stats.wake.spreadMin <= 90 ? "Drifting" : "Varied") : "—"}
                </span>
                <span className="sltab-stat-lbl">wake rhythm</span>
              </div>
            </div>
            {trendLine && <p className="sltab-trendline">{trendLine}</p>}
            {wakeLine && <p className="sltab-wakeline">{wakeLine}</p>}
          </div>
        )}
        </div>

        <div className="stack" style={{ gap: 12, minWidth: 0 }}>
        {/* Target window + preferences */}
        <div className="card">
          <div className="card-head">
            <div className="card-title"><Icon.Target /> Your target window</div>
          </div>
          <div className="sltab-ring-wrap">
            <SleepRing
              bedTime={bedtime}
              wakeTime={wakeTarget}
              size={230}
              onChange={(field, val) => {
                if (field === "bed") setSection?.("sleep", { bedtime: val });
                else if (field === "wake") setSection?.("sleep", { wakeTarget: val });
                else setSection?.("sleep", { bedtime: val.bed, wakeTarget: val.wake });
              }}
            />
          </div>
          <p className="sltab-window-line">
            <strong>{bedtime}</strong> → <strong>{wakeTarget}</strong>
            {targetMin != null && <> · {durationLabel(targetMin)} in bed</>}.
            Try to keep roughly this window every night. Waking up around the
            same time matters more than anything else you can tweak.
          </p>
          <div className="setting-row">
            <div>
              <div className="name">Target lights-out</div>
            </div>
            <input
              type="time"
              className="input"
              value={bedtime}
              onChange={(e) => setSection?.("sleep", { bedtime: e.target.value })}
              style={{ width: 132, minWidth: 132 }}
            />
          </div>
          <div className="setting-row">
            <div>
              <div className="name">Target wake</div>
            </div>
            <input
              type="time"
              className="input"
              value={wakeTarget}
              onChange={(e) => setSection?.("sleep", { wakeTarget: e.target.value })}
              style={{ width: 132, minWidth: 132 }}
            />
          </div>
          <div className="setting-row">
            <div>
              <div className="name">Bedtime wind-down nudge</div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>
                A soft reminder 30 minutes before lights-out
              </div>
            </div>
            <Switch
              checked={sleepSettings.bedtimeReminder ?? false}
              onChange={(v) => setSection?.("sleep", { bedtimeReminder: v })}
            />
          </div>
          <div className="setting-row">
            <div>
              <div className="name">Morning check-in</div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>
                One quiet question before the dashboard, first open of the morning
              </div>
            </div>
            <Switch
              checked={sleepSettings.morningCheckIn ?? true}
              onChange={(v) => setSection?.("sleep", { morningCheckIn: v })}
            />
          </div>
        </div>

        {/* History */}
        <div className="card">
          <div className="card-head">
            <div className="card-title"><Icon.Book /> Last {DAYS} nights</div>
          </div>
          {sleepLog.length === 0 ? (
            <p className="sltab-empty-hint">
              Logged nights land here, newest first, and every one stays editable.
            </p>
          ) : null}
          <div className="sltab-history">
            {[...nights].reverse().map((n) => (
              <NightRow key={n.key + (n.entry ? "-e" : "-x")} night={n} logSleep={logSleep} removeSleep={removeSleep} />
            ))}
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
