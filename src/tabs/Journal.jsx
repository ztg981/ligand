import { useEffect, useMemo, useState } from "react";
import { reflectionPrompt } from "../lib/ai.js";
import { Icon } from "../components/Icons.jsx";
import ConfirmButton from "../components/ConfirmButton.jsx";
import { flashElement } from "../lib/scrollFlash.js";

/* Journal — app-wide reflection.
   A gentle, rotating prompt you can shuffle, an optional mood, and a box
   to write. Entries are saved newest-first and kept on this device only.
   Tone stays forgiving: writing is invited, never required. */

const MOODS = [
  { value: "rough", label: "Rough" },
  { value: "low", label: "Low" },
  { value: "okay", label: "Okay" },
  { value: "good", label: "Good" },
  { value: "great", label: "Great" },
];

function moodLabel(value) {
  return MOODS.find((m) => m.value === value)?.label || null;
}

function whenLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function Journal({
  journal,
  addJournalEntry,
  removeJournalEntry,
  confirmBeforeDelete = true,
  scrollTo = null,
}) {
  const [salt, setSalt] = useState(0);
  const prompt = useMemo(() => reflectionPrompt(salt), [salt]);
  const [text, setText] = useState("");
  const [mood, setMood] = useState(null);

  // Scroll to and flash a journal entry a search result pointed us at.
  useEffect(() => {
    if (!scrollTo?.id) return;
    flashElement("journal-" + scrollTo.id);
  }, [scrollTo?.nonce, scrollTo?.id]);

  const save = () => {
    const t = text.trim();
    if (!t) return;
    addJournalEntry({ text: t, prompt, mood });
    setText("");
    setMood(null);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Reflect</div>
          <h1 className="page-title">Journal</h1>
          <p className="page-sub">
            A quiet place to check in. A line is plenty — or skip it entirely.
          </p>
        </div>
      </div>

      <div className="grid grid-12">
        {/* Compose */}
        <div className="col-7 stack" style={{ gap: 12, minWidth: 0 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <Icon.Spark /> Today's prompt
              </div>
              <button
                className="btn ghost sm"
                onClick={() => setSalt((s) => s + 1)}
                title="Try a different prompt"
                style={{ flex: "none" }}
              >
                <Icon.Reset width={13} height={13} /> Shuffle
              </button>
            </div>

            <div
              style={{
                fontSize: 14,
                color: "var(--accent-ink)",
                background: "var(--accent-soft)",
                padding: "10px 12px",
                borderRadius: "var(--r-md)",
                marginBottom: 12,
                lineHeight: 1.45,
              }}
            >
              {prompt}
            </div>

            <textarea
              className="input"
              placeholder="Write as much or as little as you like…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              style={{ resize: "vertical", width: "100%", lineHeight: 1.5 }}
            />

            {/* Optional mood */}
            <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)", marginRight: 2 }}>
                Mood
              </span>
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  className={"chip" + (mood === m.value ? " accent" : "")}
                  onClick={() => setMood(mood === m.value ? null : m.value)}
                  style={{ cursor: "pointer" }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="row between" style={{ marginTop: 12 }}>
              <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
                Saved privately on this device.
              </span>
              <button
                className="btn primary"
                onClick={save}
                disabled={!text.trim()}
                style={{ flex: "none", opacity: text.trim() ? 1 : 0.5 }}
              >
                <Icon.Check /> Save entry
              </button>
            </div>
          </div>
        </div>

        {/* Past entries */}
        <div className="col-5 stack" style={{ gap: 12, minWidth: 0 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <Icon.Book /> Past entries
              </div>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {journal.length || ""}
              </span>
            </div>

            {journal.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                Nothing here yet. Whenever you write something, it'll appear
                here — gently waiting, no pressure to keep a streak.
              </div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {journal.map((e) => (
                  <div
                    key={e.id}
                    id={"journal-" + e.id}
                    style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}
                  >
                    <div className="row between" style={{ marginBottom: 4 }}>
                      <span className="row" style={{ gap: 6, alignItems: "center" }}>
                        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                          {whenLabel(e.createdAt)}
                        </span>
                        {e.mood && <span className="chip">{moodLabel(e.mood)}</span>}
                      </span>
                      <ConfirmButton
                        className="iconbtn"
                        title="Delete entry"
                        onConfirm={() => removeJournalEntry(e.id)}
                        requireConfirmation={confirmBeforeDelete}
                        style={{ width: 24, height: 24, color: "var(--ink-4)" }}
                        icon={<Icon.Trash width={13} height={13} />}
                      />
                    </div>
                    {e.prompt && (
                      <div style={{ fontSize: 11, color: "var(--ink-4)", fontStyle: "italic", marginBottom: 3 }}>
                        {e.prompt}
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {e.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
