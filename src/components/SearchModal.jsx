import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icons.jsx";

/* ============================================================
   SearchModal — a floating command-palette-style search.

   Searches across goals, tasks (text + label), journal entries,
   habit names, and count-up labels. Results are grouped by type;
   choosing one asks the host (App) to navigate to it. Keyboard:
   ↑/↓ move, Enter opens, Esc closes (Esc also handled globally).
   ============================================================ */

const GROUP_META = {
  goal: { label: "Goals", icon: <Icon.Target /> },
  task: { label: "Tasks", icon: <Icon.Check /> },
  journal: { label: "Journal", icon: <Icon.Book /> },
  habit: { label: "Habits", icon: <Icon.Spark /> },
  tracker: { label: "Trackers", icon: <Icon.Flame /> },
};

const GROUP_ORDER = ["goal", "task", "journal", "habit", "tracker"];
const PER_GROUP = 6;

function truncate(s, n = 64) {
  const one = (s || "").replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
}

function whenLabel(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/* Build grouped results for a query. Every search term must appear
   somewhere in an item's haystack (AND match), case-insensitive. */
function buildResults(query, { goals, tasks, journal, countUps }) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const match = (hay) => {
    const h = (hay || "").toLowerCase();
    return terms.every((t) => h.includes(t));
  };

  const groups = {
    goal: [],
    task: [],
    journal: [],
    habit: [],
    tracker: [],
  };

  // Goals
  for (const g of goals) {
    if (match(g.name)) {
      groups.goal.push({
        key: "goal:" + g.id,
        type: "goal",
        label: g.name,
        sub: "Goal",
        icon: GROUP_META.goal.icon,
        nav: { tab: "goal", goalId: g.id },
      });
    }
    // Habits live inside goals.
    for (const h of g.habits || []) {
      if (match(h.name)) {
        groups.habit.push({
          key: "habit:" + h.id,
          type: "habit",
          label: h.name,
          sub: "Habit · " + g.name,
          icon: GROUP_META.habit.icon,
          nav: { tab: "goal", goalId: g.id },
        });
      }
    }
  }

  // Tasks (text + label)
  const goalName = (id) => goals.find((g) => g.id === id)?.name;
  for (const t of tasks) {
    if (match(t.text + " " + (t.label || "") + " " + (goalName(t.goalId) || ""))) {
      const tag = t.goalId ? goalName(t.goalId) || "Task" : t.label || "Task";
      groups.task.push({
        key: "task:" + t.id,
        type: "task",
        label: t.text || "(untitled task)",
        sub: (t.done ? "Done · " : "") + tag,
        icon: GROUP_META.task.icon,
        nav: { tab: "tasks", id: t.id },
      });
    }
  }

  // Journal entries (text + prompt)
  for (const e of journal || []) {
    if (match((e.text || "") + " " + (e.prompt || ""))) {
      groups.journal.push({
        key: "journal:" + e.id,
        type: "journal",
        label: truncate(e.text) || "(empty entry)",
        sub: "Journal · " + whenLabel(e.createdAt),
        icon: GROUP_META.journal.icon,
        nav: { tab: "journal", id: e.id },
      });
    }
  }

  // Count-ups
  for (const c of countUps || []) {
    if (match(c.label)) {
      groups.tracker.push({
        key: "tracker:" + c.id,
        type: "tracker",
        label: c.label,
        sub: "Tracker",
        icon: GROUP_META.tracker.icon,
        nav: { tab: "home" },
      });
    }
  }

  return GROUP_ORDER.map((type) => ({
    type,
    label: GROUP_META[type].label,
    items: groups[type].slice(0, PER_GROUP),
  })).filter((g) => g.items.length > 0);
}

export default function SearchModal({
  open,
  onClose,
  goals = [],
  tasks = [],
  journal = [],
  countUps = [],
  onNavigate,
}) {
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);

  // Reset + focus whenever the modal opens.
  useEffect(() => {
    if (open) {
      setQ("");
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(
    () => buildResults(q, { goals, tasks, journal, countUps }),
    [q, goals, tasks, journal, countUps]
  );
  const flat = useMemo(() => results.flatMap((g) => g.items), [results]);

  // Keep the active index in range as results change.
  useEffect(() => {
    setActiveIdx(0);
  }, [q]);

  if (!open) return null;

  const choose = (item) => {
    onNavigate?.(item);
    onClose?.();
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose?.();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[activeIdx]) choose(flat[activeIdx]);
    }
  };

  const empty = q.trim() === "";

  return (
    <div className="search-overlay" onMouseDown={onClose}>
      <div
        className="search-panel"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="search-bar">
          <span className="search-bar-ic">
            <Icon.Search />
          </span>
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search goals, tasks, journal…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <kbd className="search-esc">Esc</kbd>
        </div>

        <div className="search-results">
          {empty ? (
            <div className="search-hint">
              Start typing to search your goals, tasks, and journal.
            </div>
          ) : flat.length === 0 ? (
            <div className="search-hint">Nothing found — try a different word.</div>
          ) : (
            results.map((group) => (
              <div key={group.type} className="search-group">
                <div className="search-group-label">{group.label}</div>
                {group.items.map((item) => {
                  const idx = flat.indexOf(item);
                  return (
                    <button
                      key={item.key}
                      className={"search-result" + (idx === activeIdx ? " active" : "")}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => choose(item)}
                    >
                      <span className="search-result-ic">{item.icon}</span>
                      <span className="search-result-text">
                        <span className="search-result-title">{item.label}</span>
                        {item.sub && (
                          <span className="search-result-sub">{item.sub}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
