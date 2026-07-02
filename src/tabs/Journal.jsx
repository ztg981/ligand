import { useEffect, useMemo, useRef, useState } from "react";
import { reflectionPrompt } from "../lib/ai.js";
import { Icon } from "../components/Icons.jsx";
import ConfirmButton from "../components/ConfirmButton.jsx";
import LocationPicker from "../components/LocationPicker.jsx";
import { flashElement } from "../lib/scrollFlash.js";
import { formatEntryDateTime, todayKey } from "../lib/model.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { searchItunesSongs } from "../lib/itunesSearch.js";

const SONG_SEARCH_DEBOUNCE_MS = 400;

/* Journal - app-wide reflection.
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

// Shared inline form for both the standalone "Log a song" button and the
// compose card's "+ Add song" - a fast capture tool, not a music player, so
// only the title is required. Autofocuses the title on open. The title
// field doubles as an iTunes Search API lookup (debounced, best-effort -
// any failure just leaves the user typing manually, never blocks saving).
function SongForm({ onSave, onCancel }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState(null);
  const [note, setNote] = useState("");
  const [mood, setMood] = useState(null);
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef(null);
  const searchTokenRef = useRef(0);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const onTitleChange = (v) => {
    setTitle(v);
    setAlbum(null);
    clearTimeout(debounceRef.current);
    const q = v.trim();
    if (!q) {
      setResults([]);
      setShowResults(false);
      return;
    }
    const token = ++searchTokenRef.current;
    debounceRef.current = setTimeout(async () => {
      const found = await searchItunesSongs(q);
      // Ignore a stale response from an earlier keystroke.
      if (token !== searchTokenRef.current) return;
      setResults(found);
      setShowResults(found.length > 0);
    }, SONG_SEARCH_DEBOUNCE_MS);
  };

  const pickResult = (r) => {
    setTitle(r.title);
    setArtist(r.artist);
    setAlbum(r.album);
    setShowResults(false);
  };

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onSave({ title: t, artist: artist.trim(), album, note: note.trim() || null, mood });
  };

  return (
    <div className="song-form">
      <div className="song-form-row">
        <div className="song-search-wrap">
          <input
            className="input"
            autoFocus
            placeholder="Song title…"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 150)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          {showResults && (
            <div className="song-search-results">
              {results.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className="song-search-result"
                  // onMouseDown (not onClick) fires before the input's onBlur
                  // hides this dropdown, so the tap actually registers.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickResult(r);
                  }}
                >
                  {r.artworkUrl ? (
                    <img src={r.artworkUrl} alt="" className="song-search-art" />
                  ) : (
                    <span className="song-search-art song-search-art-empty">
                      <Icon.Music width={12} height={12} />
                    </span>
                  )}
                  <span className="song-search-meta">
                    <span className="song-search-title">{r.title}</span>
                    <span className="song-search-artist">
                      {r.artist}
                      {r.album ? ` · ${r.album}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          className="input"
          placeholder="Artist"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <input
        className="input"
        placeholder="Why I'm saving this (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <div className="row mood-row" style={{ gap: 6 }}>
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            className={"chip mood-chip" + (mood === m.value ? " accent" : "")}
            onClick={() => setMood(mood === m.value ? null : m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary sm"
          onClick={submit}
          disabled={!title.trim()}
          style={{ opacity: title.trim() ? 1 : 0.5 }}
        >
          <Icon.Music width={13} height={13} /> Save song
        </button>
      </div>
    </div>
  );
}

export default function Journal({
  journal,
  addJournalEntry,
  removeJournalEntry,
  songLog = [],
  addSong,
  updateSong,
  deleteSong,
  confirmBeforeDelete = true,
  scrollTo = null,
}) {
  const [salt, setSalt] = useState(0);
  const prompt = useMemo(() => reflectionPrompt(salt), [salt]);
  const [text, setText] = useState("");
  const [mood, setMood] = useState(null);
  const [location, setLocation] = useState(null);
  // Sort preference persists across sessions (app-wide for the main journal).
  const [sort, setSort] = useLocalStorage("ligand.journalSort", "newest");

  // Song log: which context opened the form (compose vs. the standalone
  // button), and which songs are staged to attach to the entry-in-progress.
  const [songFormContext, setSongFormContext] = useState(null); // null | "compose" | "standalone"
  const [attachedSongIds, setAttachedSongIds] = useState([]);
  const attachedSongs = songLog.filter((s) => attachedSongIds.includes(s.id));

  // Entries newest- or oldest-first by createdAt (ISO strings sort chrono).
  const orderedJournal = useMemo(() => {
    const arr = [...(journal || [])];
    arr.sort((a, b) => {
      const cmp = String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      return sort === "newest" ? cmp : -cmp;
    });
    return arr;
  }, [journal, sort]);

  // Songs newest-first for the standalone log list.
  const orderedSongs = useMemo(
    () => [...songLog].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    [songLog]
  );

  // Scroll to and flash a journal entry a search result pointed us at.
  useEffect(() => {
    if (!scrollTo?.id) return;
    flashElement("journal-" + scrollTo.id);
  }, [scrollTo?.nonce, scrollTo?.id]);

  const submitSong = (fields) => {
    const song = addSong(fields);
    if (songFormContext === "compose") {
      setAttachedSongIds((ids) => [...ids, song.id]);
    }
    setSongFormContext(null);
  };

  const save = () => {
    const t = text.trim();
    if (!t) return;
    const entry = addJournalEntry({ text: t, prompt, mood, location });
    attachedSongIds.forEach((id) => updateSong(id, { journalEntryId: entry.id }));
    setText("");
    setMood(null);
    setLocation(null);
    setAttachedSongIds([]);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Reflect</div>
          <h1 className="page-title">Journal</h1>
          <p className="page-sub">
            A quiet place to check in. A line is plenty - or skip it entirely.
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
              className="input journal-compose-textarea"
              placeholder="Write as much or as little as you like…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              style={{ resize: "vertical", width: "100%", lineHeight: 1.5 }}
            />

            {/* Optional mood */}
            <div className="row mood-row" style={{ gap: 6, marginTop: 10 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)", marginRight: 2 }}>
                Mood
              </span>
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  className={"chip mood-chip" + (mood === m.value ? " accent" : "")}
                  onClick={() => setMood(mood === m.value ? null : m.value)}
                  style={{ cursor: "pointer" }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Optional location */}
            <div style={{ marginTop: 10 }}>
              <LocationPicker location={location} onChange={setLocation} />
            </div>

            {/* Optional song(s) attached to this entry */}
            <div style={{ marginTop: 10 }}>
              {attachedSongs.length > 0 && (
                <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {attachedSongs.map((s) => (
                    <span key={s.id} className="chip song-chip">
                      <Icon.Music width={11} height={11} />
                      {s.title}
                      {s.artist ? ` - ${s.artist}` : ""}
                      <button
                        type="button"
                        className="song-chip-remove"
                        title="Remove"
                        onClick={() =>
                          setAttachedSongIds((ids) => ids.filter((id) => id !== s.id))
                        }
                      >
                        <Icon.Close width={10} height={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {songFormContext === "compose" ? (
                <SongForm onSave={submitSong} onCancel={() => setSongFormContext(null)} />
              ) : (
                <button
                  type="button"
                  className="btn ghost sm song-add-btn"
                  onClick={() => setSongFormContext("compose")}
                >
                  <Icon.Music width={13} height={13} /> Add song
                </button>
              )}
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
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                {journal.length > 1 && (
                  <button
                    type="button"
                    className="btn ghost sm sort-toggle"
                    onClick={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
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
                  {journal.length || ""}
                </span>
              </div>
            </div>

            {journal.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                Nothing here yet. Whenever you write something, it'll appear
                here - gently waiting, no pressure to keep a streak.
              </div>
            ) : (
              <div className="stack journal-entries">
                {orderedJournal.map((e) => {
                  const entryDate = String(e.createdAt || "").slice(0, 10);
                  const attached = songLog.filter((s) => s.journalEntryId === e.id);
                  // No explicit attachment, but a song was logged the same
                  // day - a quiet "on this day I was listening to X" nudge.
                  const sameDaySong =
                    attached.length === 0
                      ? songLog.find((s) => !s.journalEntryId && s.date === entryDate)
                      : null;
                  return (
                    <div
                      key={e.id}
                      id={"journal-" + e.id}
                      className="journal-entry"
                      style={{ borderTop: "1px solid var(--line)" }}
                    >
                      <div className="row between" style={{ marginBottom: 4 }}>
                        <span className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                            {formatEntryDateTime(e.createdAt)}
                          </span>
                          {e.location && (
                            <span className="entry-location">
                              <Icon.Pin2 width={11} height={11} /> {e.location}
                            </span>
                          )}
                          {e.mood && <span className="chip">{moodLabel(e.mood)}</span>}
                        </span>
                        <ConfirmButton
                          className="iconbtn journal-entry-del"
                          title="Delete entry"
                          onConfirm={() => removeJournalEntry(e.id)}
                          requireConfirmation={confirmBeforeDelete}
                          style={{ color: "var(--ink-4)" }}
                          icon={<Icon.Trash width={13} height={13} />}
                        />
                      </div>
                      {e.prompt && (
                        <div style={{ fontSize: 11, color: "var(--ink-4)", fontStyle: "italic", marginBottom: 3 }}>
                          {e.prompt}
                        </div>
                      )}
                      <div className="journal-entry-text" style={{ color: "var(--ink-2)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {e.text}
                      </div>
                      {attached.length > 0 && (
                        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          {attached.map((s) => (
                            <span key={s.id} className="chip song-chip static">
                              <Icon.Music width={11} height={11} />
                              {s.title}
                              {s.note ? ` - ${s.note}` : s.artist ? ` - ${s.artist}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      {sameDaySong && (
                        <div className="journal-listening-to">
                          <Icon.Music width={11} height={11} /> Listening to: {sameDaySong.title}
                          {sameDaySong.artist ? ` - ${sameDaySong.artist}` : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Song log - a lightweight record of what you've been listening
             to, separate from any one entry. */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <Icon.Music /> Songs
              </div>
              {songFormContext !== "standalone" && (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setSongFormContext("standalone")}
                >
                  <Icon.Music width={13} height={13} /> Log a song
                </button>
              )}
            </div>

            {songFormContext === "standalone" && (
              <div style={{ marginBottom: 10 }}>
                <SongForm onSave={submitSong} onCancel={() => setSongFormContext(null)} />
              </div>
            )}

            {orderedSongs.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                Nothing logged yet. Tap "Log a song" whenever something's
                stuck in your head.
              </div>
            ) : (
              <div className="stack song-log-list">
                {orderedSongs.map((s) => (
                  <div key={s.id} className="song-log-row">
                    <span className="song-log-ic">
                      <Icon.Music width={13} height={13} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="song-log-title">
                        {s.title}
                        {s.artist ? <span className="song-log-artist"> - {s.artist}</span> : null}
                      </div>
                      {s.note && <div className="song-log-note">{s.note}</div>}
                      <div className="song-log-meta">
                        {s.date === todayKey() ? "Today" : s.date}
                        {s.mood ? ` · ${moodLabel(s.mood)}` : ""}
                      </div>
                    </div>
                    <ConfirmButton
                      className="iconbtn song-log-del"
                      title="Delete song"
                      onConfirm={() => deleteSong(s.id)}
                      requireConfirmation={confirmBeforeDelete}
                      icon={<Icon.Trash width={13} height={13} />}
                    />
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
