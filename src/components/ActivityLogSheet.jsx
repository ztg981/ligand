import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons.jsx";
import {
  ACTIVITY_CATEGORIES,
  DURATION_PRESETS,
  FEELS,
  categoryOf,
  fmtMinutes,
} from "../lib/activities.js";
import { todayKey } from "../lib/model.js";

/* ActivityLogSheet — "what did you just do?" as a two-tap flow.

   Step 1 is a grid of big emoji tiles (pick what kind of time it was);
   step 2 appears underneath: tappable name chips, big duration buttons,
   emoji feels, one sticky Log button. Typing is always OPTIONAL — category
   alone is a valid log, so the fastest path is tile → Log. The fiddly
   details (exact end time, a note) hide behind small links.

   Sports carry a "counts as a workout" toggle; the parent mirrors those
   into a linked cardio session (see App.handleSaveActivity). */

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ActivityLogSheet({
  open,
  onClose,
  isMobile = false,
  onSave, // (fields, { asWorkout }) => void
  initialCategory = null,
  dateKey = null, // log onto a specific (possibly past) day; null = today
  goals = [], // for the focus-category "which goal?" chooser
}) {
  const [category, setCategory] = useState(initialCategory);
  const [title, setTitle] = useState("");
  const [typing, setTyping] = useState(false);
  const [durationMin, setDurationMin] = useState(30);
  const [customDur, setCustomDur] = useState("");
  const [endTime, setEndTime] = useState(nowHHMM);
  const [showWhen, setShowWhen] = useState(false);
  const [feel, setFeel] = useState(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [asWorkout, setAsWorkout] = useState(true);
  const [focusGoalId, setFocusGoalId] = useState(null); // work/study → credit a goal
  const [saved, setSaved] = useState(false);
  const typeRef = useRef(null);
  const scrimRef = useRef(null);
  const closeTimer = useRef(null);

  const cat = category ? categoryOf(category) : null;
  const isToday = !dateKey || dateKey === todayKey();

  // Keep the mobile sheet above the soft keyboard (visual-viewport pinning).
  useEffect(() => {
    if (!open || !isMobile) return undefined;
    const vv = window.visualViewport;
    const scrim = scrimRef.current;
    if (!vv || !scrim) return undefined;
    const apply = () => {
      scrim.style.top = `${vv.offsetTop}px`;
      scrim.style.height = `${vv.height}px`;
      scrim.style.bottom = "auto";
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [open, isMobile]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  if (!open) return null;

  const effectiveDuration = customDur.trim()
    ? Math.max(0, Math.round(Number(customDur))) || null
    : durationMin;

  const save = () => {
    if (!cat) return;
    onSave?.(
      {
        title: title.trim() || cat.name,
        category: cat.id,
        date: dateKey || todayKey(),
        endTime: endTime || nowHHMM(),
        durationMin: effectiveDuration,
        feel,
        note: note.trim(),
        goalId: cat.id === "focus" ? focusGoalId : null,
      },
      { asWorkout: cat.id === "sport" && asWorkout }
    );
    setSaved(true);
    closeTimer.current = setTimeout(onClose, 850);
  };

  const pickCategory = (id) => {
    setCategory((cur) => (cur === id ? null : id));
    setTitle("");
    setTyping(false);
  };

  const body = saved ? (
    <div className="quick-note-saved">
      <Icon.Check width={20} height={20} /> Logged
    </div>
  ) : (
    <>
      <div className="row between" style={{ alignItems: "center" }}>
        <div className="sheet-title">
          {isToday ? "What did you just do?" : "Add to this day"}
        </div>
        <button type="button" className="iconbtn" title="Close" onClick={onClose}>
          <Icon.Close />
        </button>
      </div>

      {/* Step 1 — big tiles. Tapping one is already a complete answer. */}
      <div className="actlog-grid" role="group" aria-label="Kind of activity">
        {ACTIVITY_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={"actlog-tile" + (category === c.id ? " on" : "")}
            style={{ "--cat": c.color }}
            aria-pressed={category === c.id}
            onClick={() => pickCategory(c.id)}
          >
            <span className="actlog-tile-emoji" aria-hidden="true">{c.emoji}</span>
            <span className="actlog-tile-name">{c.name}</span>
          </button>
        ))}
      </div>

      {/* Step 2 — details, only after a tile is chosen. */}
      {cat && (
        <div className="actlog-details">
          <div className="actlog-picks">
              {cat.picks.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={"actlog-pick" + (title === p ? " on" : "")}
                  onClick={() => {
                    setTitle((t) => (t === p ? "" : p));
                    setTyping(false);
                  }}
                >
                  {p}
                </button>
              ))}
              {typing ? (
                <input
                  ref={typeRef}
                  className="input actlog-type"
                  placeholder="What was it?"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      save();
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="actlog-pick typeit"
                  onClick={() => setTyping(true)}
                >
                  <Icon.Pencil width={11} height={11} /> type it…
                </button>
              )}
            </div>

          <div className="actlog-row-label">How long?</div>
          <div className="actlog-durs" role="group" aria-label="Duration">
            {DURATION_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                className={
                  "actlog-dur" + (durationMin === m && !customDur.trim() ? " on" : "")
                }
                aria-pressed={durationMin === m && !customDur.trim()}
                onClick={() => {
                  setCustomDur("");
                  setDurationMin(m);
                }}
              >
                {fmtMinutes(m)}
              </button>
            ))}
            <input
              className="input actlog-dur-custom"
              type="number"
              min="1"
              max="960"
              inputMode="numeric"
              placeholder="min"
              value={customDur}
              onChange={(e) => setCustomDur(e.target.value)}
              aria-label="Custom duration in minutes"
            />
          </div>

          <div className="actlog-row-label">How'd it leave you? <span>(optional)</span></div>
          <div className="actlog-feels" role="group" aria-label="How it left you">
            {FEELS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={"actlog-feel" + (feel === f.value ? " on" : "")}
                aria-pressed={feel === f.value}
                onClick={() => setFeel((cur) => (cur === f.value ? null : f.value))}
                title={f.label}
              >
                <span className="actlog-feel-emoji" aria-hidden="true">{f.emoji}</span>
                <span className="actlog-feel-lbl">{f.label}</span>
              </button>
            ))}
          </div>

          {cat.id === "sport" && (
            <label className="dp-check actlog-asworkout">
              <input
                type="checkbox"
                checked={asWorkout}
                onChange={(e) => setAsWorkout(e.target.checked)}
              />
              Counts as a workout
            </label>
          )}

          {/* Work/study can credit a goal — this time counts toward the hours
             worked on it. Fully optional; "No goal" is the default. */}
          {cat.id === "focus" && goals.length > 0 && (
            <>
              <div className="actlog-row-label">Toward a goal? <span>(optional)</span></div>
              <div className="actlog-goals" role="group" aria-label="Credit a goal">
                {goals.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={"actlog-goal" + (focusGoalId === g.id ? " on" : "")}
                    aria-pressed={focusGoalId === g.id}
                    onClick={() => setFocusGoalId((cur) => (cur === g.id ? null : g.id))}
                  >
                    <span
                      className="actlog-goal-dot"
                      style={{ background: g.color || "var(--accent)" }}
                    />
                    {g.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* The fiddly bits stay behind small links. */}
          <div className="actlog-links">
            {showWhen ? (
              <span className="actlog-when">
                Ended at
                <input
                  className="input actlog-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  aria-label="When the activity ended"
                />
              </span>
            ) : (
              <button type="button" className="actlog-link" onClick={() => setShowWhen(true)}>
                {isToday ? "Ended earlier?" : "Set a time"}
              </button>
            )}
            {showNote ? null : (
              <button type="button" className="actlog-link" onClick={() => setShowNote(true)}>
                + note
              </button>
            )}
          </div>
          {showNote && (
            <input
              className="input"
              placeholder="Anything worth remembering?"
              value={note}
              autoFocus
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              style={{ marginTop: 8 }}
            />
          )}
        </div>
      )}

      <button
        type="button"
        className="btn primary quick-note-save actlog-save"
        onClick={save}
        disabled={!cat}
        style={{ opacity: cat ? 1 : 0.45 }}
      >
        <Icon.Check width={15} height={15} />
        {cat
          ? `Log ${title.trim() || cat.name}${effectiveDuration ? ` · ${fmtMinutes(effectiveDuration)}` : ""}`
          : "Pick one above"}
      </button>
    </>
  );

  return createPortal(
    isMobile ? (
      <div
        className="sheet-scrim quick-note-scrim"
        role="presentation"
        ref={scrimRef}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="bottom-sheet quick-note-sheet actlog-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Log an activity"
        >
          <div className="sheet-drag-area">
            <span className="sheet-handle" />
          </div>
          <div className="sheet-body quick-note-body">{body}</div>
        </div>
      </div>
    ) : (
      <div className="scrim" role="presentation" onMouseDown={onClose}>
        <div
          className="modal qa-modal actlog-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Log an activity"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="qa-modal-body">{body}</div>
        </div>
      </div>
    ),
    document.body
  );
}
