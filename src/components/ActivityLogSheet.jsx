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

/* ActivityLogSheet — "what did you just do?" in under five seconds.

   The universal activity logger: sports, games, scrolling, chores, people
   time, rest. One title field, category chips that carry one-tap quick
   picks, duration presets, an optional "how did it leave you?" row, and an
   optional note. Opens as a bottom sheet on the phone and a centered modal
   on desktop (same portal pattern as QuickAdd).

   Sports can also count as workouts — the toggle hands that decision to the
   parent via onSave(fields, { asWorkout }), which writes the workout record
   and links the two so nothing ever shows twice. */

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
}) {
  const [category, setCategory] = useState(initialCategory || "sport");
  const [title, setTitle] = useState("");
  const [durationMin, setDurationMin] = useState(null);
  const [customDur, setCustomDur] = useState("");
  const [endTime, setEndTime] = useState(nowHHMM);
  const [feel, setFeel] = useState(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [asWorkout, setAsWorkout] = useState(true);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef(null);
  const scrimRef = useRef(null);
  const closeTimer = useRef(null);

  const cat = categoryOf(category);
  const isToday = !dateKey || dateKey === todayKey();

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open]);

  // Keep the mobile sheet above the soft keyboard (same visual-viewport
  // pinning QuickAdd uses).
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
    const t = title.trim() || cat.name;
    onSave?.(
      {
        title: t,
        category,
        date: dateKey || todayKey(),
        endTime: endTime || nowHHMM(),
        durationMin: effectiveDuration,
        feel,
        note: note.trim(),
      },
      { asWorkout: category === "sport" && asWorkout }
    );
    setSaved(true);
    closeTimer.current = setTimeout(onClose, 900);
  };

  const pickDuration = (min) => {
    setCustomDur("");
    setDurationMin((cur) => (cur === min ? null : min));
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

      {/* Category chips */}
      <div className="actlog-cats" role="group" aria-label="Kind of activity">
        {ACTIVITY_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={"actlog-cat" + (category === c.id ? " on" : "")}
            style={{ "--cat": c.color }}
            aria-pressed={category === c.id}
            onClick={() => {
              setCategory(c.id);
              setTimeout(() => inputRef.current?.focus(), 40);
            }}
          >
            <span className="actlog-cat-dot" /> {c.name}
          </button>
        ))}
      </div>

      <input
        ref={inputRef}
        className="input actlog-title"
        placeholder={
          cat.picks.length
            ? `e.g. ${cat.picks.slice(0, 3).join(", ").toLowerCase()}…`
            : "What was it?"
        }
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 80))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
      />

      {/* One-tap quick picks for the chosen category */}
      {cat.picks.length > 0 && (
        <div className="actlog-picks" aria-label="Quick picks">
          {cat.picks.map((p) => (
            <button
              key={p}
              type="button"
              className={"actlog-pick" + (title === p ? " on" : "")}
              onClick={() => setTitle((t) => (t === p ? "" : p))}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Duration presets + custom */}
      <div className="actlog-row-label">How long? <span>(optional)</span></div>
      <div className="actlog-durs" role="group" aria-label="Duration">
        {DURATION_PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            className={
              "actlog-dur" + (durationMin === m && !customDur.trim() ? " on" : "")
            }
            aria-pressed={durationMin === m && !customDur.trim()}
            onClick={() => pickDuration(m)}
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

      {/* When it ended */}
      <div className="actlog-when">
        <span className="actlog-row-label" style={{ margin: 0 }}>Ended at</span>
        <input
          className="input actlog-time"
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          aria-label="When the activity ended"
        />
        {isToday && endTime !== nowHHMM() && (
          <button type="button" className="btn ghost sm" onClick={() => setEndTime(nowHHMM())}>
            Now
          </button>
        )}
      </div>

      {/* How it left you — information about the activity, never a grade. */}
      <div className="actlog-row-label">How did it leave you? <span>(optional)</span></div>
      <div className="actlog-feels" role="group" aria-label="How it left you">
        {FEELS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={"actlog-feel" + (feel === f.value ? " on" : "")}
            aria-pressed={feel === f.value}
            onClick={() => setFeel((cur) => (cur === f.value ? null : f.value))}
          >
            <span aria-hidden="true">{f.emoji}</span> {f.label}
          </button>
        ))}
      </div>

      {category === "sport" && (
        <label className="dp-check actlog-asworkout">
          <input
            type="checkbox"
            checked={asWorkout}
            onChange={(e) => setAsWorkout(e.target.checked)}
          />
          Count it as a workout (adds to your training week)
        </label>
      )}

      {showNote ? (
        <input
          className="input"
          placeholder="Anything worth remembering? (optional)"
          value={note}
          autoFocus
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
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
          className="actlog-addnote"
          onClick={() => setShowNote(true)}
        >
          <Icon.Pencil width={12} height={12} /> Add a note
        </button>
      )}

      <button type="button" className="btn primary quick-note-save" onClick={save}>
        <Icon.Check width={14} height={14} /> Log it
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
