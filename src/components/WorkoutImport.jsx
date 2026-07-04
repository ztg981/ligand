import { useState } from "react";
import { Icon } from "./Icons.jsx";
import { importWorkout } from "../lib/aiApi.js";
import { EXERCISES } from "../lib/exercises.js";

/* WorkoutImport — paste messy gym notes, get a structured session.

   The classic PC-planning move: you jotted "chest day - bench heavy, some
   flyes, dips" in your phone notes or a text to a friend. Paste it here and
   Gemini turns it into a real, editable plan you can review and start. Desktop
   planning surface only; the phone is for doing the session. */

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Best-effort match of a parsed name to a library exercise, so imported
// movements get a real exerciseId (enabling PR tracking + "last time").
function matchLibrary(name) {
  const n = norm(name);
  if (!n) return null;
  let exact = EXERCISES.find((e) => norm(e.name) === n);
  if (exact) return exact;
  // Contains either direction (e.g. "incline dumbbell press" ~ "Incline Press").
  return (
    EXERCISES.find((e) => norm(e.name).includes(n) || n.includes(norm(e.name))) ||
    null
  );
}

// Map a parsed exercise onto the plan shape WorkoutPreview/logger expect.
function toPlan(ex) {
  const lib = matchLibrary(ex.name);
  const type = ex.type === "cardio" || lib?.type === "cardio" ? "cardio" : "strength";
  return {
    exerciseId: lib?.id || null,
    name: lib?.name || ex.name || "Exercise",
    muscleGroup: lib?.muscleGroup || ex.muscleGroup || "other",
    type,
    targetSets: Math.max(1, Number(ex.targetSets) || 3),
    targetReps: type === "cardio" ? null : ex.targetReps != null ? Number(ex.targetReps) : null,
    targetWeight: ex.targetWeight != null ? Number(ex.targetWeight) : null,
    targetMinutes: type === "cardio" ? Number(ex.targetMinutes) || 10 : null,
  };
}

const EXAMPLE = "chest day - bench heavy 4 sets, some incline dumbbell, flyes, finish with dips";

export default function WorkoutImport({ onImported }) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await importWorkout(notes);
      if (!res.ok) {
        setError(res.error || "Import failed.");
        return;
      }
      const plan = res.exercises.map(toPlan);
      onImported?.(plan);
      setNotes("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card wk-import">
      <div className="card-head">
        <div className="card-title"><Icon.Spark /> Import from notes</div>
      </div>
      <p className="wk-import-sub">
        Paste rough notes and AI will turn them into a structured session you can
        review and tweak before starting.
      </p>
      <textarea
        className="input wk-import-box"
        placeholder={`e.g. "${EXAMPLE}"`}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
      />
      {error && <div className="wk-import-err">{error}</div>}
      <div className="wk-import-actions">
        <button
          className="btn ghost sm"
          onClick={() => setNotes(EXAMPLE)}
          disabled={loading}
        >
          Try an example
        </button>
        <button
          className="btn primary sm"
          onClick={run}
          disabled={loading || !notes.trim()}
        >
          {loading ? "Parsing…" : (<><Icon.Spark width={14} height={14} /> Import with AI</>)}
        </button>
      </div>
    </div>
  );
}
