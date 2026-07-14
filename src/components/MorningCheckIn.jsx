import { useEffect, useState } from "react";
import { Icon } from "./Icons.jsx";
import { QUALITY_LABELS, nightLine, sleepDurationMin, durationLabel } from "../lib/sleep.js";

/* MorningCheckIn — the calm front door.

   On the first open of the morning, Ligand asks ONE thing — "how did you
   sleep?" — on a quiet full screen, before the dashboard exists. That's
   deliberate, for two reasons:
   - the sleep diary is the daily anchor habit (log one small true thing
     every day and the rest of the app comes along for free), and
   - it solves the "I don't want to open the app because I'll have to
     look at everything" problem: you don't. First there is only this.

   Two taps and a Save; Skip is always one tap and never nagged about.
   After saving, the dashboard is revealed by YOUR tap — it never pounces. */

const QUALITIES = [1, 2, 3, 4, 5];

export default function MorningCheckIn({
  defaults = {},      // { bedTime, wakeTime } from the most recent entry
  manual = false,     // opened from the sleep card, not the morning gate
  onSave,             // (draft) => entry | null
  onSkip,             // morning gate: "skip today"; manual: plain close
}) {
  const [bedTime, setBedTime] = useState(defaults.bedTime || "23:00");
  const [wakeTime, setWakeTime] = useState(defaults.wakeTime || "07:00");
  const [quality, setQuality] = useState(3);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(null); // entry after a successful save

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onSkip?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  const min = sleepDurationMin(bedTime, wakeTime);

  const save = () => {
    const entry = onSave?.({ bedTime, wakeTime, quality, note });
    if (entry) setSaved(entry);
  };

  return (
    <div className="sleep-gate" role="dialog" aria-modal="true" aria-labelledby="sleep-gate-title">
      <div className="sleep-gate-inner">
        {saved ? (
          <>
            <span className="sleep-gate-ic"><Icon.Sun /></span>
            <h2 className="sleep-gate-title" id="sleep-gate-title">Logged.</h2>
            <p className="sleep-gate-line">{nightLine(saved)}</p>
            <button className="btn primary sleep-gate-go" onClick={onSkip} autoFocus>
              Start your day <Icon.Arrow width={14} height={14} />
            </button>
          </>
        ) : (
          <>
            <span className="sleep-gate-ic"><Icon.Moon /></span>
            <h2 className="sleep-gate-title" id="sleep-gate-title">
              {manual ? "Log a night" : "Morning. How did you sleep?"}
            </h2>
            {!manual && (
              <p className="sleep-gate-sub">
                Just this one thing — everything else can wait behind this screen.
              </p>
            )}

            <div className="sleep-gate-times">
              <label className="sleep-gate-field">
                <span>Lights out</span>
                <input
                  type="time"
                  className="input"
                  value={bedTime}
                  onChange={(e) => setBedTime(e.target.value)}
                />
              </label>
              <span className="sleep-gate-arrow" aria-hidden="true">→</span>
              <label className="sleep-gate-field">
                <span>Woke up</span>
                <input
                  type="time"
                  className="input"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                />
              </label>
            </div>
            <div className="sleep-gate-duration mono">
              {min != null ? durationLabel(min) : "—"}
            </div>

            <div className="sleep-gate-quality" role="radiogroup" aria-label="How it felt">
              {QUALITIES.map((q) => (
                <button
                  key={q}
                  role="radio"
                  aria-checked={quality === q}
                  className={"sleep-q" + (quality === q ? " on" : "")}
                  onClick={() => setQuality(q)}
                >
                  <span className="sleep-q-dots">
                    {Array.from({ length: q }, (_, i) => (
                      <span key={i} className="sleep-q-dot" />
                    ))}
                  </span>
                  {QUALITY_LABELS[q]}
                </button>
              ))}
            </div>

            <input
              className="input sleep-gate-note"
              placeholder="Anything worth noting? (optional)"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />

            <div className="sleep-gate-actions">
              <button className="btn primary" onClick={save} disabled={min == null}>
                <Icon.Check width={14} height={14} /> Save
              </button>
              <button className="sleep-gate-skip" onClick={onSkip}>
                {manual ? "Cancel" : "Skip today"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
