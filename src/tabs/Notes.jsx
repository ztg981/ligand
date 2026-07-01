import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icons.jsx";

/* Notes - the calmest tab in the app.
   A frictionless plain-text scratchpad, like iPhone Notes. No goal links,
   no prompts, no formatting toolbar. Notes auto-save as you type (debounced
   500ms). The first line is the title; the rest is preview text.

   Layout: a list on the left, an inline editor on the right. On phones the
   panes swap (list ↔ editor) via a back button so each gets the full width. */

// Relative timestamp: "just now", "5 minutes ago", "2 hours ago",
// "yesterday", else a short date like "Jun 14".
function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = Date.now() - then.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  // Calendar-day difference for "yesterday".
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startOfDay(new Date()) - startOfDay(then)) / 86400000
  );
  if (dayDiff === 1) return "yesterday";
  if (dayDiff < 7) return `${dayDiff} days ago`;
  const sameYear = then.getFullYear() === new Date().getFullYear();
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function noteTitle(text) {
  const first = (text || "").split("\n")[0].trim();
  return first || "New note";
}

function notePreview(text) {
  const rest = (text || "")
    .split("\n")
    .slice(1)
    .join(" ")
    .trim();
  return rest;
}

export default function Notes({
  notes = [],
  addNote,
  updateNote,
  removeNote,
  autoOpenNoteId = null,
  onAutoOpenHandled,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  // Phone-only view toggle: "list" (default) or "editor".
  const [mobileView, setMobileView] = useState("list");

  const textareaRef = useRef(null);
  const draftRef = useRef("");
  const selectedIdRef = useRef(null);
  const editingRef = useRef(false);

  // Keep refs in step so leaveCurrent (and unmount cleanup) can read the
  // latest values without re-subscribing effects.
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Leaving a note: persist its text, or discard it entirely if it's blank
  // (so an opened-but-untouched note never clutters the list - iPhone-style).
  const leaveCurrent = () => {
    const id = selectedIdRef.current;
    if (!id) return;
    const text = draftRef.current;
    if (text.trim() === "") {
      removeNote(id);
    } else if (editingRef.current) {
      updateNote(id, { text });
    }
    editingRef.current = false;
  };

  // Load a note's text into the draft when the selection changes.
  useEffect(() => {
    const note = notes.find((n) => n.id === selectedId);
    setDraft(note ? note.text : "");
    editingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Debounced auto-save (500ms after the last keystroke). Only writes when the
  // change came from the user typing, so loading a note never echoes a save.
  useEffect(() => {
    if (!selectedId || !editingRef.current) return;
    const t = setTimeout(() => {
      updateNote(selectedId, { text: draft });
    }, 500);
    return () => clearTimeout(t);
  }, [draft, selectedId, updateNote]);

  // Flush / clean up the open note when the tab unmounts.
  useEffect(() => {
    return () => leaveCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A caller (mobile Home's quick-capture button) can ask us to jump
  // straight into a freshly-created note instead of landing on the list.
  useEffect(() => {
    if (!autoOpenNoteId) return;
    setSelectedId(autoOpenNoteId);
    setMobileView("editor");
    onAutoOpenHandled?.();
    requestAnimationFrame(() => textareaRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenNoteId]);

  const sortedNotes = useMemo(() => {
    const arr = [...notes].sort((a, b) =>
      String(b.updatedAt || b.createdAt || "").localeCompare(
        String(a.updatedAt || a.createdAt || "")
      )
    );
    const q = query.trim().toLowerCase();
    if (!q) return arr;
    return arr.filter((n) => (n.text || "").toLowerCase().includes(q));
  }, [notes, query]);

  const selectNote = (id) => {
    if (id === selectedId) {
      setMobileView("editor");
      return;
    }
    leaveCurrent();
    setSelectedId(id);
    setMobileView("editor");
  };

  const handleNew = () => {
    leaveCurrent();
    const note = addNote();
    setSelectedId(note.id);
    setDraft("");
    editingRef.current = false;
    setQuery("");
    setMobileView("editor");
    // Focus the writing area as soon as it renders.
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleDelete = (id) => {
    if (id === selectedId) {
      // Discarding the open note; skip the blank-cleanup in leaveCurrent.
      editingRef.current = false;
      setSelectedId(null);
      setMobileView("list");
    }
    removeNote(id);
  };

  const backToList = () => {
    leaveCurrent();
    setSelectedId(null);
    setMobileView("list");
  };

  const selectedNote = notes.find((n) => n.id === selectedId) || null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Capture</div>
          <h1 className="page-title">Notes</h1>
          <p className="page-sub">
            A quiet scratchpad. Just write - it saves itself.
          </p>
        </div>
        <button
          type="button"
          className={
            "btn primary notes-new-btn" +
            (mobileView === "editor" ? " notes-new-btn-hide-fab" : "")
          }
          onClick={handleNew}
          title="New note"
        >
          <Icon.Plus /> <span className="notes-new-btn-label">New note</span>
        </button>
      </div>

      <div className="notes-layout" data-mobile-view={mobileView}>
        {/* List pane */}
        <div className="notes-list-pane">
          <div className="notes-search">
            <Icon.Search />
            <input
              className="notes-search-input"
              placeholder="Search notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="notes-search-clear"
                title="Clear search"
                onClick={() => setQuery("")}
              >
                <Icon.Close />
              </button>
            )}
          </div>

          {sortedNotes.length === 0 ? (
            <div className="notes-empty">
              {notes.length === 0 ? (
                <>
                  <span className="notes-empty-ic">
                    <Icon.Note />
                  </span>
                  <div className="notes-empty-title">
                    Nothing here yet.
                  </div>
                  <div className="notes-empty-sub">
                    Tap <strong>+</strong> to capture a thought.
                  </div>
                </>
              ) : (
                <div className="notes-empty-sub">
                  No notes match “{query.trim()}”.
                </div>
              )}
            </div>
          ) : (
            <div className="notes-list">
              {sortedNotes.map((n) => {
                const preview = notePreview(n.text);
                return (
                  <button
                    type="button"
                    key={n.id}
                    className={
                      "note-list-item" + (n.id === selectedId ? " active" : "")
                    }
                    onClick={() => selectNote(n.id)}
                  >
                    <div className="note-item-main">
                      <div className="note-item-title">{noteTitle(n.text)}</div>
                      <div className="note-item-preview">
                        {preview || (
                          <span style={{ color: "var(--ink-4)" }}>
                            No additional text
                          </span>
                        )}
                      </div>
                      <div className="note-item-time">
                        {relativeTime(n.updatedAt || n.createdAt)}
                      </div>
                    </div>
                    <span
                      className="note-item-del"
                      role="button"
                      tabIndex={0}
                      title="Delete note"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(n.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          handleDelete(n.id);
                        }
                      }}
                    >
                      <Icon.Trash width={14} height={14} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Editor pane */}
        <div className="notes-editor-pane">
          {selectedNote ? (
            <div className="notes-editor card">
              <div className="notes-editor-head">
                <button
                  type="button"
                  className="btn ghost sm notes-back-btn"
                  onClick={backToList}
                  title="Back to notes"
                >
                  <Icon.Arrow
                    width={14}
                    height={14}
                    style={{ transform: "scaleX(-1)" }}
                  />
                  Notes
                </button>
                <span className="notes-editor-time">
                  {relativeTime(selectedNote.updatedAt || selectedNote.createdAt)}
                </span>
                <button
                  type="button"
                  className="iconbtn"
                  title="Delete note"
                  onClick={() => handleDelete(selectedNote.id)}
                  style={{ color: "var(--ink-3)" }}
                >
                  <Icon.Trash width={15} height={15} />
                </button>
              </div>
              <textarea
                ref={textareaRef}
                className="notes-textarea"
                placeholder="Start writing…"
                value={draft}
                onChange={(e) => {
                  editingRef.current = true;
                  setDraft(e.target.value);
                }}
              />
            </div>
          ) : (
            <div className="notes-editor-placeholder">
              <span className="notes-empty-ic">
                <Icon.Pencil />
              </span>
              <div className="notes-empty-title">Pick a note, or start a new one</div>
              <div className="notes-empty-sub">
                Your thoughts save automatically as you type.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
