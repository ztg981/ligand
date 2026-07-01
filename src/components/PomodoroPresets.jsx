import { useState } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { Icon } from "../components/Icons.jsx";

/* ============================================================
   PomodoroPresets - named timer configurations as quick-select
   chips. Clicking a chip applies its work / short / long / cadence
   to the live Pomodoro settings. Persisted in ligand.pomodoroPresets
   (so they sync for logged-in users and stay local for guests).
   A few gentle defaults are seeded; users can add (save current),
   rename, and delete their own.
   ============================================================ */

const DEFAULT_PRESETS = [
  { id: "classic", name: "Classic", work: 25, shortBreak: 5, longBreak: 15, longEvery: 4 },
  { id: "deepwork", name: "Deep work", work: 50, shortBreak: 10, longBreak: 30, longEvery: 3 },
  { id: "sprint", name: "Quick sprint", work: 15, shortBreak: 5, longBreak: 15, longEvery: 4 },
];

const FIELDS = ["work", "shortBreak", "longBreak", "longEvery"];

function matches(preset, settings) {
  return FIELDS.every((f) => Number(preset[f]) === Number(settings[f]));
}

function newId() {
  return "pp-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export default function PomodoroPresets({ settings, onApply }) {
  const [presets, setPresets] = useLocalStorage("ligand.pomodoroPresets", DEFAULT_PRESETS);
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const apply = (p) => {
    onApply?.({
      work: p.work,
      shortBreak: p.shortBreak,
      longBreak: p.longBreak,
      longEvery: p.longEvery,
    });
  };

  const remove = (id) => setPresets((prev) => prev.filter((p) => p.id !== id));

  const startRename = (p) => {
    setEditingId(p.id);
    setDraftName(p.name);
  };
  const commitRename = () => {
    const name = draftName.trim();
    if (editingId && name) {
      setPresets((prev) => prev.map((p) => (p.id === editingId ? { ...p, name } : p)));
    }
    setEditingId(null);
    setDraftName("");
  };

  const saveCurrent = () => {
    const name = newName.trim();
    if (!name) return;
    setPresets((prev) => [
      ...prev,
      {
        id: newId(),
        name,
        work: settings.work,
        shortBreak: settings.shortBreak,
        longBreak: settings.longBreak,
        longEvery: settings.longEvery,
      },
    ]);
    setNewName("");
    setAdding(false);
  };

  return (
    <div className="pomo-presets">
      {presets.map((p) =>
        editingId === p.id ? (
          <input
            key={p.id}
            className="input pomo-preset-input"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setEditingId(null);
                setDraftName("");
              }
            }}
            onBlur={commitRename}
          />
        ) : (
          <span
            key={p.id}
            className={"pomo-preset" + (matches(p, settings) ? " active" : "")}
          >
            <button
              type="button"
              className="pomo-preset-apply"
              onClick={() => apply(p)}
              title={`${p.work} / ${p.shortBreak} / ${p.longBreak} min · long break every ${p.longEvery}`}
            >
              <span className="pomo-preset-name">{p.name}</span>
              <span className="pomo-preset-sub">{p.work}/{p.shortBreak}</span>
            </button>
            <span className="pomo-preset-actions">
              <button
                type="button"
                className="pomo-preset-icon"
                title="Rename preset"
                aria-label="Rename preset"
                onClick={() => startRename(p)}
              >
                <Icon.Edit width={11} height={11} />
              </button>
              <button
                type="button"
                className="pomo-preset-icon"
                title="Delete preset"
                aria-label="Delete preset"
                onClick={() => remove(p.id)}
              >
                <Icon.Close width={11} height={11} />
              </button>
            </span>
          </span>
        )
      )}

      {adding ? (
        <input
          className="input pomo-preset-input"
          autoFocus
          placeholder="Preset name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveCurrent();
            if (e.key === "Escape") {
              setAdding(false);
              setNewName("");
            }
          }}
          onBlur={() => {
            if (newName.trim()) saveCurrent();
            else setAdding(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="pomo-preset pomo-preset-add"
          onClick={() => setAdding(true)}
          title="Save the current timer settings as a preset"
        >
          <Icon.Plus width={12} height={12} /> Save current
        </button>
      )}
    </div>
  );
}
