import { useMemo, useState } from "react";
import { Icon } from "./Icons.jsx";
import { STARTER_ROUTINES } from "../lib/routines.js";
import { MUSCLE_LABEL } from "../lib/exercises.js";

/* RoutinesPanel — prebuilt workouts as first-class citizens.

   Your saved routines (templates) live here as real cards: start one,
   schedule it, edit it in the builder, duplicate it, delete it. Below,
   a small starter library seeds a plan in one tap — everything is
   editable after adding; nothing is prescriptive. */

function estMinutes(exercises) {
  let secs = 0;
  for (const p of exercises || []) {
    if (p.type === "cardio") secs += (p.targetMinutes || 10) * 60 + 30;
    else secs += (p.targetSets || 3) * (35 + (p.restSec ?? 90)) + 30;
  }
  return Math.max(5, Math.round(secs / 60));
}

function muscleChips(exercises) {
  return [...new Set((exercises || []).map((e) => e.muscleGroup).filter((g) => g && g !== "other"))].slice(0, 4);
}

export default function RoutinesPanel({
  templates = [],
  onStart,
  onSchedule,
  onEdit,
  onDuplicate,
  onDelete,
  onNew,
  onAddStarter,
}) {
  const [confirmId, setConfirmId] = useState(null);
  const ownedNames = useMemo(
    () => new Set(templates.map((t) => t.name.toLowerCase())),
    [templates]
  );

  return (
    <div className="routines">
      <div className="card">
        <div className="card-head">
          <div className="card-title"><Icon.Pin2 /> My routines</div>
          <button className="btn primary sm" onClick={onNew}>
            <Icon.Plus width={13} height={13} /> New routine
          </button>
        </div>

        {templates.length === 0 ? (
          <p className="rt-empty">
            No routines yet. Build one, save any generated or imported workout
            as a routine, or grab a starter below.
          </p>
        ) : (
          <div className="rt-grid">
            {templates.map((t) => (
              <div key={t.id} className="rt-card">
                <div className="rt-card-head">
                  <div className="rt-name">{t.name}</div>
                  <div className="rt-meta">
                    {(t.exercises || []).length} exercises · ~{estMinutes(t.exercises)} min
                  </div>
                </div>
                <div className="rt-chips">
                  {muscleChips(t.exercises).map((g) => (
                    <span key={g} className="rt-chip">{MUSCLE_LABEL[g] || g}</span>
                  ))}
                </div>
                <div className="rt-exs">
                  {(t.exercises || []).slice(0, 4).map((e) => e.name).join(" · ")}
                  {(t.exercises || []).length > 4 ? " · …" : ""}
                </div>
                <div className="rt-actions">
                  <button className="btn primary sm" onClick={() => onStart?.(t)}>
                    <Icon.Play width={12} height={12} /> Start
                  </button>
                  <button className="btn ghost sm" onClick={() => onSchedule?.(t)} title="Put it on a day">
                    <Icon.Calendar width={12} height={12} /> Schedule
                  </button>
                  <button className="btn ghost sm" onClick={() => onEdit?.(t)}>
                    <Icon.Pencil width={12} height={12} /> Edit
                  </button>
                  <button className="btn ghost sm" onClick={() => onDuplicate?.(t)} title="Duplicate">
                    <Icon.Reset width={12} height={12} />
                  </button>
                  {confirmId === t.id ? (
                    <button
                      className="btn sm rt-danger"
                      onClick={() => {
                        onDelete?.(t.id);
                        setConfirmId(null);
                      }}
                    >
                      Delete?
                    </button>
                  ) : (
                    <button
                      className="iconbtn sm"
                      title="Delete routine"
                      onClick={() => setConfirmId(t.id)}
                    >
                      <Icon.Trash width={12} height={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title"><Icon.Spark /> Starter routines</div>
        </div>
        <p className="rt-empty" style={{ marginBottom: 10 }}>
          One tap adds a copy to My routines — then edit it to fit you.
        </p>
        <div className="rt-starters">
          {STARTER_ROUTINES.map((r) => {
            const added = ownedNames.has(r.name.toLowerCase());
            return (
              <button
                key={r.id}
                className={"rt-starter" + (added ? " added" : "")}
                onClick={() => !added && onAddStarter?.(r)}
                disabled={added}
              >
                <span className="rt-starter-name">
                  {added ? <Icon.Check width={13} height={13} /> : <Icon.Plus width={13} height={13} />} {r.name}
                </span>
                <span className="rt-starter-desc">{r.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
