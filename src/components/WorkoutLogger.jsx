import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons.jsx";
import { ding } from "../lib/uiSounds.js";
import {
  createWorkout,
  createWorkoutExercise,
  createSet,
  workoutVolume,
  completedSetCount,
  exercisePR,
  lastExercisePerformance,
  estimateWorkoutMinutes,
  platesFor,
  warmupRamp,
} from "../lib/model.js";
import {
  searchExercises,
  findExercise,
  MUSCLE_LABEL,
  exerciseKind,
  exerciseMET,
} from "../lib/exercises.js";
import {
  INTENSITIES,
  estimateCalories,
  formatPace,
  formatSpeed,
  formatDistance,
  distanceUnit as distUnitFor,
  workoutCalories,
} from "../lib/activityMetrics.js";
import { useIsMobile } from "../hooks/useIsMobile.js";

/* WorkoutLogger - the in-gym flow. A full-screen layer (not a centered modal)
   so it works one-handed on a phone at the rack. Add exercises from the
   library, log sets (reps × weight, or a duration for cardio), tap a set to
   mark it complete, then Finish to save a session + see a summary.

   Stage B: manual free logging + set completion + finish summary.
   (Stage C layers the auto rest timer and PR celebration on top of this.) */

function fmtElapsed(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// "Last time" reference line for an exercise, from its most recent prior set.
function fmtLast(p, unit) {
  if (!p) return null;
  if (p.durationSec) return `Last time: ${Math.round(p.durationSec / 60)} min`;
  if (p.weight != null) return `Last time: ${p.weight} ${unit} × ${p.reps ?? "-"}`;
  return null;
}

// A short "focus" recap from the muscle groups a session covers.
function focusLabel(exercises) {
  const groups = [...new Set((exercises || []).map((e) => e.muscleGroup))].filter(
    (g) => g && g !== "other"
  );
  if (!groups.length) return "";
  const labels = groups.map((g) => (MUSCLE_LABEL[g] || g).toLowerCase());
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

// A compact mm:ss duration editor (two steppers) shared by every activity
// kind. Stores whole seconds; shows minutes + seconds so "42:30" is exact.
function DurationEditor({ durationSec, onChange, size = "md" }) {
  const total = Math.max(0, Math.round(durationSec || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  const setMin = (m) => onChange(Math.max(0, m) * 60 + secs);
  const setSec = (s) => {
    // Wrap 60→next minute / -1→borrow a minute for natural stepping.
    let m = mins;
    let sec = s;
    if (sec >= 60) { m += Math.floor(sec / 60); sec %= 60; }
    if (sec < 0) { m = Math.max(0, m - 1); sec = 55; }
    onChange(m * 60 + sec);
  };
  return (
    <div className={"wl-dur wl-dur-" + size}>
      <div className="wl-dur-field">
        <button type="button" onClick={() => setMin(mins - 1)} aria-label="One less minute">−</button>
        <input
          className="wl-dur-input"
          type="number"
          inputMode="numeric"
          min="0"
          value={mins || ""}
          placeholder="0"
          onChange={(e) => setMin(Number(e.target.value) || 0)}
        />
        <button type="button" onClick={() => setMin(mins + 1)} aria-label="One more minute">+</button>
        <span className="wl-dur-unit">min</span>
      </div>
      <div className="wl-dur-field">
        <button type="button" onClick={() => setSec(secs - 5)} aria-label="Five fewer seconds">−</button>
        <input
          className="wl-dur-input"
          type="number"
          inputMode="numeric"
          min="0"
          max="59"
          value={secs ? String(secs).padStart(2, "0") : ""}
          placeholder="00"
          onChange={(e) => setSec(Number(e.target.value) || 0)}
        />
        <button type="button" onClick={() => setSec(secs + 5)} aria-label="Five more seconds">+</button>
        <span className="wl-dur-unit">sec</span>
      </div>
    </div>
  );
}

// The "how hard did it feel?" selector — the single most useful field a sport
// or machine session can carry, and what drives the calorie estimate.
function IntensityChips({ value, onChange }) {
  return (
    <div className="wl-intensity" role="group" aria-label="Intensity">
      {INTENSITIES.map((i) => (
        <button
          key={i.id}
          type="button"
          className={"wl-int-chip" + (value === i.id ? " on" : "")}
          onClick={() => onChange(i.id)}
          title={i.hint}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

// Derived-metric readout (pace/speed/calories) — the payoff that makes an
// activity feel tracked rather than merely noted.
function ActivityStatline({ kind, set, met, profile, speed = false }) {
  const unit = distUnitFor(profile);
  const stats = [];
  if (kind === "distance") {
    const measure = speed
      ? formatSpeed(set.distance, set.durationSec, profile)
      : formatPace(set.distance, set.durationSec, profile);
    if (measure) {
      const [v, l] = measure.split(" ");
      stats.push({ v, l: speed ? l : `/${unit}` });
    }
  }
  const kcal = estimateCalories({
    met,
    durationSec: set.durationSec,
    intensity: set.intensity,
    profile,
  });
  if (kcal) stats.push({ v: kcal, l: "kcal" });
  if (!stats.length) return null;
  return (
    <div className="wl-act-stats">
      {stats.map((s, i) => (
        <div key={i} className="wl-act-stat">
          <span className="wl-act-stat-v">{s.v}</span>
          <span className="wl-act-stat-l">{s.l}</span>
        </div>
      ))}
    </div>
  );
}

export default function WorkoutLogger({
  profile,
  goalId = null,
  initialExercises = null,
  initialType = "strength",
  priorWorkouts = [],
  workoutName = "Today's workout",
  onFinish,
  onCancel,
  onSaveTemplate, // (name, exercises) => void
  onSnapshot, // (snapshot|null) => void — persist the live session (resume support)
  resume = null, // saved snapshot to restore: { exercises, currentIdx, guidedStarted, startedAt }
}) {
  const unit = profile?.weightUnit || "lbs";
  const restStrength = profile?.restStrengthSec || 90;
  const restCardio = profile?.restCardioSec || 30;
  const isMobile = useIsMobile(768);

  // All-time best weight for an exercise coming INTO this session - the
  // baseline a completed set must beat to count as a personal record.
  const priorBestFor = (exerciseId) => exercisePR(priorWorkouts, exerciseId);
  const celebratedRef = useRef(new Set()); // exerciseIds already celebrated this session

  // Seed from a restored mid-session snapshot first, then a template/generated
  // plan, else start empty.
  const wasSeeded = Boolean(
    (resume?.exercises?.length || 0) > 0 || (initialExercises && initialExercises.length)
  );
  const [exercises, setExercises] = useState(() =>
    resume?.exercises?.length ? resume.exercises : wasSeeded ? initialExercises : []
  );
  const [showPicker, setShowPicker] = useState(!wasSeeded);
  // Session overview shown at the start of a seeded (planned) session — the
  // "here's what's ahead" briefing a trainer would give before you begin.
  // A resumed session skips it (you're mid-workout, not starting).
  const [showOverview, setShowOverview] = useState(wasSeeded && !resume);

  // Guided mode: on a phone, a seeded/planned workout runs one exercise at a
  // time (execution) instead of the full scrolling list (which stays for
  // desktop and for free logging). All data lives in the shared `exercises`
  // state, so moving between exercises never loses anything.
  const guided = isMobile && wasSeeded;
  const [guidedStarted, setGuidedStarted] = useState(Boolean(resume?.guidedStarted));
  const [currentIdx, setCurrentIdx] = useState(resume?.currentIdx || 0);
  const [showPlan, setShowPlan] = useState(false); // full-plan overlay in guided mode

  // Prior best-per-exercise, so each movement can show "Last time: 135 × 8".
  const lastPerf = (exerciseId) =>
    exerciseId ? lastExercisePerformance(priorWorkouts, exerciseId) : null;
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState(null); // set on finish
  const [tmplName, setTmplName] = useState("");
  const [tmplSaved, setTmplSaved] = useState(false);

  const startRef = useRef(resume?.startedAt || Date.now());
  const [elapsed, setElapsed] = useState(0);

  // Persist the live session (debounced) so a reload / app close never loses
  // completed sets. Cleared explicitly on finish and cancel. onSnapshot is a
  // stable setState-style setter, so it's safe in the dependency array.
  useEffect(() => {
    if (!onSnapshot || summary) return undefined;
    if (!exercises.length) return undefined; // nothing worth restoring yet
    const t = setTimeout(() => {
      onSnapshot({
        exercises,
        currentIdx,
        guidedStarted,
        startedAt: startRef.current,
        workoutName,
        savedAt: Date.now(),
      });
    }, 400);
    return () => clearTimeout(t);
  }, [exercises, currentIdx, guidedStarted, summary, workoutName, onSnapshot]);
  useEffect(() => {
    if (summary) return; // stop ticking once finished
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [summary]);

  // Rest timer: { remaining, total, name } while resting, else null.
  const [rest, setRest] = useState(null);
  useEffect(() => {
    if (!rest) return undefined;
    if (rest.remaining <= 0) {
      // Gentle buzz on phones when the rest is up; best-effort.
      try {
        navigator.vibrate?.([180, 90, 180]);
      } catch {
        /* not supported - fine */
      }
      try {
        ding();
      } catch {
        /* sound best-effort */
      }
      setRest(null);
      return undefined;
    }
    // Paused holds the countdown in place (effect stays mounted, no tick).
    if (rest.paused) return undefined;
    const t = setTimeout(
      () => setRest((r) => (r ? { ...r, remaining: r.remaining - 1 } : null)),
      1000
    );
    return () => clearTimeout(t);
  }, [rest]);

  const startRest = (exercise) => {
    // Per-exercise rest (from the plan/builder) wins over the profile default.
    const dur =
      exercise.restSec ?? (exercise.type === "cardio" ? restCardio : restStrength);
    setRest({ remaining: dur, total: dur, name: exercise.name, paused: false });
  };
  const toggleRestPause = () =>
    setRest((r) => (r ? { ...r, paused: !r.paused } : null));
  const adjustRest = (delta) =>
    setRest((r) =>
      r ? { ...r, remaining: Math.max(0, r.remaining + delta), total: r.total + delta } : null
    );
  const skipRest = () => setRest(null);

  // PR celebration: { name, weight } when a set beats the all-time best, else null.
  const [prMoment, setPrMoment] = useState(null);

  const results = useMemo(() => searchExercises(query, 40), [query]);

  const addExercise = (libEx) => {
    const kind = exerciseKind(libEx);
    // Seed each kind with the effort it actually records: strength → an empty
    // reps×weight set; the activity kinds → a single timed effort (with a
    // sensible moderate default so the calorie estimate is live immediately).
    const seedSet =
      kind === "strength"
        ? createSet({})
        : createSet({ durationSec: 0, intensity: "moderate" });
    setExercises((list) => [
      ...list,
      createWorkoutExercise({
        exerciseId: libEx.id,
        name: libEx.name,
        muscleGroup: libEx.muscleGroup,
        type: libEx.type,
        kind,
        sets: [seedSet],
      }),
    ]);
    setShowPicker(false);
    setQuery("");
  };

  const removeExercise = (exId) =>
    setExercises((list) => list.filter((e) => e.id !== exId));

  // Patch exercise-level fields (a sport's note/score, etc.).
  const patchExercise = (exId, patch) =>
    setExercises((list) =>
      list.map((e) => (e.id === exId ? { ...e, ...patch } : e))
    );

  // ---- live activity stopwatch --------------------------------------------
  // The heart of tracking a run/ride/game AS it happens: a start/pause/stop
  // clock that writes elapsed time straight onto the effort each second, so
  // pace and calories tick live and nothing is lost if the app is closed.
  // Timestamp-based (base + wall time) so it stays accurate through a
  // backgrounded tab. One activity is timed at a time.
  const [stopwatch, setStopwatch] = useState(null); // { exId, setId, base, startedAt, paused }
  const swElapsed = (sw, now) =>
    sw ? Math.max(0, Math.floor(sw.base + (sw.paused ? 0 : (now - sw.startedAt) / 1000))) : 0;

  useEffect(() => {
    if (!stopwatch || stopwatch.paused) return undefined;
    const t = setInterval(() => {
      const elapsed = Math.floor(stopwatch.base + (Date.now() - stopwatch.startedAt) / 1000);
      patchSet(stopwatch.exId, stopwatch.setId, { durationSec: elapsed });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopwatch]);

  const startStopwatch = (ex, set) => {
    setRest(null); // a run isn't a rest — don't let a lingering timer overlap
    setStopwatch({ exId: ex.id, setId: set.id, base: set.durationSec || 0, startedAt: Date.now(), paused: false });
  };
  const pauseStopwatch = () => {
    if (!stopwatch) return;
    if (stopwatch.paused) {
      setStopwatch({ ...stopwatch, startedAt: Date.now(), paused: false });
      return;
    }
    const base = swElapsed(stopwatch, Date.now());
    patchSet(stopwatch.exId, stopwatch.setId, { durationSec: base });
    setStopwatch({ ...stopwatch, base, paused: true });
  };
  // Stop the clock; `log` also marks the effort done (the "Stop & log" action).
  const stopStopwatch = (log = true) => {
    if (!stopwatch) return;
    const elapsed = swElapsed(stopwatch, Date.now());
    patchSet(
      stopwatch.exId,
      stopwatch.setId,
      log ? { durationSec: elapsed, done: true } : { durationSec: elapsed }
    );
    setStopwatch(null);
    if (log) {
      try { ding(); } catch { /* best-effort */ }
      try { navigator.vibrate?.([20, 30, 60]); } catch { /* fine */ }
    }
  };

  const addSet = (exId) =>
    setExercises((list) =>
      list.map((e) => {
        if (e.id !== exId) return e;
        // Copy the previous set's reps/weight as a sensible starting point.
        const prev = e.sets[e.sets.length - 1];
        const seed =
          e.type === "cardio"
            ? { durationSec: prev?.durationSec || 0 }
            : { reps: prev?.reps ?? null, weight: prev?.weight ?? null };
        return { ...e, sets: [...e.sets, createSet(seed)] };
      })
    );

  // Generate a progressive warm-up ramp (40/60/80% of the working weight,
  // rounded to real plates) and prepend it — the pattern Strong and Hevy made
  // standard. Working weight = the heaviest weight in play for this exercise
  // (entered this session, or last time's as the fallback).
  const addWarmupSets = (exId) => {
    const ex = exercises.find((e) => e.id === exId);
    if (!ex || ex.type === "cardio") return;
    const lp = lastPerf(ex.exerciseId);
    const working = Math.max(0, ...ex.sets.map((s) => s.weight || 0), lp?.weight || 0);
    const ramp = warmupRamp(working, unit);
    if (!ramp.length) return;
    setExercises((list) =>
      list.map((e) =>
        e.id !== exId
          ? e
          : {
              ...e,
              sets: [
                ...ramp.map((r) => createSet({ ...r, warmup: true })),
                ...e.sets,
              ],
            }
      )
    );
  };

  const removeSet = (exId, setId) =>
    setExercises((list) =>
      list.map((e) =>
        e.id !== exId
          ? e
          : { ...e, sets: e.sets.length > 1 ? e.sets.filter((s) => s.id !== setId) : e.sets }
      )
    );

  const patchSet = (exId, setId, patch) =>
    setExercises((list) =>
      list.map((e) =>
        e.id !== exId
          ? e
          : {
              ...e,
              sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
            }
      )
    );

  const toggleSetDone = (exId, setId) => {
    // Decide effects from the CURRENT snapshot (not inside the state updater —
    // functional updaters run during render, so a side effect there wouldn't
    // have happened yet by the time we read it).
    const exercise = exercises.find((e) => e.id === exId);
    const set = exercise?.sets.find((s) => s.id === setId);
    if (!exercise || !set) return;
    const willBeDone = !set.done;

    setExercises((list) =>
      list.map((e) =>
        e.id !== exId
          ? e
          : {
              ...e,
              sets: e.sets.map((s) =>
                s.id === setId ? { ...s, done: willBeDone } : s
              ),
            }
      )
    );

    if (!willBeDone) return; // un-completing a set: no timer, no PR

    // Rest countdowns are a strength-training thing — you don't "rest 90s"
    // after logging a run or a pickup game. Only ramp the clock for lifts.
    if (exerciseKind(exercise) === "strength") startRest(exercise);

    // Personal record: a strength set that beats the all-time best weight for
    // this exercise, celebrated at most once per exercise per session.
    if (
      exercise.type !== "cardio" &&
      exercise.exerciseId &&
      !set.warmup && // ramping up isn't a record
      set.weight != null &&
      set.weight > 0 &&
      !celebratedRef.current.has(exercise.exerciseId)
    ) {
      const best = priorBestFor(exercise.exerciseId);
      if (!best || set.weight > best.weight) {
        celebratedRef.current.add(exercise.exerciseId);
        setPrMoment({ name: exercise.name, weight: set.weight });
      }
    }
  };

  const anyCompleted = exercises.some((e) => e.sets.some((s) => s.done));

  // ---- guided-mode helpers -------------------------------------------------
  // Adjust the current (first not-done) set of the current exercise by +/- a
  // step, seeding from the last-session value when the field is still empty.
  const adjustCur = (field, delta) => {
    const cur = exercises[currentIdx];
    if (!cur) return;
    const idx = cur.sets.findIndex((s) => !s.done);
    if (idx < 0) return;
    const s = cur.sets[idx];
    const lp = lastPerf(cur.exerciseId);
    let base = s[field];
    if (base == null) {
      base =
        field === "weight" ? lp?.weight ?? 0 : field === "reps" ? lp?.reps ?? 8 : 0;
    }
    const next = Math.max(0, Math.round((base + delta) * 10) / 10);
    patchSet(cur.id, s.id, { [field]: next });
  };

  // Log the current set: fill any empty values (from last time), mark it done,
  // start rest, and celebrate a PR — all in one snapshot so nothing is lost.
  const guidedLogSet = () => {
    const cur = exercises[currentIdx];
    if (!cur) return;
    const idx = cur.sets.findIndex((s) => !s.done);
    if (idx < 0) return;
    const s = cur.sets[idx];
    const lp = lastPerf(cur.exerciseId);
    const isCardio = cur.type === "cardio";
    const weight = isCardio ? null : s.weight ?? lp?.weight ?? 0;
    const reps = isCardio ? null : s.reps ?? lp?.reps ?? 8;
    setExercises((list) =>
      list.map((e) =>
        e.id !== cur.id
          ? e
          : {
              ...e,
              sets: e.sets.map((x, xi) => {
                if (x.id === s.id) {
                  return isCardio ? { ...x, done: true } : { ...x, weight, reps, done: true };
                }
                // Carry this set's numbers forward to later, not-yet-logged sets
                // (standard gym-logger behavior: your adjustment sticks) — but
                // only between WORKING sets. Warm-up ramp steps each have their
                // own prescribed weight (40/60/80%), so carrying values into or
                // out of them would flatten the ramp.
                if (!isCardio && xi > idx && !x.done && !s.warmup && !x.warmup)
                  return { ...x, weight, reps };
                return x;
              }),
            }
      )
    );
    // Rest countdown is for lifts only — not after a run or a game.
    if (!isCardio) startRest(cur);
    if (
      !isCardio &&
      cur.exerciseId &&
      !s.warmup && // ramping up isn't a record
      weight > 0 &&
      !celebratedRef.current.has(cur.exerciseId)
    ) {
      const best = priorBestFor(cur.exerciseId);
      if (!best || weight > best.weight) {
        celebratedRef.current.add(cur.exerciseId);
        setPrMoment({ name: cur.name, weight });
      }
    }
  };

  const goToExercise = (i) => {
    setRest(null); // moving exercises cancels any running rest
    setCurrentIdx(Math.max(0, Math.min(exercises.length - 1, i)));
    setShowPlan(false);
  };

  const finish = () => {
    const wallClock = Math.floor((Date.now() - startRef.current) / 1000);
    // If a stopwatch is still running when they finish, capture its time and
    // count that effort as done rather than dropping it.
    let source = exercises;
    if (stopwatch) {
      const elapsed = swElapsed(stopwatch, Date.now());
      source = exercises.map((e) =>
        e.id !== stopwatch.exId
          ? e
          : {
              ...e,
              sets: e.sets.map((s) =>
                s.id === stopwatch.setId ? { ...s, durationSec: elapsed, done: true } : s
              ),
            }
      );
      setStopwatch(null);
    }
    // Keep only exercises that had at least one completed set.
    const kept = source
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) }))
      .filter((e) => e.sets.length > 0);
    // Activities are usually logged after the fact (you don't hold the app for
    // your whole run), so the wall-clock the logger was open understates them.
    // Take the longer of wall-clock and the time actually logged in activity
    // efforts, so a 45-min game reads as 45 min, not the 2 min of tapping.
    const loggedActivitySec = kept.reduce((n, e) => {
      if (exerciseKind(e) === "strength") return n;
      return n + e.sets.reduce((m, s) => m + (s.durationSec || 0), 0);
    }, 0);
    const durationSec = Math.max(wallClock, loggedActivitySec);
    const types = new Set(kept.map((e) => e.type));
    const type = types.size > 1 ? "mixed" : [...types][0] || initialType;
    const workout = createWorkout({
      type,
      exercises: kept,
      durationSec,
      goalId,
    });
    // Activity roll-up: distance covered, calories, and whether this session was
    // mostly lifting or mostly moving — so the summary can lead with the right
    // numbers (a run gets pace/kcal, a lift gets volume/PRs).
    const strengthEx = kept.filter((e) => exerciseKind(e) === "strength");
    const activityEx = kept.filter((e) => exerciseKind(e) !== "strength");
    let distanceTotal = 0;
    kept.forEach((e) => {
      if (exerciseKind(e) === "distance")
        e.sets.forEach((s) => (distanceTotal += s.distance || 0));
    });
    setSummary({
      workout,
      volume: workoutVolume(workout),
      sets: completedSetCount(workout),
      durationSec,
      focus: focusLabel(kept),
      calories: workoutCalories(workout, profile),
      distance: distanceTotal > 0 ? Math.round(distanceTotal * 100) / 100 : null,
      activityLed: activityEx.length > 0 && strengthEx.length === 0,
    });
    try { ding(); } catch { /* best-effort */ }
    try { navigator.vibrate?.([30, 40, 120]); } catch { /* fine */ }
    onSnapshot?.(null); // the session is over — clear the resume snapshot
    onFinish?.(workout);
  };

  // "What's coming next" during rest — a specific set within the exercise, or
  // the next exercise, when in guided mode; the exercise name otherwise.
  let restNextLabel = rest ? `Next up: ${rest.name}` : "";
  if (guided && rest) {
    const cur = exercises[currentIdx];
    const nextSetIdx = cur ? cur.sets.findIndex((s) => !s.done) : -1;
    if (nextSetIdx > -1) {
      restNextLabel = `Next: set ${nextSetIdx + 1} of ${cur.sets.length}`;
    } else {
      const nextEx = exercises[currentIdx + 1];
      restNextLabel = nextEx ? `Next: ${nextEx.name}` : "Last set, finish strong";
    }
  }

  // Shared overlays (rest timer + PR celebration) rendered in both list and
  // guided modes so their behavior can't drift.
  const restOverlay = rest && (
    <div className="wl-rest" role="status" aria-live="polite">
      <div
        className="wl-rest-bar"
        style={{ width: `${(rest.remaining / Math.max(1, rest.total)) * 100}%` }}
        aria-hidden="true"
      />
      <div className="wl-rest-inner">
        <div className={"wl-rest-ring" + (rest.paused ? " paused" : "")}>
          <svg viewBox="0 0 60 60" aria-hidden="true">
            <circle className="wl-rest-ring-track" cx="30" cy="30" r="26" />
            <circle
              className="wl-rest-ring-fill"
              cx="30"
              cy="30"
              r="26"
              style={{
                strokeDasharray: 2 * Math.PI * 26,
                strokeDashoffset:
                  2 * Math.PI * 26 * (1 - rest.remaining / Math.max(1, rest.total)),
              }}
            />
          </svg>
          <span className="wl-rest-count mono">{fmtElapsed(rest.remaining)}</span>
        </div>
        <div className="wl-rest-mid">
          <span className="wl-rest-lbl">{rest.paused ? "Paused" : "Rest"}</span>
          <span className="wl-rest-ex">{restNextLabel}</span>
        </div>
        <div className="wl-rest-actions">
          <button className="wl-rest-adj" onClick={() => adjustRest(-15)} title="Subtract 15 seconds">
            −15
          </button>
          <button
            className="wl-rest-pause"
            onClick={toggleRestPause}
            title={rest.paused ? "Resume" : "Pause"}
          >
            {rest.paused ? <Icon.Play /> : <Icon.Pause />}
          </button>
          <button className="wl-rest-adj" onClick={() => adjustRest(15)} title="Add 15 seconds">
            +15
          </button>
          <button className="wl-rest-skip" onClick={skipRest}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );

  const prOverlay = prMoment && (
    <div
      className="wl-pr-scrim"
      role="dialog"
      aria-modal="true"
      onClick={() => setPrMoment(null)}
    >
      <div className="wl-pr-card" onClick={(e) => e.stopPropagation()}>
        <div className="wl-pr-ic"><Icon.Trophy /></div>
        <div className="wl-pr-eyebrow">New personal record</div>
        <div className="wl-pr-weight">
          {prMoment.weight}<span className="wl-pr-unit">{unit}</span>
        </div>
        <div className="wl-pr-ex">{prMoment.name}</div>
        <button className="btn primary wl-pr-btn" onClick={() => setPrMoment(null)} autoFocus>
          Let's go
        </button>
      </div>
    </div>
  );

  // ---- Finished: summary screen ----
  if (summary) {
    return createPortal(
      <div className="workout-logger" role="dialog" aria-modal="true">
        <div className="wl-summary">
          <div className="wl-summary-ic wl-summary-cele"><Icon.Check /></div>
          <h2 className="wl-summary-title">
            {summary.activityLed ? "Nice work" : "Workout complete"}
          </h2>
          <p className="wl-summary-cheer">
            {summary.activityLed
              ? summary.distance
                ? `${summary.distance} ${distUnitFor(profile)} in the bank. That counts.`
                : "Moved your body today. That counts."
              : summary.focus
              ? `Strong work on ${summary.focus}. That's in the bank.`
              : "Strong work. That's in the bank."}
          </p>
          <div className="wl-summary-stats">
            <div className="wl-sum-stat">
              <span className="wl-sum-num">{fmtElapsed(summary.durationSec)}</span>
              <span className="wl-sum-lbl">duration</span>
            </div>
            {summary.activityLed ? (
              <>
                {summary.distance != null && (
                  <div className="wl-sum-stat">
                    <span className="wl-sum-num">{summary.distance}</span>
                    <span className="wl-sum-lbl">{distUnitFor(profile)}</span>
                  </div>
                )}
                <div className="wl-sum-stat">
                  <span className="wl-sum-num">{summary.calories ?? "-"}</span>
                  <span className="wl-sum-lbl">kcal</span>
                </div>
              </>
            ) : (
              <>
                <div className="wl-sum-stat">
                  <span className="wl-sum-num">{summary.sets}</span>
                  <span className="wl-sum-lbl">sets done</span>
                </div>
                <div className="wl-sum-stat">
                  <span className="wl-sum-num">
                    {summary.volume ? summary.volume.toLocaleString() : "-"}
                  </span>
                  <span className="wl-sum-lbl">{unit} lifted</span>
                </div>
              </>
            )}
          </div>
          <div className="wl-summary-exs">
            {summary.workout.exercises.map((e) => {
              const k = exerciseKind(e);
              const dur = e.sets.reduce((n, s) => n + (s.durationSec || 0), 0);
              const dist = e.sets.reduce((n, s) => n + (s.distance || 0), 0);
              let detail = `${e.sets.length} sets`;
              if (k === "distance")
                detail =
                  formatDistance(dist, profile) || `${Math.round(dur / 60)} min`;
              else if (k === "cardio" || k === "sport")
                detail = `${Math.round(dur / 60)} min`;
              return (
                <div key={e.id} className="wl-summary-ex">
                  <span>{e.name}</span>
                  <span className="wl-summary-ex-sets">{detail}</span>
                </div>
              );
            })}
          </div>

          {/* Save this session as a reusable template. */}
          {onSaveTemplate && !tmplSaved && (
            <div className="wl-tmpl-save">
              <input
                className="input"
                placeholder="Save as template (name it)…"
                value={tmplName}
                onChange={(e) => setTmplName(e.target.value)}
              />
              <button
                className="btn"
                disabled={!tmplName.trim()}
                style={{ opacity: tmplName.trim() ? 1 : 0.5, flex: "none" }}
                onClick={() => {
                  onSaveTemplate(tmplName.trim(), summary.workout.exercises);
                  setTmplSaved(true);
                }}
              >
                <Icon.Pin2 width={13} height={13} /> Save
              </button>
            </div>
          )}
          {tmplSaved && (
            <div className="wl-tmpl-saved">
              <Icon.Check width={13} height={13} /> Saved as a template
            </div>
          )}

          <button className="btn primary wl-summary-done" onClick={onCancel}>
            Done
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // ---- Guided mobile execution (pre-start briefing) ----
  if (guided && !guidedStarted) {
    const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
    return createPortal(
      <div className="workout-logger wl-guided" role="dialog" aria-modal="true">
        <div className="wl-gi">
          <button className="wl-gi-close" onClick={onCancel} title="Cancel">
            <Icon.Close width={16} height={16} />
          </button>
          <div className="wl-gi-eyebrow">Ready to train</div>
          <h1 className="wl-gi-title">{workoutName}</h1>
          <div className="wl-gi-meta">
            <div className="wl-gi-stat"><b>{exercises.length}</b><span>exercises</span></div>
            <div className="wl-gi-stat"><b>~{estimateWorkoutMinutes(exercises, restStrength)}</b><span>min</span></div>
            <div className="wl-gi-stat"><b>{totalSets}</b><span>sets</span></div>
          </div>
          {focusLabel(exercises) && (
            <div className="wl-gi-focus">Focus: {focusLabel(exercises)}</div>
          )}
          <div className="wl-gi-list">
            {exercises.map((e, i) => {
              const k = exerciseKind(e);
              return (
                <div key={e.id} className="wl-gi-ex">
                  <span className="wl-gi-ex-n">{i + 1}</span>
                  <span className="wl-gi-ex-name">{e.name}</span>
                  <span className="wl-gi-ex-sets">
                    {k === "strength"
                      ? `${e.sets.length} sets`
                      : k === "distance"
                      ? "Distance"
                      : k === "sport"
                      ? "Sport"
                      : "Cardio"}
                  </span>
                </div>
              );
            })}
          </div>
          <button className="btn primary wl-gi-start" onClick={() => setGuidedStarted(true)}>
            <Icon.Play width={16} height={16} /> Start workout
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // ---- Guided mobile execution (one exercise at a time) ----
  if (guided) {
    const cur = exercises[currentIdx];
    const curKind = exerciseKind(cur);
    const curMet = exerciseMET(cur);
    const isActivity = curKind !== "strength";
    const curSetIdx = cur ? cur.sets.findIndex((s) => !s.done) : -1;
    const exComplete = curSetIdx === -1;
    const isLastEx = currentIdx === exercises.length - 1;
    const activeSet = exComplete ? null : cur.sets[curSetIdx];
    const lp = lastPerf(cur?.exerciseId);
    const lastLine = fmtLast(lp, unit);
    const libEx = findExercise(cur?.exerciseId);
    const isBarbell = cur?.type !== "cardio" && libEx?.equipment?.includes("barbell");
    const topW = Math.max(0, ...(cur?.sets || []).map((s) => s.weight || 0), lp?.weight || 0);
    const plates = isBarbell ? platesFor(topW, unit) : null;
    const doneSets = exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
    const progressPct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;

    return createPortal(
      <div className="workout-logger wl-guided" role="dialog" aria-modal="true">
        <div className="wl-g-head">
          <button className="btn ghost sm" onClick={onCancel} title="Discard workout">
            <Icon.Close width={14} height={14} /> Cancel
          </button>
          <span className="wl-timer mono">{fmtElapsed(elapsed)}</span>
          <button className="btn ghost sm" onClick={() => setShowPlan(true)} title="View full plan">
            <Icon.Grid width={14} height={14} /> Plan
          </button>
        </div>

        <div className="wl-g-progress">
          <div className="wl-g-prog-bar">
            <div className="wl-g-prog-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="wl-g-prog-text">
            Exercise {currentIdx + 1} of {exercises.length}
          </div>
        </div>

        <div className="wl-g-body">
          <div className="wl-g-ex-name">{cur.name}</div>
          {lastLine && <div className="wl-g-lasttime">{lastLine}</div>}
          {cur.notes && <div className="wl-g-exnote">“{cur.notes}”</div>}

          {!exComplete ? (
            isActivity ? (
              /* ---- Activity execution (run / ride / cardio / sport) ---- */
              <>
                <div className="wl-g-setlabel">
                  {curKind === "sport"
                    ? "Log your session"
                    : curKind === "distance"
                    ? "Log your effort"
                    : "Log this round"}
                </div>

                {curKind === "distance" && (
                  <div className="wl-g-act-field">
                    <div className="wl-g-field-lbl">distance ({distUnitFor(profile)})</div>
                    <div className="wl-g-stepper">
                      <button onClick={() => adjustCur("distance", -0.1)} aria-label="Less distance">−</button>
                      <div className="wl-g-val">{Math.round((activeSet.distance || 0) * 10) / 10}</div>
                      <button onClick={() => adjustCur("distance", 0.1)} aria-label="More distance">+</button>
                    </div>
                  </div>
                )}

                <div className="wl-g-act-field">
                  <div className="wl-g-field-lbl">time</div>
                  {stopwatch?.exId === cur.id && stopwatch?.setId === activeSet.id ? (
                    <div className={"wl-sw wl-g-sw" + (stopwatch.paused ? " paused" : " live")}>
                      <div className="wl-sw-clock mono">{fmtElapsed(activeSet.durationSec || 0)}</div>
                      <div className="wl-sw-controls">
                        <button className="wl-sw-btn" onClick={pauseStopwatch}>
                          {stopwatch.paused ? (
                            <><Icon.Play width={14} height={14} /> Resume</>
                          ) : (
                            <><Icon.Pause width={14} height={14} /> Pause</>
                          )}
                        </button>
                        <button className="wl-sw-btn stop" onClick={() => stopStopwatch(true)}>
                          <Icon.Check width={14} height={14} /> Stop &amp; log
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        className="wl-sw-start"
                        onClick={() => startStopwatch(cur, activeSet)}
                        disabled={Boolean(stopwatch)}
                      >
                        <Icon.Play width={16} height={16} /> Start stopwatch
                      </button>
                      <div className="wl-sw-or">or enter time manually</div>
                      <DurationEditor
                        durationSec={activeSet.durationSec}
                        onChange={(secs) => patchSet(cur.id, activeSet.id, { durationSec: secs })}
                        size="lg"
                      />
                    </>
                  )}
                </div>

                {(curKind === "cardio" || curKind === "sport") && (
                  <div className="wl-g-act-field">
                    <div className="wl-g-field-lbl">intensity</div>
                    <IntensityChips
                      value={activeSet.intensity || "moderate"}
                      onChange={(v) => patchSet(cur.id, activeSet.id, { intensity: v })}
                    />
                  </div>
                )}

                <ActivityStatline
                  kind={curKind}
                  set={activeSet}
                  met={curMet}
                  profile={profile}
                  speed={cur.exerciseId === "cycling"}
                />

                {stopwatch?.exId !== cur.id && (
                  <button
                    className="btn primary wl-g-log"
                    onClick={guidedLogSet}
                    disabled={!activeSet.durationSec && !activeSet.distance}
                  >
                    <Icon.Check width={16} height={16} /> Log it
                  </button>
                )}
              </>
            ) : (
              /* ---- Strength execution (sets × reps × weight) ---- */
              <>
                {activeSet?.warmup ? (
                  <div className="wl-g-setlabel warmup">
                    <Icon.Flame width={12} height={12} /> Warm-up{" "}
                    {cur.sets.slice(0, curSetIdx + 1).filter((s) => s.warmup).length} of{" "}
                    {cur.sets.filter((s) => s.warmup).length}
                  </div>
                ) : (
                  <div className="wl-g-setlabel">
                    Set {cur.sets.slice(0, curSetIdx + 1).filter((s) => !s.warmup).length} of{" "}
                    {cur.sets.filter((s) => !s.warmup).length}
                  </div>
                )}

                {/* One-tap warm-up ramp, offered before anything is logged. */}
                {curSetIdx === 0 &&
                  !cur.sets.some((s) => s.warmup || s.done) &&
                  warmupRamp(topW, unit).length > 0 && (
                    <button
                      className="wl-g-warmup-offer"
                      onClick={() => addWarmupSets(cur.id)}
                    >
                      <Icon.Flame width={13} height={13} /> Add warm-up ramp (
                      {warmupRamp(topW, unit)
                        .map((r) => r.weight)
                        .join(" · ")}{" "}
                      {unit})
                    </button>
                  )}

                <div className="wl-g-fields">
                  <div className="wl-g-field">
                    <div className="wl-g-field-lbl">{unit}</div>
                    <div className="wl-g-stepper">
                      <button onClick={() => adjustCur("weight", -2.5)} aria-label="Less weight">−</button>
                      <div className="wl-g-val">{activeSet.weight ?? lp?.weight ?? 0}</div>
                      <button onClick={() => adjustCur("weight", 2.5)} aria-label="More weight">+</button>
                    </div>
                  </div>
                  <div className="wl-g-field">
                    <div className="wl-g-field-lbl">reps</div>
                    <div className="wl-g-stepper">
                      <button onClick={() => adjustCur("reps", -1)} aria-label="Fewer reps">−</button>
                      <div className="wl-g-val">{activeSet.reps ?? lp?.reps ?? 8}</div>
                      <button onClick={() => adjustCur("reps", 1)} aria-label="More reps">+</button>
                    </div>
                  </div>
                </div>

                {plates && topW > 0 && (
                  <div className="wl-plates wl-g-plates" title="Plates per side of the bar">
                    <span className="wl-plates-lbl">Per side</span>
                    <span className="wl-plates-list">
                      {plates.perSide.length
                        ? plates.perSide.map((p, i) => <span key={i} className="wl-plate">{p}</span>)
                        : <span className="wl-plates-bar">just the bar</span>}
                      {plates.leftover > 0 && <span className="wl-plates-extra">+{plates.leftover}</span>}
                    </span>
                  </div>
                )}

                <button className="btn primary wl-g-log" onClick={guidedLogSet}>
                  <Icon.Check width={16} height={16} />{" "}
                  {activeSet?.warmup
                    ? "Log warm-up"
                    : `Log set ${cur.sets.slice(0, curSetIdx + 1).filter((s) => !s.warmup).length}`}
                </button>
              </>
            )
          ) : (
            <div className="wl-g-complete">
              <div className="wl-g-complete-ic"><Icon.Check width={22} height={22} /></div>
              <div className="wl-g-complete-title">{cur.name} done</div>
              {!isLastEx ? (
                <>
                  <div className="wl-g-next">Next: {exercises[currentIdx + 1].name}</div>
                  <button className="btn primary wl-g-continue" onClick={() => goToExercise(currentIdx + 1)}>
                    Continue <Icon.Arrow width={15} height={15} />
                  </button>
                </>
              ) : (
                <>
                  <div className="wl-g-next">That's the last one.</div>
                  <button className="btn primary wl-g-continue" onClick={finish}>
                    <Icon.Check width={15} height={15} /> Finish workout
                  </button>
                </>
              )}
            </div>
          )}

          {/* Sets already logged for this exercise — tap one to re-open/correct. */}
          {cur.sets.some((s) => s.done) && (
            <div className="wl-g-done-sets">
              {cur.sets.map((s, i) =>
                s.done ? (
                  <button
                    key={s.id}
                    className="wl-g-done-set"
                    onClick={() => toggleSetDone(cur.id, s.id)}
                    title="Tap to re-open this set"
                  >
                    <span className="wl-g-done-n">Set {i + 1}</span>
                    <span className="wl-g-done-v">
                      {cur.type === "cardio"
                        ? `${Math.round((s.durationSec || 0) / 60)} min`
                        : `${s.weight ?? 0} ${unit} × ${s.reps ?? 0}`}
                    </span>
                    <Icon.Check width={12} height={12} />
                  </button>
                ) : null
              )}
            </div>
          )}
        </div>

        <div className="wl-g-nav">
          <button
            className="wl-g-navbtn"
            disabled={currentIdx === 0}
            onClick={() => goToExercise(currentIdx - 1)}
          >
            <Icon.Arrow width={14} height={14} className="wl-g-navback" /> Back
          </button>
          <button className="wl-g-navbtn wl-g-finish" onClick={finish} disabled={!anyCompleted}>
            Finish early
          </button>
          <button
            className="wl-g-navbtn"
            disabled={currentIdx === exercises.length - 1}
            onClick={() => goToExercise(currentIdx + 1)}
          >
            Skip <Icon.Arrow width={14} height={14} />
          </button>
        </div>

        {restOverlay}
        {prOverlay}

        {/* Full-plan overlay — review/jump without leaving guided mode. */}
        {showPlan && (
          <div className="wl-plan-scrim" onClick={() => setShowPlan(false)}>
            <div className="wl-plan-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="wl-plan-head">
                <span>Workout plan</span>
                <button className="btn ghost sm" onClick={() => setShowPlan(false)}>Close</button>
              </div>
              <div className="wl-plan-list">
                {exercises.map((e, i) => {
                  const done = e.sets.filter((s) => s.done).length;
                  return (
                    <button
                      key={e.id}
                      className={"wl-plan-item" + (i === currentIdx ? " current" : "")}
                      onClick={() => goToExercise(i)}
                    >
                      <span className="wl-plan-item-n">{i + 1}</span>
                      <span className="wl-plan-item-name">{e.name}</span>
                      <span className="wl-plan-item-sets">
                        {done}/{e.sets.length}
                        {done === e.sets.length && <Icon.Check width={12} height={12} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>,
      document.body
    );
  }

  // ---- Active logging (list — desktop & free logging) ----
  return createPortal(
    <div className="workout-logger" role="dialog" aria-modal="true">
      <div className="wl-head">
        <button className="btn ghost sm" onClick={onCancel} title="Discard workout">
          <Icon.Close width={14} height={14} /> Cancel
        </button>
        <span className="wl-timer mono">{fmtElapsed(elapsed)}</span>
        <button
          className="btn primary sm"
          onClick={finish}
          disabled={!anyCompleted}
          style={{ opacity: anyCompleted ? 1 : 0.5 }}
          title={anyCompleted ? "Finish and save" : "Complete a set first"}
        >
          <Icon.Check width={14} height={14} /> Finish
        </button>
      </div>

      <div className="wl-body">
        {/* Session overview — the pre-workout briefing for a planned session. */}
        {showOverview && exercises.length > 0 && (
          <div className="wl-overview">
            <div className="wl-overview-eyebrow">Today's session</div>
            <div className="wl-overview-line">
              {exercises.length} exercise{exercises.length === 1 ? "" : "s"}
              {" · "}~{estimateWorkoutMinutes(exercises, restStrength)} min
              {focusLabel(exercises) ? ` · focus: ${focusLabel(exercises)}` : ""}
            </div>
            <button className="wl-overview-go" onClick={() => setShowOverview(false)}>
              Let's go
            </button>
          </div>
        )}

        {exercises.length === 0 && (
          <div className="wl-empty">
            <span className="wl-empty-ic"><Icon.Dumbbell /></span>
            <div className="wl-empty-title">Add your first exercise</div>
            <div className="wl-empty-sub">Search the library below to get started.</div>
          </div>
        )}

        {exercises.map((ex) => {
          const kind = exerciseKind(ex);
          // Activity kinds (run / ride / cardio / sport) get a purpose-built
          // card — distance, time, pace, intensity, calories — never a
          // reps×weight set grid.
          if (kind !== "strength") {
            const set = ex.sets[0] || createSet({ durationSec: 0 });
            const met = exerciseMET(ex);
            const speed = ex.exerciseId === "cycling";
            const lp = lastPerf(ex.exerciseId);
            const patch = (p) => patchSet(ex.id, set.id, p);
            const timing = stopwatch?.exId === ex.id && stopwatch?.setId === set.id;
            return (
              <div
                key={ex.id}
                className={"wl-ex card wl-act" + (set.done ? " done" : "")}
                data-kind={kind}
              >
                <div className="wl-ex-head">
                  <div className="wl-ex-head-main">
                    <div className="wl-ex-name">{ex.name}</div>
                    <div className="wl-act-kind">
                      {kind === "distance"
                        ? "Distance activity"
                        : kind === "sport"
                        ? "Sport"
                        : "Cardio"}
                      {lp?.durationSec
                        ? ` · last time ${Math.round(lp.durationSec / 60)} min`
                        : ""}
                    </div>
                  </div>
                  <button
                    className="iconbtn sm"
                    onClick={() => removeExercise(ex.id)}
                    title="Remove"
                    style={{ color: "var(--ink-4)" }}
                  >
                    <Icon.Trash width={13} height={13} />
                  </button>
                </div>

                <div className="wl-act-body">
                  {kind === "distance" && (
                    <div className="wl-act-field">
                      <label className="wl-act-lbl">Distance</label>
                      <div className="wl-act-dist">
                        <input
                          className="input wl-act-dist-input"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.1"
                          placeholder="0.0"
                          value={set.distance ?? ""}
                          onChange={(e) =>
                            patch({ distance: e.target.value === "" ? null : Number(e.target.value) })
                          }
                        />
                        <span className="wl-act-dist-unit">{distUnitFor(profile)}</span>
                      </div>
                    </div>
                  )}

                  <div className="wl-act-field">
                    <label className="wl-act-lbl">Time</label>
                    {timing ? (
                      <div className={"wl-sw" + (stopwatch.paused ? " paused" : " live")}>
                        <div className="wl-sw-clock mono">{fmtElapsed(set.durationSec || 0)}</div>
                        <div className="wl-sw-controls">
                          <button className="wl-sw-btn" onClick={pauseStopwatch}>
                            {stopwatch.paused ? (
                              <><Icon.Play width={14} height={14} /> Resume</>
                            ) : (
                              <><Icon.Pause width={14} height={14} /> Pause</>
                            )}
                          </button>
                          <button className="wl-sw-btn stop" onClick={() => stopStopwatch(true)}>
                            <Icon.Check width={14} height={14} /> Stop &amp; log
                          </button>
                        </div>
                      </div>
                    ) : set.done ? (
                      <DurationEditor
                        durationSec={set.durationSec}
                        onChange={(secs) => patch({ durationSec: secs })}
                      />
                    ) : (
                      <>
                        <button
                          className="wl-sw-start"
                          onClick={() => startStopwatch(ex, set)}
                          disabled={Boolean(stopwatch)}
                          title={stopwatch ? "Another activity is being timed" : undefined}
                        >
                          <Icon.Play width={16} height={16} /> Start stopwatch
                        </button>
                        <div className="wl-sw-or">or enter time manually</div>
                        <DurationEditor
                          durationSec={set.durationSec}
                          onChange={(secs) => patch({ durationSec: secs })}
                        />
                      </>
                    )}
                  </div>

                  {(kind === "cardio" || kind === "sport") && (
                    <div className="wl-act-field">
                      <label className="wl-act-lbl">Intensity</label>
                      <IntensityChips
                        value={set.intensity || "moderate"}
                        onChange={(v) => patch({ intensity: v })}
                      />
                    </div>
                  )}

                  {kind === "sport" && (
                    <div className="wl-act-field">
                      <label className="wl-act-lbl">Notes</label>
                      <input
                        className="input"
                        placeholder="Score, who you played, how it felt…"
                        value={ex.notes || ""}
                        onChange={(e) => patchExercise(ex.id, { notes: e.target.value })}
                      />
                    </div>
                  )}

                  <ActivityStatline kind={kind} set={set} met={met} profile={profile} speed={speed} />

                  {!timing && (
                    <button
                      className={"btn wl-act-log" + (set.done ? " logged" : " primary")}
                      onClick={() => toggleSetDone(ex.id, set.id)}
                      disabled={!set.durationSec && !set.distance}
                    >
                      <Icon.Check width={15} height={15} />{" "}
                      {set.done
                        ? "Logged — tap to edit"
                        : kind === "sport"
                        ? "Log activity"
                        : kind === "distance"
                        ? "Log this effort"
                        : "Log it"}
                    </button>
                  )}
                </div>
              </div>
            );
          }
          const lp = lastPerf(ex.exerciseId);
          const lastLine = fmtLast(lp, unit);
          // Plate math for barbell lifts: what to load per side for the
          // heaviest weight in play (entered, or last-time as a starting point).
          const libEx = findExercise(ex.exerciseId);
          const isBarbell = ex.type !== "cardio" && libEx?.equipment?.includes("barbell");
          const topWeight = Math.max(
            0,
            ...ex.sets.map((s) => s.weight || 0),
            lp?.weight || 0
          );
          const plates = isBarbell ? platesFor(topWeight, unit) : null;
          // "Beat last time": did a completed set this session top the prior best?
          const bestDone = Math.max(0, ...ex.sets.filter((s) => s.done).map((s) => s.weight || 0));
          const beatLast = lp?.weight != null && bestDone > lp.weight;
          return (
          <div key={ex.id} className="wl-ex card" data-cardio={ex.type === "cardio" ? "true" : "false"}>
            <div className="wl-ex-head">
              <div className="wl-ex-head-main">
                <div className="wl-ex-name">{ex.name}</div>
                {lastLine && (
                  <div className="wl-ex-lasttime">
                    {lastLine}
                    {beatLast && <span className="wl-ex-beat">↑ up from last time</span>}
                  </div>
                )}
              </div>
              <button
                className="iconbtn sm"
                onClick={() => removeExercise(ex.id)}
                title="Remove exercise"
                style={{ color: "var(--ink-4)" }}
              >
                <Icon.Trash width={13} height={13} />
              </button>
            </div>

            <div className="wl-sets">
              <div className="wl-set-labels">
                <span className="wl-set-col-n">#</span>
                {ex.type === "cardio" ? (
                  <span className="wl-set-col">Minutes</span>
                ) : (
                  <>
                    <span className="wl-set-col">{unit}</span>
                    <span className="wl-set-col">Reps</span>
                  </>
                )}
                <span className="wl-set-col-check" />
              </div>

              {ex.sets.map((s, i) => (
                <div key={s.id} className={"wl-set" + (s.done ? " done" : "") + (s.warmup ? " warmup" : "")}>
                  <span className={"wl-set-n" + (s.warmup ? " warmup" : "")} title={s.warmup ? "Warm-up set" : undefined}>
                    {s.warmup ? "W" : ex.sets.slice(0, i + 1).filter((x) => !x.warmup).length}
                  </span>
                  {ex.type === "cardio" ? (
                    <input
                      className="input wl-set-input"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="0"
                      value={s.durationSec ? Math.round(s.durationSec / 60) : ""}
                      onChange={(e) =>
                        patchSet(ex.id, s.id, {
                          durationSec: (Number(e.target.value) || 0) * 60,
                        })
                      }
                    />
                  ) : (
                    <>
                      <input
                        className="input wl-set-input"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        placeholder={lp?.weight != null ? String(lp.weight) : "0"}
                        value={s.weight ?? ""}
                        onChange={(e) =>
                          patchSet(ex.id, s.id, {
                            weight: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                      <input
                        className="input wl-set-input"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder={lp?.reps != null ? String(lp.reps) : "0"}
                        value={s.reps ?? ""}
                        onChange={(e) =>
                          patchSet(ex.id, s.id, {
                            reps: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </>
                  )}
                  <button
                    className="wl-set-check"
                    aria-pressed={s.done}
                    onClick={() => toggleSetDone(ex.id, s.id)}
                    title={s.done ? "Mark set not done" : "Mark set complete"}
                  >
                    {s.done && <Icon.Check width={13} height={13} />}
                  </button>
                  <button
                    className="wl-set-del"
                    onClick={() => removeSet(ex.id, s.id)}
                    title="Remove set"
                  >
                    <Icon.Close width={11} height={11} />
                  </button>
                </div>
              ))}

              {plates && topWeight > 0 && (
                <div className="wl-plates" title="Plates to load on each side of the bar">
                  <span className="wl-plates-lbl">Per side</span>
                  <span className="wl-plates-list">
                    {plates.perSide.length
                      ? plates.perSide.map((p, i) => (
                          <span key={i} className="wl-plate">{p}</span>
                        ))
                      : <span className="wl-plates-bar">just the bar</span>}
                    {plates.leftover > 0 && (
                      <span className="wl-plates-extra">+{plates.leftover}</span>
                    )}
                  </span>
                </div>
              )}

              <div className="wl-set-actions-row">
                <button className="wl-add-set" onClick={() => addSet(ex.id)}>
                  <Icon.Plus width={13} height={13} /> Add set
                </button>
                {ex.type !== "cardio" &&
                  !ex.sets.some((s) => s.warmup) &&
                  warmupRamp(topWeight, unit).length > 0 && (
                    <button
                      className="wl-add-set wl-add-warmup"
                      onClick={() => addWarmupSets(ex.id)}
                      title="Add a 40/60/80% warm-up ramp before your working sets"
                    >
                      <Icon.Flame width={13} height={13} /> Warm-up
                    </button>
                  )}
              </div>
            </div>
          </div>
          );
        })}

        <button className="btn wl-add-ex" onClick={() => setShowPicker(true)}>
          <Icon.Plus width={14} height={14} /> Add exercise
        </button>
      </div>

      {/* Rest timer + PR celebration (shared with guided mode). */}
      {restOverlay}
      {prOverlay}

      {/* Exercise picker */}
      {showPicker && (
        <div className="wl-picker">
          <div className="wl-picker-head">
            <div className="notes-search" style={{ flex: 1 }}>
              <Icon.Search />
              <input
                className="notes-search-input"
                autoFocus
                placeholder="Search exercises…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              className="btn ghost sm"
              onClick={() => {
                setShowPicker(false);
                setQuery("");
              }}
            >
              Close
            </button>
          </div>
          <div className="wl-picker-list">
            {results.map((r) => (
              <button key={r.id} className="wl-picker-item" onClick={() => addExercise(r)}>
                <span className="wl-picker-name">{r.name}</span>
                <span className="wl-picker-group">{r.muscleGroup}</span>
              </button>
            ))}
            {results.length === 0 && (
              <div className="wl-picker-empty">No exercises match “{query.trim()}”.</div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

// Re-export for callers that want to resolve a library exercise by id.
export { findExercise };
