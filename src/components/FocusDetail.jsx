import { useMemo } from "react";
import { Icon } from "./Icons.jsx";
import { todayKey } from "../lib/model.js";
import { fmtMinutes } from "../lib/activities.js";
import {
  focusSummary,
  focusByHour,
  hourLabel,
  recentSessions,
  tidy,
} from "../lib/focusStats.js";

/* FocusDetail — the whole picture of your focused time.

   The weekly widget answers "how am I doing this week" and nothing else, so
   the button on it used to jump to the Pomodoro tab: the only place to go.
   This is the somewhere-to-go — records, streaks, the hours you actually
   focus in, and what the time went toward.

   It leans on records and streaks rather than totals because those are the
   numbers that go UP and stay up. A weekly total is as likely to fall as to
   rise and reads as a scolding on a quiet week; a personal best is only ever
   an achievement, and a streak is the one number worth protecting. Nothing
   here shows a target you failed to hit. */

const SOURCE_LABEL = {
  timer: "Finished block",
  partial: "Ended early",
  manual: "Logged after",
  block: "Planned block",
};

function Stat({ value, label, hint, tone = "" }) {
  return (
    <div className={"fd-stat" + (tone ? " " + tone : "")}>
      <div className="fd-stat-val mono">{value}</div>
      <div className="fd-stat-lbl">{label}</div>
      {hint && <div className="fd-stat-hint">{hint}</div>}
    </div>
  );
}

/* Minutes per hour, as a 24-bar strip. Deliberately unlabelled except at the
   quarters — this is a shape to recognise, not a table to read. */
function HourChart({ hours, best }) {
  const max = Math.max(...hours, 1);
  return (
    <div className="fd-hours" role="img"
      aria-label={`Focused minutes by hour of day${best ? `, most around ${hourLabel(best.hour)}` : ""}`}>
      <div className="fd-hours-bars">
        {hours.map((m, h) => (
          <div key={h} className="fd-hour-col" title={`${hourLabel(h)} · ${fmtMinutes(m) || "nothing"}`}>
            <div
              className={"fd-hour-bar" + (best && best.hour === h ? " peak" : "") + (m > 0 ? "" : " empty")}
              style={{ height: `${m > 0 ? Math.max(5, (m / max) * 100) : 2}%` }}
            />
          </div>
        ))}
      </div>
      <div className="fd-hours-axis">
        <span>12a</span><span>6a</span><span>noon</span><span>6p</span><span>11p</span>
      </div>
    </div>
  );
}

