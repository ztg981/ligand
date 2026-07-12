import { useMemo, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import { todayKey } from "../lib/model.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { collectDayWins, winLines } from "../lib/dayWins.js";

/* WindDown — the evening "end your day feeling successful" card (the best
   idea in Sunsama, rebuilt in Ligand's voice).

   From 5pm the card lists what you ACTUALLY did today — cleared tasks, habit
   check-ins, focus minutes, workouts, journal — each with a spring-in check.
   One button closes the day: an optional one-line reflection saved to the
   journal, then the card settles into a quiet "day closed" state until
   tomorrow. Quiet days get gentle wording, never a guilt trip. */

const EVENING_HOUR = 17; // 5pm — early enough for students, not just 9-to-5

export default function WindDown({
  tasks = [],
  goals = [],
  focusLog = [],
  workouts = [],
  journal = [],
  addJournalEntry,
  now = new Date(),
}) {
  const today = todayKey(now);
  const isEvening = now.getHours() >= EVENING_HOUR;

  const [closedOn, setClosedOn] = useLocalStorage("ligand.winddown.closed", null);
  const closedToday = closedOn === today;

  const [reflecting, setReflecting] = useState(false);
  const [reflection, setReflection] = useState("");

  const wins = useMemo(
    () => collectDayWins({ tasks, goals, focusLog, workouts, journal }, today),
    [tasks, goals, focusLog, workouts, journal, today]
  );
  const lines = useMemo(() => winLines(wins), [wins]);

  // Not evening yet and not closed → the card stays out of the way entirely.
  if (!isEvening && !closedToday) return null;

  const closeDay = () => {
    const t = reflection.trim();
    if (t) addJournalEntry?.({ text: t, prompt: "Closing the day" });
    setClosedOn(today);
    setReflecting(false);
    setReflection("");
  };

  if (closedToday) {
    return (
      <div className="card winddown-card closed">
        <div className="winddown-closed-row">
          <span className="winddown-moon"><Icon.Moon /></span>
          <div>
            <div className="winddown-closed-title">Day closed</div>
            <div className="winddown-closed-sub">
              {lines.length > 0
                ? `${lines.length} win${lines.length === 1 ? "" : "s"} today. See you tomorrow.`
                : "Rest well. Tomorrow is fresh."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card winddown-card">
      <div className="card-head">
        <div className="card-title"><Icon.Moon /> Winding down</div>
        <span className="winddown-time">
          {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>

      {lines.length > 0 ? (
        <>
          <p className="winddown-lead">Look what today actually held:</p>
          <ul className="winddown-list">
            {lines.map((l, i) => (
              <li key={l.id} className="winddown-item" style={{ "--i": i }}>
                <span className="winddown-check"><Icon.Check width={12} height={12} /></span>
                {l.text}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="winddown-lead quiet">
          A quiet day. Those count too — showing up tomorrow is what matters.
        </p>
      )}

      {reflecting ? (
        <div className="winddown-reflect">
          <input
            className="input"
            autoFocus
            placeholder="One line about today (optional)"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") closeDay();
              if (e.key === "Escape") setReflecting(false);
            }}
            maxLength={280}
          />
          <div className="row" style={{ gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="btn ghost sm" onClick={() => setReflecting(false)}>
              Back
            </button>
            <button className="btn primary sm" onClick={closeDay}>
              <Icon.Moon width={13} height={13} /> Close the day
            </button>
          </div>
        </div>
      ) : (
        <button className="btn winddown-close-btn" onClick={() => setReflecting(true)}>
          <Icon.Moon width={14} height={14} /> Close the day
        </button>
      )}
    </div>
  );
}
