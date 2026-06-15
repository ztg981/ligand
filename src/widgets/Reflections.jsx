import { useMemo, useState, useEffect } from "react";
import { reflectionPrompt } from "../lib/ai.js";
import { fetchAiInsight } from "../lib/aiApi.js";
import { Icon } from "../components/Icons.jsx";
import ConfirmButton from "../components/ConfirmButton.jsx";

/* Reflections — a light journal scoped to one goal.
   A rotating gentle prompt + a place to jot a few lines. Past notes
   are listed newest-first. Nothing is required; skipping is fine. */

function whenLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Reflections({
  goal,
  tasks = [],
  addReflection,
  removeReflection,
  confirmBeforeDelete = true,
  widgetSize = "medium",
}) {
  const defaultPrompt = useMemo(() => reflectionPrompt(), []);
  const [prompt, setPrompt] = useState(defaultPrompt);

  useEffect(() => {
    let active = true;
    const context = {
      name: goal.name,
      tasks: tasks.slice(-5).map(t => ({ text: t.text, done: t.done }))
    };
    fetchAiInsight(goal.id, "journal-prompt", context).then(res => {
      if (active && res) setPrompt(res);
    }).catch(() => {});
    return () => { active = false; };
  }, [goal.id, goal.name, tasks]);

  const [text, setText] = useState("");
  const reflections = goal.reflections || [];
  const compact = widgetSize === "compact";
  const roomy = widgetSize === "tall" || widgetSize === "large";
  const visibleReflections = roomy ? reflections : reflections.slice(0, 3);

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
                <span className="row" style={{ gap: 6, flex: "none", alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
                    {whenLabel(r.createdAt)}
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
