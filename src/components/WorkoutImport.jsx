import { useState } from "react";
import { Icon } from "./Icons.jsx";
import { importWorkout } from "../lib/aiApi.js";
import {
  matchLibraryExercise,
  parseWorkoutText,
} from "../lib/workoutParser.js";

/* WorkoutImport — paste messy gym notes, get a structured session.

   Primary path: Gemini (via the gemini-insights Edge Function) parses the
   notes. When the AI is unavailable (overloaded upstream, offline, signed
   out) the user still gets somewhere: a deterministic Quick parse handles
   the common shorthand ("5x5 bench", "bench 3 sets of 8", "135x8") without
   pretending to be AI. Errors state the real cause and keep the notes so
   nothing typed is ever lost. */

// Map a parsed exercise onto the plan shape WorkoutPreview/logger expect.
// Library matching lives in workoutParser (shared with the quick-add path).
function toPlan(ex) {
  const lib = matchLibraryExercise(ex.name);
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
    restSec: ex.restSec != null ? Number(ex.restSec) : null,
    notes: ex.notes || null,
  };
}

const EXAMPLE = "chest day - bench heavy 4 sets, some incline dumbbell, flyes, finish with dips";

export default function WorkoutImport({ onImported, compact = false }) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorKind, setErrorKind] = useState("");

  const finish = (exercises, source) => {
    const plan = exercises.map(toPlan);
    onImported?.(plan, { source });
    setNotes("");
    setError("");
    setErrorKind("");
  };

  const runAi = async () => {
    setError("");
    setErrorKind("");
    setLoading(true);
    try {
      const res = await importWorkout(notes);
      if (!res.ok) {
        setError(res.error || "Import failed.");
        setErrorKind(res.kind || "unknown");
        return;
      }
      finish(res.exercises, "ai");
    } finally {
      setLoading(false);
    }
  };

  // Deterministic no-AI fallback — clearly labelled, never pretends to be AI.
  const runQuickParse = () => {
    const { exercises } = parseWorkoutText(notes);
    if (!exercises.length) {
      setError(
        "Quick parse couldn't read those notes. Try lines like \"bench 3x8\" or \"squat 3 sets of 5\"."
      );
      setErrorKind("quick-parse");
      return;
    }
    finish(exercises, "quick-parse");
  };

  // Offer Quick parse prominently when the AI path is the thing that failed.
  const showQuickParseRescue =
    errorKind && errorKind !== "empty" && errorKind !== "quick-parse";

  return (
    <div className="card wk-import">
      <div className="card-head">
        <div className="card-title"><Icon.Spark /> Import from notes</div>
      </div>
      {!compact && (
        <p className="wk-import-sub">
          Paste rough notes and AI will turn them into a structured session you can
          review, edit, schedule, or start.
        </p>
      )}
      <textarea
        className="input wk-import-box"
        placeholder={`e.g. "${EXAMPLE}"`}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
      />
      {error && (
        <div className="wk-import-err" role="alert">
          {error}
          {showQuickParseRescue && (
            <div className="wk-import-err-actions">
              <button className="btn ghost sm" onClick={runAi} disabled={loading}>
                <Icon.Reset width={13} height={13} /> Retry AI
              </button>
              <button className="btn sm" onClick={runQuickParse} disabled={loading}>
                Quick parse instead
              </button>
            </div>
          )}
        </div>
      )}
      <div className="wk-import-actions">
        <button
          className="btn ghost sm"
          onClick={() => setNotes(EXAMPLE)}
          disabled={loading}
        >
          Try an example
        </button>
        <button
          className="btn ghost sm"
          onClick={runQuickParse}
          disabled={loading || !notes.trim()}
          title="Deterministic parse for simple formats — works offline, no AI"
        >
          Quick parse
        </button>
        <button
          className="btn primary sm"
          onClick={runAi}
          disabled={loading || !notes.trim()}
        >
          {loading ? "Parsing…" : (<><Icon.Spark width={14} height={14} /> Import with AI</>)}
        </button>
      </div>
    </div>
  );
}
