import { useState } from "react";
import { Icon } from "./Icons.jsx";
import { EQUIPMENT_OPTIONS } from "../lib/exercises.js";
import { createFitnessProfile } from "../lib/model.js";

const LEVELS = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];
const GOALS = [
  { id: "strength", label: "Get stronger" },
  { id: "hypertrophy", label: "Build muscle" },
  { id: "endurance", label: "Endurance" },
  { id: "loseweight", label: "Lose weight" },
  { id: "general", label: "General fitness" },
];

/* WorkoutSetup - a one-screen setup shown the first time someone opens the
   Workout tab with no fitness profile yet. Collects the essentials the
   generator needs, then hands back a full profile via onSave. */
export default function WorkoutSetup({ onSave }) {
  const [level, setLevel] = useState("beginner");
  const [equipment, setEquipment] = useState([]);
  const [goalType, setGoalType] = useState("general");
  const [days, setDays] = useState(3);
  const [unit, setUnit] = useState("lbs");

  const toggleEquip = (id) =>
    setEquipment((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const save = () =>
    onSave?.(
      createFitnessProfile({
        experienceLevel: level,
        availableEquipment: equipment,
        goalType,
        workoutDaysPerWeek: days,
        weightUnit: unit,
      })
    );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Fitness</div>
          <h1 className="page-title">Set up your workouts</h1>
          <p className="page-sub">
            A few quick answers so we can build sessions that fit you. You can
            change all of this later.
          </p>
        </div>
      </div>

      <div className="stack" style={{ gap: 14, maxWidth: 560 }}>
        <div className="card wk-setup-block">
          <div className="wk-setup-q">Experience</div>
          <div className="wk-chip-row">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                className={"wk-chip" + (level === l.id ? " on" : "")}
                onClick={() => setLevel(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card wk-setup-block">
          <div className="wk-setup-q">What's your main goal?</div>
          <div className="wk-chip-row">
            {GOALS.map((g) => (
              <button
                key={g.id}
                className={"wk-chip" + (goalType === g.id ? " on" : "")}
                onClick={() => setGoalType(g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card wk-setup-block">
          <div className="wk-setup-q">
            Equipment you have
            <span className="wk-setup-hint">Bodyweight is always included</span>
          </div>
          <div className="wk-equip-grid">
            {EQUIPMENT_OPTIONS.map((opt) => {
              const on = equipment.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  className={"wk-equip-opt" + (on ? " on" : "")}
                  onClick={() => toggleEquip(opt.id)}
                >
                  <span className="wk-equip-check">{on && <Icon.Check width={12} height={12} />}</span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card wk-setup-block">
          <div className="wk-setup-q">Days per week</div>
          <div className="wk-chip-row">
            {[2, 3, 4, 5, 6].map((d) => (
              <button
                key={d}
                className={"wk-chip" + (days === d ? " on" : "")}
                onClick={() => setDays(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="card wk-setup-block">
          <div className="wk-setup-q">Weight unit</div>
          <div className="wk-chip-row">
            {["lbs", "kg"].map((u) => (
              <button
                key={u}
                className={"wk-chip" + (unit === u ? " on" : "")}
                onClick={() => setUnit(u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <button className="btn primary" style={{ justifyContent: "center" }} onClick={save}>
          <Icon.Check /> Start training
        </button>
      </div>
    </>
  );
}
