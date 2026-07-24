import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import { searchItunesSongs } from "../lib/itunesSearch.js";
import { cryptoAvailable, encryptJSON, decryptJSON } from "../lib/noteCrypto.js";
import * as noteVault from "../lib/noteVault.js";

// Attachments are stored as data URLs inside the note (they ride the normal
// sync blob), so keep them small: reject anything over ~1.4MB encoded.
const MAX_ATTACH_BYTES = 1.4 * 1024 * 1024;
const MAX_ATTACH_COUNT = 6;
const MIN_PASSPHRASE = 6;

/* Notes - the calmest tab in the app.
   A frictionless plain-text scratchpad, like iPhone Notes. No goal links,
   no prompts, no formatting toolbar. Notes auto-save as you type (debounced
   500ms). The first line is the title; the rest is preview text.

   Layout: a list on the left, an inline editor on the right. On phones the
   panes swap (list ↔ editor) via a back button so each gets the full width.

   Locked notes: any note can be encrypted with a passphrase. When locked, the
   note stores only ciphertext (in `cipher`); its plaintext `text`/`attachments`
   are cleared, so what lands in localStorage and the sync blob is unreadable
   without the passphrase. The derived key lives in memory only (see noteVault),
   so you unlock once per session. Decrypted content is held in the `decrypted`
   map below and never persisted in the clear. */

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
  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  const [attachMsg, setAttachMsg] = useState("");
  const [viewImg, setViewImg] = useState(null); // lightbox data URL
  const [songOpen, setSongOpen] = useState(false);
  const [songQ, setSongQ] = useState("");
  const [songResults, setSongResults] = useState([]);
  const fileInputRef = useRef(null);

  // -- encryption / vault state ----------------------------------
  // Decrypted content for locked notes, kept in memory only:
  //   { [noteId]: { text, attachments } }. Populated on unlock; never written
  //   to storage in the clear. A ref mirror lets async callbacks read the
  //   latest map without re-subscribing.
  const [decrypted, setDecrypted] = useState({});
  const decryptedRef = useRef(decrypted);
  useEffect(() => {
    decryptedRef.current = decrypted;
  }, [decrypted]);

  // hasVault: a passphrase has been set at some point. vaultReady: the key is
  // held in memory for this session (unlocked). Seeded from the module so a
  // tab switch (which unmounts this component) doesn't re-lock you.
  const [hasVault, setHasVault] = useState(() => noteVault.vaultExists());
  const [vaultReady, setVaultReady] = useState(() => noteVault.isUnlocked());

  // Passphrase modal: null | { mode: "create" | "unlock", error }.
  const [passModal, setPassModal] = useState(null);
  const [passVal, setPassVal] = useState("");
  const [passConfirm, setPassConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  // If the user asked to lock a note but had to enter a passphrase first, we
  // remember which note here and lock it once the vault is ready.
  const pendingLockId = useRef(null);

  // Effective (readable) content for a note: decrypted content for locked
  // notes when available, otherwise the plaintext fields. Reads `decrypted`
  // state so the list/editor re-render as notes unlock.
  const contentOf = (n) => {
    if (!n) return { text: "", attachments: [] };
    if (n.locked) {
      const d = decrypted[n.id];
      return d
        ? { text: d.text || "", attachments: d.attachments || [] }
        : { text: "", attachments: [] };
    }
    return { text: n.text || "", attachments: n.attachments || [] };
  };

  // Fast capture: opening the tab lands you IN the newest note with the
  // cursor ready (iPhone-Notes style) — paste immediately, no clicks. If
  // there are no notes yet, start a fresh one. Skip a locked newest note
  // (we can't drop the cursor into something that needs unlocking).
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current || autoOpenNoteId) return;
    bootedRef.current = true;
    const newest = [...notesRef.current]
      .filter((n) => !n.locked)
      .sort((a, b) =>
        String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))
      )[0];
    const id = newest ? newest.id : addNote().id;
    setSelectedId(id);
    setMobileView("editor");
    // Focus after the editor pane has actually mounted (RAF can fire before
    // the selection-driven re-render lands).
    setTimeout(() => textareaRef.current?.focus(), 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Song lookup for the quick "♪" insert — debounced, best-effort. All
  // setState happens inside the async timer callback, never synchronously.
  useEffect(() => {
    const active = songOpen && songQ.trim().length >= 2;
    const t = setTimeout(
      async () => {
        setSongResults(active ? await searchItunesSongs(songQ, 5) : []);
      },
      active ? 350 : 0
    );
    return () => clearTimeout(t);
  }, [songQ, songOpen]);

  // -- persistence helper ----------------------------------------
  // Save a note, transparently encrypting when it's locked. `patch` may carry
  // { text } and/or { attachments }; anything omitted keeps its current value.
  // For locked notes we re-encrypt the merged content and store only ciphertext.
  const persistNote = async (id, patch) => {
    const note = notesRef.current.find((n) => n.id === id);
    if (!note) return;
    if (note.locked) {
      const key = noteVault.getKey();
      if (!key) return; // vault re-locked mid-edit; editor is hidden anyway
      const cur = decryptedRef.current[id] || { text: "", attachments: [] };
      const content = {
        text: patch.text !== undefined ? patch.text : cur.text || "",
        attachments:
          patch.attachments !== undefined ? patch.attachments : cur.attachments || [],
      };
      setDecrypted((prev) => ({ ...prev, [id]: content }));
      const cipher = await encryptJSON(key, content);
      updateNote(id, { locked: true, cipher, text: "", attachments: [] });
    } else {
      updateNote(id, patch);
    }
  };

  const attachFiles = (files) => {
    const id = selectedIdRef.current;
    if (!id) return;
    const note = notesRef.current.find((n) => n.id === id);
    const existing =
      (note?.locked ? decryptedRef.current[id]?.attachments : note?.attachments) || [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setAttachMsg("Only images for now (PNG, JPG, screenshots).");
        continue;
      }
      if (existing.length >= MAX_ATTACH_COUNT) {
        setAttachMsg(`Up to ${MAX_ATTACH_COUNT} images per note.`);
        break;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        if (dataUrl.length > MAX_ATTACH_BYTES) {
          setAttachMsg("That image is too large (keep under ~1 MB so sync stays fast).");
          return;
        }
        setAttachMsg("");
        const curNote = notesRef.current.find((n) => n.id === id);
        const curAtt =
          (curNote?.locked
            ? decryptedRef.current[id]?.attachments
            : curNote?.attachments) || [];
        const next = {
          attachments: [
            ...curAtt,
            { id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, dataUrl },
          ],
        };
        // Preserve any unsaved typing on the open note when we re-encrypt.
        if (id === selectedIdRef.current) next.text = draftRef.current;
        persistNote(id, next);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAttachment = (attId) => {
    const id = selectedIdRef.current;
    const curNote = notesRef.current.find((n) => n.id === id);
    const curAtt =
      (curNote?.locked ? decryptedRef.current[id]?.attachments : curNote?.attachments) || [];
    const next = { attachments: curAtt.filter((a) => a.id !== attId) };
    if (id === selectedIdRef.current) next.text = draftRef.current;
    persistNote(id, next);
  };

  const insertSong = (s) => {
    const line = `♪ ${s.title} · ${s.artist}`;
    setDraft((d) => (d.trim() ? `${d}\n${line}` : line));
    editingRef.current = true;
    setSongOpen(false);
    setSongQ("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

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
  // A note that holds only an image is NOT blank. Locked notes always have
  // content (ciphertext), so they're never auto-discarded.
  const leaveCurrent = () => {
    const id = selectedIdRef.current;
    if (!id) return;
    const note = notesRef.current.find((n) => n.id === id);
    if (!note) return;
    if (note.locked) {
      if (editingRef.current) persistNote(id, { text: draftRef.current });
      editingRef.current = false;
      return;
    }
    const text = draftRef.current;
    const hasAttachments = (note.attachments || []).length > 0;
    if (text.trim() === "" && !hasAttachments) {
      removeNote(id);
    } else if (editingRef.current) {
      updateNote(id, { text });
    }
    editingRef.current = false;
  };

  // On unlock, decrypt every locked note into the in-memory map so the list
  // shows real titles/previews and search can reach them. Skips notes already
  // decrypted (avoids clobbering live edits and redundant work).
  useEffect(() => {
    if (!vaultReady) return;
    const key = noteVault.getKey();
    if (!key) return;
    let cancelled = false;
    (async () => {
      const out = {};
      for (const n of notes) {
        if (n.locked && n.cipher && !decryptedRef.current[n.id]) {
          try {
            out[n.id] = await decryptJSON(key, n.cipher);
          } catch {
            /* leave undecryptable notes locked in the UI */
          }
        }
      }
      if (!cancelled && Object.keys(out).length) {
        setDecrypted((prev) => ({ ...prev, ...out }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultReady, notes]);

  // Is the selected note ready to edit? Normal notes always are; locked notes
  // only once decrypted. Drives the draft-load effect below.
  const selectedNoteObj = notes.find((n) => n.id === selectedId) || null;
  const selectedReady = selectedNoteObj
    ? selectedNoteObj.locked
      ? Boolean(decrypted[selectedNoteObj.id])
      : true
    : false;

  // Load a note's text into the draft when the selection changes (or when a
  // locked note becomes unlocked while open).
  useEffect(() => {
    const note = notes.find((n) => n.id === selectedId);
    if (!note || (note.locked && !decrypted[note.id])) {
      setDraft("");
      editingRef.current = false;
      return;
    }
    setDraft(contentOf(note).text);
    editingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedReady]);

  // Debounced auto-save (500ms after the last keystroke). Only writes when the
  // change came from the user typing, so loading a note never echoes a save.
  useEffect(() => {
    if (!selectedId || !editingRef.current) return;
    const t = setTimeout(() => {
      persistNote(selectedId, { text: draft });
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, selectedId]);

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
    // Locked notes only match once unlocked (contentOf returns "" otherwise),
    // so a locked note stays out of search results until you can read it.
    return arr.filter((n) => contentOf(n).text.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, query, decrypted]);

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

  // -- lock / unlock actions -------------------------------------
  const openPass = (mode) => {
    setPassVal("");
    setPassConfirm("");
    setShowPass(false);
    setPassModal({ mode, error: "" });
  };

  // Encrypt a note right now (vault must already be unlocked).
  const lockNoteNow = async (id) => {
    const key = noteVault.getKey();
    if (!key) return;
    const note = notesRef.current.find((n) => n.id === id);
    if (!note || note.locked) return;
    const content = {
      text: id === selectedIdRef.current ? draftRef.current : note.text || "",
      attachments: note.attachments || [],
    };
    setDecrypted((prev) => ({ ...prev, [id]: content }));
    const cipher = await encryptJSON(key, content);
    updateNote(id, { locked: true, cipher, text: "", attachments: [] });
  };

  // "Lock this note" button. Routes through the passphrase modal if a
  // passphrase hasn't been set or the vault isn't unlocked this session.
  const requestLock = (id) => {
    if (!cryptoAvailable()) {
      setAttachMsg("This browser can't encrypt notes (Web Crypto unavailable).");
      return;
    }
    if (!noteVault.vaultExists()) {
      pendingLockId.current = id;
      openPass("create");
    } else if (!noteVault.isUnlocked()) {
      pendingLockId.current = id;
      openPass("unlock");
    } else {
      lockNoteNow(id);
    }
  };

  // Unlock the vault to read a locked note (no note pending to lock).
  const requestUnlock = () => {
    pendingLockId.current = null;
    openPass("unlock");
  };

  // Permanently decrypt a note back to a normal one (needs it unlocked first).
  const removeLock = (id) => {
    const content = decryptedRef.current[id];
    if (!content) return;
    updateNote(id, {
      locked: false,
      cipher: null,
      text: content.text || "",
      attachments: content.attachments || [],
    });
    setDecrypted((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Re-lock the session: drop the in-memory key and forget decrypted content.
  const relockVault = () => {
    noteVault.lockVault();
    setVaultReady(false);
    setDecrypted({});
  };

  const submitPass = async () => {
    if (!passModal) return;
    const mode = passModal.mode;
    try {
      if (mode === "create") {
        if (passVal.length < MIN_PASSPHRASE) {
          setPassModal((m) => ({ ...m, error: `Use at least ${MIN_PASSPHRASE} characters.` }));
          return;
        }
        if (passVal !== passConfirm) {
          setPassModal((m) => ({ ...m, error: "The two passphrases don't match." }));
          return;
        }
        await noteVault.createVault(passVal);
      } else {
        const ok = await noteVault.unlockVault(passVal);
        if (!ok) {
          setPassModal((m) => ({ ...m, error: "That passphrase didn't work." }));
          return;
        }
      }
    } catch {
      setPassModal((m) => ({ ...m, error: "Something went wrong. Please try again." }));
      return;
    }
    setHasVault(true);
    setVaultReady(true);
    setPassModal(null);
    const pend = pendingLockId.current;
    pendingLockId.current = null;
    if (pend) lockNoteNow(pend);
  };

  const closePass = () => {
    pendingLockId.current = null;
    setPassModal(null);
  };

  const selectedNote = selectedNoteObj;
  const selectedLocked = selectedNote?.locked;
  const selectedDecrypted = selectedNote ? decrypted[selectedNote.id] : null;
  // A locked note we can't read yet: show the unlock screen instead of the editor.
  const showLockedScreen = selectedLocked && !selectedDecrypted;
  const editorAttachments = selectedNote ? contentOf(selectedNote).attachments : [];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Capture</div>
          <h1 className="page-title">Notes</h1>
          <p className="page-sub">
            A quiet scratchpad. Just write. It saves itself.
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

          {hasVault && vaultReady && (
            <button
              type="button"
              className="btn ghost sm notes-relock"
              onClick={relockVault}
              title="Lock your encrypted notes now (you'll re-enter the passphrase to read them)"
            >
              <Icon.Lock width={13} height={13} /> Lock notes now
            </button>
          )}

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
                const lockedHidden = n.locked && !decrypted[n.id];
                const c = contentOf(n);
                const preview = notePreview(c.text);
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
                      <div className="note-item-title">
                        {n.locked && (
                          <Icon.Lock
                            width={12}
                            height={12}
                            style={{ marginRight: 5, verticalAlign: "-1px", opacity: 0.7 }}
                          />
                        )}
                        {lockedHidden ? "Locked note" : noteTitle(c.text)}
                      </div>
                      <div className="note-item-preview">
                        {lockedHidden ? (
                          <span style={{ color: "var(--ink-4)" }}>
                            Locked. Unlock to read
                          </span>
                        ) : preview ? (
                          preview
                        ) : (
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
          {!selectedNote ? (
            <div className="notes-editor-placeholder">
              <span className="notes-empty-ic">
                <Icon.Pencil />
              </span>
              <div className="notes-empty-title">Pick a note, or start a new one</div>
              <div className="notes-empty-sub">
                Your thoughts save automatically as you type.
              </div>
            </div>
          ) : showLockedScreen ? (
            <div className="notes-editor card notes-locked-screen">
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
              <span className="notes-locked-ic">
                <Icon.Lock width={26} height={26} />
              </span>
              <div className="notes-empty-title">This note is locked</div>
              <div className="notes-empty-sub">
                Enter your passphrase to read and edit it.
              </div>
              <button type="button" className="btn primary" onClick={requestUnlock}>
                Unlock
              </button>
            </div>
          ) : (
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
                  title="Add a song line"
                  onClick={() => setSongOpen((o) => !o)}
                  style={{ color: songOpen ? "var(--accent-ink, var(--accent))" : "var(--ink-3)" }}
                >
                  ♪
                </button>
                <button
                  type="button"
                  className="iconbtn"
                  title="Attach an image (or just paste one)"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ color: "var(--ink-3)" }}
                >
                  <Icon.Plus width={15} height={15} />
                </button>
                {selectedLocked ? (
                  <button
                    type="button"
                    className="iconbtn"
                    title="Remove lock (decrypt this note back to normal)"
                    onClick={() => removeLock(selectedNote.id)}
                    style={{ color: "var(--accent-ink, var(--accent))" }}
                  >
                    <Icon.Lock width={15} height={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="iconbtn"
                    title="Lock this note (encrypt with your passphrase)"
                    onClick={() => requestLock(selectedNote.id)}
                    style={{ color: "var(--ink-3)" }}
                  >
                    <Icon.Lock width={15} height={15} />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    attachFiles([...e.target.files]);
                    e.target.value = "";
                  }}
                />
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

              {selectedLocked && (
                <div className="notes-locked-banner">
                  <Icon.Lock width={12} height={12} /> Encrypted, readable only with
                  your passphrase.
                </div>
              )}

              {songOpen && (
                <div className="notes-song">
                  <input
                    className="input"
                    autoFocus
                    placeholder="Search a song to drop in…"
                    value={songQ}
                    onChange={(e) => setSongQ(e.target.value)}
                  />
                  {songResults.length > 0 && (
                    <div className="notes-song-results">
                      {songResults.map((s) => (
                        <button key={s.id} className="notes-song-row" onClick={() => insertSong(s)}>
                          {s.artworkUrl && <img src={s.artworkUrl} alt="" />}
                          <span className="notes-song-t">{s.title}</span>
                          <span className="notes-song-a">{s.artist}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <textarea
                ref={textareaRef}
                className="notes-textarea"
                placeholder="Start writing… (paste screenshots right here)"
                value={draft}
                onChange={(e) => {
                  editingRef.current = true;
                  setDraft(e.target.value);
                }}
                onPaste={(e) => {
                  const imgs = [...(e.clipboardData?.items || [])]
                    .filter((i) => i.type.startsWith("image/"))
                    .map((i) => i.getAsFile())
                    .filter(Boolean);
                  if (imgs.length) {
                    e.preventDefault();
                    attachFiles(imgs);
                  }
                }}
              />

              {attachMsg && <p className="notes-attach-msg" role="alert">{attachMsg}</p>}
              {editorAttachments.length > 0 && (
                <div className="notes-attach-strip">
                  {editorAttachments.map((a) => (
                    <span key={a.id} className="notes-attach">
                      <img src={a.dataUrl} alt="attachment" onClick={() => setViewImg(a.dataUrl)} />
                      <button
                        className="notes-attach-x"
                        title="Remove image"
                        onClick={() => removeAttachment(a.id)}
                      >
                        <Icon.Close width={10} height={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {viewImg && (
        <div className="notes-lightbox" role="presentation" onClick={() => setViewImg(null)}>
          <img src={viewImg} alt="attachment enlarged" />
        </div>
      )}

      {passModal && (
        <div className="notes-lightbox" role="presentation" onClick={closePass}>
          <div
            className="notes-pass card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="notes-pass-title">
              {passModal.mode === "create" ? "Set a notes passphrase" : "Unlock your notes"}
            </div>
            <p className="notes-pass-sub">
              {passModal.mode === "create"
                ? "This passphrase encrypts the note so only you can read it. If you forget it, the note can't be recovered. There's no reset."
                : "Enter your passphrase to unlock your locked notes for this session."}
            </p>

            <div className="notes-pass-field">
              <input
                type={showPass ? "text" : "password"}
                className="input"
                autoFocus
                placeholder="Passphrase"
                value={passVal}
                onChange={(e) => setPassVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && passModal.mode !== "create") submitPass();
                }}
              />
              <button
                type="button"
                className="iconbtn"
                title={showPass ? "Hide passphrase" : "Show passphrase"}
                onClick={() => setShowPass((s) => !s)}
              >
                {showPass ? <Icon.EyeOff /> : <Icon.Eye />}
              </button>
            </div>

            {passModal.mode === "create" && (
              <input
                type={showPass ? "text" : "password"}
                className="input notes-pass-confirm"
                placeholder="Confirm passphrase"
                value={passConfirm}
                onChange={(e) => setPassConfirm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitPass();
                }}
              />
            )}

            {passModal.error && (
              <p className="notes-attach-msg" role="alert">{passModal.error}</p>
            )}

            <div className="notes-pass-actions">
              <button type="button" className="btn ghost" onClick={closePass}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={submitPass}>
                {passModal.mode === "create" ? "Set & lock" : "Unlock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
