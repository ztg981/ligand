import { useMemo, useState, useEffect } from "react";
import { reflectionPrompt } from "../lib/ai.js";
import { fetchAiInsight } from "../lib/aiApi.js";
import { formatEntryDateTime } from "../lib/model.js";
import { Icon } from "../components/Icons.jsx";
import ConfirmButton from "../components/ConfirmButton.jsx";

/* Reflections — a light journal scoped to one goal.
   A rotating gentle prompt + a place to jot a few lines. Past notes
   are listed newest-first by default; the sort can be flipped per goal. */

export default function Reflections({
  goal,
  tasks = [],
  addReflection,
  removeReflection,
  updateGoal,
  confirmBeforeDelete = true,
  widgetSize = "medium",
}) {
  const defaultPrompt = useMemo(() => reflectionPrompt(), []);
  const [prompt, setPrompt] = useState(defaultPrompt);

  useEffect(() => {
    if (!goal?.id) return;
    let active = true;
    const context = {
      name: goal?.name,
      tasks: (tasks || []).slice(-5).map(t => ({ text: t?.text, done: t?.done }))
    };
    fetchAiInsight(goal.id, "journal-prompt", context).then(res => {
      if (active && res?.text) setPrompt(res.text);
    }).catch(() => {});
    return () => { active = false; };
  }, [goal?.id, goal?.name, tasks]);

  const [text, setText] = useState("");
  const reflections = goal.reflections || [];
  const compact = widgetSize === "compact";
  const roomy = widgetSize === "tall" || widgetSize === "large";
  // Per-goal sort preference (defaults newest-first).
  const sort = goal.reflectionSort === "oldest" ? "oldest" : "newest";
  const orderedReflections = useMemo(() => {
    const arr = [...reflections];
    arr.sort((a, b) => {
      const cmp = String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      return sort === "newest" ? cmp : -cmp;
    });
    return arr;
  }, [reflections, sort]);
  const visibleReflections = roomy ? orderedReflections : orderedReflections.slice(0, 3);

  const save = () => {
    const t = text.trim();
    if (!t) return;
    addReflection(goal.id, { text: t, prompt });
    setText("");
  };

  if (compact) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title">
            <Icon.Book /> Reflection
          </div>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {reflections.length || ""}
          </span>
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--accent-ink)",
            background: "var(--accent-soft)",
            padding: "8px 10px",
            borderRadius: "var(--r-md)",
          }}
        >
          {prompt}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Book /> Reflection
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {updateGoal && reflections.length > 1 && (
            <button
              type="button"
              className="btn ghost sm sort-toggle"
              onClick={() =>
                updateGoal(goal.id, {
                  reflectionSort: sort === "newest" ? "oldest" : "newest",
                })
              }
              title="Toggle sort order"
            >
              <Icon.Arrow
                width={12}
                height={12}
                style={{ transform: sort === "newest" ? "rotate(90deg)" : "rotate(-90deg)" }}
              />
              {sort === "newest" ? "Newest" : "Oldest"}
            </button>
          )}
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {reflections.length || ""}
          </span>
        </div>
      </div>

      <div
        style={{
          fontSize: 12.5,
          color: "var(--accent-ink)",
          background: "var(--accent-soft)",
          padding: "8px 10px",
          borderRadius: "var(--r-md)",
          marginBottom: 8,
        }}
      >
        {prompt}
      </div>

      <textarea
        className="input"
        placeholder="A line or two — or skip it, no pressure."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={roomy ? 5 : 3}
        style={{ resize: "vertical", width: "100%", lineHeight: 1.45 }}
      />
      <div className="row between" style={{ marginTop: 8 }}>
        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
          Saved privately on this device.
        </span>
        <button
          type="button"
          className="btn primary"
          onClick={save}
          disabled={!text.trim()}
          style={{ flex: "none", opacity: text.trim() ? 1 : 0.5 }}
        >
          <Icon.Check /> Save
        </button>
      </div>

      {reflections.length > 0 && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          {visibleReflections.map((r) => (
            <div
              key={r.id}
              style={{
                borderTop: "1px solid var(--line)",
                paddingTop: 8,
              }}
            >
              <div className="row between" style={{ marginBottom: 2, gap: 8 }}>
                {r.prompt ? (
                  <span style={{ fontSize: 11, color: "var(--ink-4)", fontStyle: "italic", minWidth: 0 }}>
                    {r.prompt}
                  </span>
                ) : (
                  <span />
                )}
                <span className="row" style={{ gap: 6, flex: "none", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {r.location && (
                    <span className="entry-location">
                      <Icon.Pin2 width={10} height={10} /> {r.location}
                    </span>
                  )}
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
                    {formatEntryDateTime(r.createdAt)}
                  </span>
                  {removeReflection && (
                    <ConfirmButton
                      className="iconbtn"
                      title="Delete reflection"
                      onConfirm={() => removeReflection(goal.id, r.id)}
                      requireConfirmation={confirmBeforeDelete}
                      style={{ width: 22, height: 22, color: "var(--ink-4)" }}
                      icon={<Icon.Trash width={12} height={12} />}
                    />
                  )}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                {r.text}
              </div>
            </div>
          ))}
          {visibleReflections.length < reflections.length && (
            <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
              {reflections.length - visibleReflections.length} more reflection
              {reflections.length - visibleReflections.length === 1 ? "" : "s"} visible in a larger size.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