export default function FocusDetail({
  focusLog = [],
  goals = [],
  onClose,
  onStartSession,
}) {
  const today = todayKey();
  const s = useMemo(
    () => focusSummary(focusLog, { refKey: today, windowDays: 7, goals }),
    [focusLog, today, goals]
  );
  const byHour = useMemo(() => focusByHour(focusLog), [focusLog]);
  const recent = useMemo(() => recentSessions(focusLog, 10), [focusLog]);

  /** "Jul 29" — a raw 2026-07-29 in the middle of a sentence reads as data. */
  const day = (key) => {
    if (!key) return "";
    try {
      return new Date(key + "T00:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return key;
    }
  };

  const when = (e) => {
    if (e.at) {
      try {
        return new Date(e.at).toLocaleString(undefined, {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        });
      } catch { /* fall through to the date */ }
    }
    try {
      return new Date(e.date + "T00:00:00").toLocaleDateString(undefined, {
        month: "short", day: "numeric",
      });
    } catch {
      return e.date;
    }
  };

  const goalMax = Math.max(...s.byGoal.map((g) => g.minutes), 1);

  return (
    <div className="scrim" role="presentation" onMouseDown={onClose}>
      <div
        className="modal fd-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="fd-head">
          <div>
            <div className="eyebrow">Your focus</div>
            <h2 id="fd-title" className="page-title" style={{ fontSize: 21 }}>
              Focus in detail
            </h2>
          </div>
          <button className="iconbtn" onClick={onClose} title="Close" aria-label="Close">
            <Icon.Close width={14} height={14} />
          </button>
        </div>

        {s.lifetime <= 0 ? (
          <div className="fd-empty">
            <span className="fd-empty-ic"><Icon.Bolt /></span>
            <div className="fd-empty-title">No focused time yet</div>
            <p className="fd-empty-sub">
              Run a Pomodoro block and this fills in — how long you focus, when in
              the day you focus best, and what it went toward.
            </p>
            {onStartSession && (
              <button className="btn primary" onClick={onStartSession}>
                <Icon.Play /> Start a session
              </button>
            )}
          </div>
        ) : (
          <>
            {/* The headline: the streak first, because it's the one number
               worth protecting, then the totals behind it. */}
            <div className="fd-hero">
              <div className="fd-hero-main">
                <span className="fd-hero-num mono">{s.streak.current}</span>
                <span className="fd-hero-unit">
                  day{s.streak.current === 1 ? "" : "s"} in a row
                </span>
                {s.streak.current > 0 && !s.streak.endsToday && (
                  <span className="fd-hero-note">Focus today to keep it</span>
                )}
                {s.streak.current > 0 && s.streak.endsToday && (
                  <span className="fd-hero-note good">Today's counted</span>
                )}
              </div>
              {s.streak.longest > s.streak.current && (
                <div className="fd-hero-side">
                  best run <strong>{s.streak.longest} days</strong>
                </div>
              )}
            </div>

            <div className="fd-stats">
              <Stat value={fmtMinutes(s.lifetime)} label="all time" />
              <Stat
                value={fmtMinutes(s.window) || "0m"}
                label="last 7 days"
                hint={
                  s.change == null
                    ? null
                    : `${s.change >= 0 ? "+" : ""}${s.change}% vs the week before`
                }
                tone={s.change != null && s.change >= 0 ? "up" : ""}
              />
              <Stat value={s.sessions} label={s.sessions === 1 ? "session" : "sessions"}
                hint={s.finished ? `${s.finished} run to the end` : null} />
              <Stat value={fmtMinutes(s.averageSession) || "—"} label="average session" />
            </div>

            <div className="fd-section">
              <div className="fd-section-title">Personal bests</div>
              <div className="fd-records">
                <div className="fd-record">
                  <Icon.Bolt width={13} height={13} />
                  <span className="fd-record-val">{fmtMinutes(s.records.bestDay.minutes) || "—"}</span>
                  <span className="fd-record-lbl">
                    best day{s.records.bestDay.date ? ` · ${day(s.records.bestDay.date)}` : ""}
                  </span>
                </div>
                <div className="fd-record">
                  <Icon.Play width={13} height={13} />
                  <span className="fd-record-val">{fmtMinutes(s.records.bestSession.minutes) || "—"}</span>
                  <span className="fd-record-lbl">
                    longest session
                    {s.records.bestSession.label ? ` · ${s.records.bestSession.label}` : ""}
                  </span>
                </div>
                <div className="fd-record">
                  <Icon.Reset width={13} height={13} />
                  <span className="fd-record-val">{s.records.longestStreak}</span>
                  <span className="fd-record-lbl">longest streak, in days</span>
                </div>
              </div>
            </div>

            <div className="fd-section">
              <div className="fd-section-title">
                When you focus
                {s.best && <span className="fd-section-note">most around {hourLabel(s.best.hour)}</span>}
              </div>
              {byHour.placed > 0 ? (
                <>
                  <HourChart hours={byHour.hours} best={s.best} />
                  {/* Sessions logged before the app recorded a time of day
                     can't be placed on this chart. Say so rather than quietly
                     drawing a shape from a fraction of the history. */}
                  {byHour.skipped > 0 && (
                    <p className="fd-note">
                      From {byHour.placed} of {byHour.placed + byHour.skipped} sessions —
                      earlier ones didn't record a time of day.
                    </p>
                  )}
                </>
              ) : (
                <p className="fd-note">
                  Nothing to place yet. New sessions record when they happened, so
                  this fills in from here.
                </p>
              )}
            </div>

            {s.byGoal.length > 0 && (
              <div className="fd-section">
                <div className="fd-section-title">What it went toward</div>
                <div className="fd-goals">
                  {s.byGoal.map((g) => (
                    <div key={g.id} className="fd-goal">
                      <span className="fd-goal-name">{g.name}</span>
                      <span className="fd-goal-bar">
                        <span
                          className="fd-goal-fill"
                          style={{
                            width: `${Math.max(3, (g.minutes / goalMax) * 100)}%`,
                            background: g.color || "var(--accent)",
                          }}
                        />
                      </span>
                      <span className="fd-goal-min mono">{fmtMinutes(g.minutes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recent.length > 0 && (
              <div className="fd-section">
                <div className="fd-section-title">Recent sessions</div>
                <div className="fd-log">
                  {recent.map((e, i) => (
                    <div key={`${e.date}-${i}`} className="fd-log-row">
                      <span className="fd-log-min mono">{fmtMinutes(tidy(e.minutes))}</span>
                      <span className="fd-log-what">
                        {e.label || <em>nothing in particular</em>}
                      </span>
                      <span className="fd-log-src">{SOURCE_LABEL[e.source] || ""}</span>
                      <span className="fd-log-when">{when(e)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {onStartSession && (
              <div className="fd-foot">
                <button className="btn primary" onClick={onStartSession}>
                  <Icon.Play /> Start a session
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
