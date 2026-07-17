import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons.jsx";
import { enrichWithLibrary, parseWorkoutText } from "../lib/workoutParser.js";
import { parseQuickAdd } from "../lib/quickParse.js";

/* QuickAdd — ONE capture point for the things you need to write down before
   working memory drops them: a task, a note, a workout, an alarm, or jumping
   straight into a focus session. Opens as a bottom sheet on the phone and a
   compact centered card on desktop.

   Design intent (executive-function friendly):
   - One text field first; the type chips just reroute the same input.
   - Saving never navigates away except where navigation IS the action
     (workout review, focus).
   - Nothing here is a giant form; details can be edited later in place. */

const TYPES = [
  { id: "task", label: "Task", icon: <Icon.Check width={13} height={13} /> },
  { id: "activity", label: "Activity", icon: <Icon.Spark width={13} height={13} /> },
  { id: "note", label: "Note", icon: <Icon.Pencil width={13} height={13} /> },
  { id: "workout", label: "Workout", icon: <Icon.Dumbbell width={13} height={13} /> },
  { id: "alarm", label: "Alarm", icon: <Icon.Bell width={13} height={13} /> },
  { id: "focus", label: "Focus", icon: <Icon.Timer width={13} height={13} /> },
];

// Next half-hour mark — a sensible default alarm time you can still edit.
function nextHalfHour() {
  const d = new Date(Date.now() + 30 * 60000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function QuickAdd({
  open,
  onClose,
  isMobile = false,
  addTask,
  addNote,
  addAlarm,
  onWorkoutPlan, // (plan) => void — open the workout review with parsed exercises
  onStartFocus, // () => void — jump to the Pomodoro tab
  onLogActivity, // () => void — open the full activity logger
}) {
  // Fresh state every open: the parent remounts this component per open via a
  // key, so plain initial values ARE the reset (no state-sync effect needed).
  const [type, setType] = useState("task");
  const [text, setText] = useState("");
  const [alarmTime, setAlarmTime] = useState(nextHalfHour);
  const [saved, setSaved] = useState(false);
  const [hint, setHint] = useState("");
  // Natural-language tokens the user has tapped OFF (kind strings). A wrong
  // guess is one tap to undo — the token text then stays in the task.
  const [offTokens, setOffTokens] = useState([]);
  const inputRef = useRef(null);
  const scrimRef = useRef(null);
  const closeTimer = useRef(null);

  // Live parse (tasks only — notes and workouts are freeform by design).
  const parsed = useMemo(
    () => (type === "task" ? parseQuickAdd(text) : null),
    [type, text]
  );
  const activeTokens = (parsed?.tokens || []).filter(
    (tk) => !offTokens.includes(tk.kind)
  );
  const tokenOn = (kind) => activeTokens.some((tk) => tk.kind === kind);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open]);

  // Keep the mobile sheet above the soft keyboard (visual-viewport pinning,
  // same technique as the original quick-note sheet).
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

  const flashSavedAndClose = () => {
    setSaved(true);
    closeTimer.current = setTimeout(onClose, 900);
  };

  const save = () => {
    const t = text.trim();
    setHint("");
    if (type === "focus") {
      onStartFocus?.();
      onClose();
      return;
    }
    if (type === "activity") {
      // The activity logger is its own five-second flow (category chips,
      // duration, feel); hand off rather than cram it in here.
      onClose();
      onLogActivity?.();
      return;
    }
    if (type === "alarm") {
      if (!alarmTime) return;
      addAlarm?.({ time: alarmTime, label: t || "Alarm", days: [] });
      flashSavedAndClose();
      return;
    }
    if (!t) return;
    if (type === "task") {
      // Apply only the tokens still switched on: strip their text from the
      // task and set the structured fields they represent. Time tokens are
      // NOT stripped — unless the user took the alarm suggestion, "at 7am"
      // is real information that belongs in the task text.
      let taskText = t;
      for (const tk of activeTokens.filter((x) => x.kind !== "time")) {
        taskText = taskText
          .replace(tk.match, " ")
          .replace(/\s{2,}/g, " ")
          .replace(/\s+([,.!?])/g, "$1")
          .trim();
      }
      if (!taskText) taskText = t; // never save an empty task
      addTask?.({
        text: taskText,
        ...(tokenOn("urgent")
          ? { label: "Urgent" }
          : tokenOn("today")
            ? { label: "Today" }
            : {}),
        ...(tokenOn("repeat") && parsed?.repeat ? { repeat: parsed.repeat } : {}),
      });
      flashSavedAndClose();
    } else if (type === "note") {
      addNote?.({ text: t });
      flashSavedAndClose();
    } else if (type === "workout") {
      const { exercises } = parseWorkoutText(t);
      if (!exercises.length) {
        setHint('Couldn\'t read any exercises. Try lines like "bench 3x8" or "3 sets of lateral raises".');
        return;
      }
      onWorkoutPlan?.(enrichWithLibrary(exercises));
      onClose();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && type !== "workout" && type !== "note") {
      e.preventDefault();
      save();
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  };

  const multiline = type === "note" || type === "workout";
  const placeholder = {
    task: 'Try "call mom today" or "meds every day urgent"',
    note: "What's on your mind?",
    workout: 'e.g. "bench 3x8 @ 135, rest 90s, 3 sets of lateral raises"',
    alarm: "Label (optional)",
    focus: "",
  }[type];

  const body = saved ? (
    <div className="quick-note-saved">
      <Icon.Check width={20} height={20} /> Saved
    </div>
  ) : (
    <>
      <div className="row between" style={{ alignItems: "center" }}>
        <div className="sheet-title">Quick add</div>
        <button type="button" className="iconbtn" title="Close" onClick={onClose}>
          <Icon.Close />
        </button>
      </div>

      <div className="qa-types" role="tablist" aria-label="What to add">
        {TYPES.map((tp) => (
          <button
            key={tp.id}
            role="tab"
            aria-selected={type === tp.id}
            className={"qa-type" + (type === tp.id ? " active" : "")}
            onClick={() => {
              setType(tp.id);
              setHint("");
              setTimeout(() => inputRef.current?.focus(), 40);
            }}
          >
            {tp.icon} {tp.label}
          </button>
        ))}
      </div>

      {type === "focus" ? (
        <p className="qa-note">
          Jump to the Pomodoro timer and start a session. Tip: pick something
          small and just start for five minutes.
        </p>
      ) : type === "activity" ? (
        <p className="qa-note">
          Log the last thing you did — tennis, a game, a scroll, a chore.
          Anything that took time counts.
        </p>
      ) : (
        <>
          {type === "alarm" && (
            <input
              className="input qa-time"
              type="time"
              value={alarmTime}
              onChange={(e) => setAlarmTime(e.target.value)}
              aria-label="Alarm time"
            />
          )}
          {multiline ? (
            <textarea
              ref={inputRef}
              className="input quick-note-textarea"
              placeholder={placeholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
            />
          ) : (
            <input
              ref={inputRef}
              className="input qa-input"
              placeholder={placeholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
            />
          )}
          {type === "alarm" && (
            <p className="qa-note">
              Rings while Ligand is open. Repeat days and photo-scan dismissal
              live in Settings → Alarms.
            </p>
          )}

          {/* Natural-language chips: what Ligand understood from the text.
             Tap a chip to toggle it off (the words then stay in the task). */}
          {type === "task" && (parsed?.tokens?.length || 0) > 0 && (
            <div className="qa-parse-row" aria-label="Understood from your text">
              {parsed.tokens
                .filter((tk) => tk.kind !== "time")
                .map((tk) => {
                  const on = !offTokens.includes(tk.kind);
                  return (
                    <button
                      key={tk.kind}
                      type="button"
                      className={"qa-parse-chip " + tk.kind + (on ? " on" : "")}
                      aria-pressed={on}
                      title={on ? "Tap to keep this as plain text" : "Tap to re-apply"}
                      onClick={() =>
                        setOffTokens((s) =>
                          s.includes(tk.kind)
                            ? s.filter((k) => k !== tk.kind)
                            : [...s, tk.kind]
                        )
                      }
                    >
                      {tk.kind === "urgent" && <Icon.Bell width={11} height={11} />}
                      {tk.kind === "today" && <Icon.Calendar width={11} height={11} />}
                      {tk.kind === "repeat" && <Icon.Timer width={11} height={11} />}
                      {tk.display}
                      {on && <Icon.Close width={10} height={10} />}
                    </button>
                  );
                })}
              {parsed.time && (
                <button
                  type="button"
                  className="qa-parse-chip alarm-suggest"
                  title="Switch to an alarm at this time"
                  onClick={() => {
                    setAlarmTime(parsed.time);
                    setText(parsed.cleanText);
                    setType("alarm");
                    setOffTokens([]);
                  }}
                >
                  <Icon.Bell width={11} height={11} /> Set{" "}
                  {parsed.tokens.find((tk) => tk.kind === "time")?.display} alarm?
                </button>
              )}
            </div>
          )}

          {hint && <p className="qa-hint" role="alert">{hint}</p>}
        </>
      )}

      <button
        type="button"
        className="btn primary quick-note-save"
        onClick={save}
        disabled={
          type !== "focus" && type !== "alarm" && type !== "activity" && !text.trim()
        }
        style={{
          opacity:
            type === "focus" || type === "alarm" || type === "activity" || text.trim()
              ? 1
              : 0.5,
        }}
      >
        {type === "focus" ? (
          <><Icon.Timer width={14} height={14} /> Open focus timer</>
        ) : type === "activity" ? (
          <><Icon.Spark width={14} height={14} /> Open activity log</>
        ) : type === "workout" ? (
          <><Icon.Dumbbell width={14} height={14} /> Review workout</>
        ) : (
          <><Icon.Check width={14} height={14} /> Save</>
        )}
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
        <div className="bottom-sheet quick-note-sheet" role="dialog" aria-modal="true" aria-label="Quick add">
          <div className="sheet-drag-area">
            <span className="sheet-handle" />
          </div>
          <div className="sheet-body quick-note-body">{body}</div>
        </div>
      </div>
    ) : (
      <div className="scrim" role="presentation" onMouseDown={onClose}>
        <div
          className="modal qa-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Quick add"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="qa-modal-body">{body}</div>
        </div>
      </div>
    ),
    document.body
  );
}
