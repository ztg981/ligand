import { useMemo, useState } from "react";
import { Icon } from "./Icons.jsx";
import MuscleDiagram from "./MuscleDiagram.jsx";
import {
  EXERCISES,
  MUSCLE_LABEL,
  availableTags,
  exerciseAvailable,
} from "../lib/exercises.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "chest", label: "Chest" },
  { id: "back", label: "Back" },
  { id: "shoulders", label: "Shoulders" },
  { id: "arms", label: "Arms" }, // biceps + triceps
  { id: "legs", label: "Legs" },
  { id: "core", label: "Core" },
  { id: "cardio", label: "Cardio" },
  { id: "sport", label: "Sports" },
];

// Short equipment glyphs for the card chips.
const EQUIP_LABEL = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  cable: "Cable",
  machine: "Machine",
  bodyweight: "Bodyweight",
  pullup: "Pull-up bar",
  bands: "Bands",
  kettlebell: "Kettlebell",
  cardio: "Cardio",
};

/* ExerciseBrowser - a visual card grid replacing the old text list. Each card
   shows the name, a muscle-group chip, a simple muscle diagram, and equipment
   chips. Filter by group, search by name, and (optionally) hide exercises that
   don't match the current equipment. Tapping a card starts a session with it. */
export default function ExerciseBrowser({ equipment = [], onPick }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [matchEquip, setMatchEquip] = useState(false);

  const tagSet = useMemo(() => availableTags(equipment), [equipment]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXERCISES.filter((e) => {
      if (filter === "arms") {
        if (e.muscleGroup !== "biceps" && e.muscleGroup !== "triceps") return false;
      } else if (filter !== "all" && e.muscleGroup !== filter) {
        return false;
      }
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (matchEquip && !exerciseAvailable(e, tagSet)) return false;
      return true;
    });
  }, [filter, query, matchEquip, tagSet]);

  return (
    <div className="wk-browser">
      <div className="wk-browser-controls">
        <div className="wk-search">
          <Icon.Search width={15} height={15} />
          <input
            className="input"
            placeholder="Search exercises"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="wk-equip-toggle">
          <input
            type="checkbox"
            checked={matchEquip}
            onChange={(e) => setMatchEquip(e.target.checked)}
          />
          My equipment
        </label>
      </div>

      <div className="wk-filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={"wk-filter" + (filter === f.id ? " on" : "")}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card fit-empty">
          No exercises match. Try a different filter or turn off "My equipment".
        </div>
      ) : (
        <div className="wk-ex-grid">
          {list.map((ex) => (
            <button key={ex.id} className="wk-ex-card" onClick={() => onPick?.(ex.id)}>
              <div className="wk-ex-diagram">
                <MuscleDiagram group={ex.muscleGroup} size={34} />
              </div>
              <div className="wk-ex-body">
                <div className="wk-ex-name">{ex.name}</div>
                <span className="wk-ex-group">{MUSCLE_LABEL[ex.muscleGroup] || ex.muscleGroup}</span>
                <div className="wk-ex-equip">
                  {(ex.equipment.length ? ex.equipment : ["bodyweight"]).map((t) => (
                    <span key={t} className="wk-ex-equip-chip">{EQUIP_LABEL[t] || t}</span>
                  ))}
                </div>
              </div>
              <span className="wk-ex-add"><Icon.Plus width={15} height={15} /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
