import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons.jsx";
import { compressImageForImport, importSchedule } from "../lib/aiApi.js";
import {
  draftToBlock,
  normalizeAiEvents,
  parseScheduleText,
} from "../lib/scheduleParse.js";
import { todayKey } from "../lib/model.js";

/* ScheduleImportSheet — get a schedule INTO Ligand from a screenshot.

   Flow: attach/paste a screenshot (or paste the schedule as plain text) →
   Ligand reads it (Gemini for images, a deterministic parser for text) →
   a review table where every event can be edited, unchecked, or fixed →
   ONE explicit "Add" button. Nothing is written to the store before that
   button; the review step IS the consent step.

   Screenshot reading requires a signed-in account (it rides the existing
   gemini-insights edge function). Guests get the text path, which works
   fully offline. */

const WEEKDAY_LABEL = (key) =>
  new Date(key + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

export default function ScheduleImportSheet({
  open,
  onClose,
  isMobile = false,
  addDayBlock,
  defaultDate = null, // the calendar's selected day — reference for weekday-only items
}) {
  const [stage, setStage] = useState("input"); // input | review | done
  const [image, setImage] = useState(null); // { mimeType, data, previewUrl }
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState([]); // [{...draft, include: true}]
  const [addedCount, setAddedCount] = useState(0);
  const fileRef = useRef(null);
  const closeTimer = useRef(null);
  const refDate = defaultDate || todayKey();

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  if (!open) return null;

  const attachFile = async (file) => {
    if (!file || !file.type?.startsWith("image/")) return;
    setError("");
    const compressed = await compressImageForImport(file);
    if (!compressed) {
      setError("Couldn't read that image file.");
      return;
    }
    setImage({ ...compressed, previewUrl: URL.createObjectURL(file) });
  };

  const onPaste = (e) => {
    const items = [...(e.clipboardData?.items || [])];
    const img = items.find((i) => i.type?.startsWith("image/"));
    if (img) {
      e.preventDefault();
      attachFile(img.getAsFile());
    }
  };

  const toReview = (events) => {
    setDrafts(events.map((ev) => ({ ...ev, include: true })));
    setStage("review");
  };

  const read = async () => {
    setError("");
    if (image) {
      setBusy(true);
      const res = await importSchedule(
        { mimeType: image.mimeType, data: image.data },
        { refDate }
      );
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toReview(normalizeAiEvents({ events: res.events }, refDate));
      return;
    }
    const events = parseScheduleText(text, refDate);
    if (!events.length) {
      setError(
        'Nothing readable yet. Attach a screenshot, or paste lines like "Mon 9:00-10:15 Math 101".'
      );
      return;
    }
    toReview(events);
  };

  const setDraft = (i, patch) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const included = drafts.filter((d) => d.include && d.title.trim());

  // The ONLY write in this component — behind the explicit confirm button.
  const confirmAdd = () => {
    included.forEach((d) => addDayBlock?.(draftToBlock(d)));
    setAddedCount(included.length);
    setStage("done");
    closeTimer.current = setTimeout(onClose, 1200);
  };

  const body =
    stage === "done" ? (
      <div className="quick-note-saved">
        <Icon.Check width={20} height={20} /> Added {addedCount} to your plan
      </div>
    ) : stage === "review" ? (
      <>
        <div className="row between" style={{ alignItems: "center" }}>
          <div className="sheet-title">Check what I found</div>
          <button type="button" className="iconbtn" title="Close" onClick={onClose}>
            <Icon.Close />
          </button>
        </div>
        <p className="qa-note" style={{ margin: "4px 0 10px" }}>
          Fix anything that's wrong, untick what you don't want. Nothing is
          added until you confirm below.
        </p>

        {image?.previewUrl && (
          <img src={image.previewUrl} alt="your schedule screenshot" className="schimp-thumb" />
        )}

        <div className="schimp-rows">
          {drafts.map((d, i) => (
            <div key={i} className={"schimp-row" + (d.include ? "" : " off")}>
              <button
                type="button"
                className={"schimp-check" + (d.include ? " on" : "")}
                aria-pressed={d.include}
                title={d.include ? "Don't add this one" : "Include it"}
                onClick={() => setDraft(i, { include: !d.include })}
              >
                {d.include && <Icon.Check width={12} height={12} />}
              </button>
              <div className="schimp-fields">
                <input
                  className="input schimp-title"
                  value={d.title}
                  onChange={(e) => setDraft(i, { title: e.target.value.slice(0, 80) })}
                  aria-label="Event name"
                />
                <div className="schimp-when">
                  <input
                    className="input"
                    type="date"
                    value={d.date}
                    onChange={(e) => setDraft(i, { date: e.target.value })}
                    aria-label="Date"
                  />
                  <input
                    className="input"
                    type="time"
                    value={d.start || ""}
                    onChange={(e) => setDraft(i, { start: e.target.value || null })}
                    aria-label="Start time"
                  />
                  <span className="schimp-dash">–</span>
                  <input
                    className="input"
                    type="time"
                    value={d.end || ""}
                    onChange={(e) => setDraft(i, { end: e.target.value || null })}
                    aria-label="End time"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn ghost sm" onClick={() => setStage("input")}>
            Back
          </button>
          <button
            className="btn primary quick-note-save"
            style={{ flex: 1, opacity: included.length ? 1 : 0.5 }}
            disabled={!included.length}
            onClick={confirmAdd}
          >
            <Icon.Check width={14} height={14} /> Add {included.length}{" "}
            {included.length === 1 ? "event" : "events"} to my plan
          </button>
        </div>
      </>
    ) : (
      <>
        <div className="row between" style={{ alignItems: "center" }}>
          <div className="sheet-title">Import a schedule</div>
          <button type="button" className="iconbtn" title="Close" onClick={onClose}>
            <Icon.Close />
          </button>
        </div>
        <p className="qa-note" style={{ margin: "4px 0 10px" }}>
          Screenshot of a timetable, calendar, or roster — Ligand reads out
          the events and you approve them before anything is added.
        </p>

        <div
          className={"schimp-drop" + (image ? " has" : "")}
          onPaste={onPaste}
          tabIndex={0}
          role="button"
          aria-label="Attach or paste a screenshot"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
          }}
        >
          {image ? (
            <>
              <img src={image.previewUrl} alt="attached schedule" className="schimp-thumb" />
              <button
                type="button"
                className="btn ghost sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setImage(null);
                }}
              >
                <Icon.Close width={12} height={12} /> Remove
              </button>
            </>
          ) : (
            <>
              <Icon.Image width={20} height={20} />
              <span className="schimp-drop-lbl">
                Tap to attach a screenshot{isMobile ? "" : " — or paste one right here"}
              </span>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            attachFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {!image && (
          <textarea
            className="input quick-note-textarea"
            rows={3}
            placeholder={'…or paste it as text, one per line:\n"Mon 9:00-10:15 Math 101"\n"Tue 2pm Dentist"'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            style={{ marginTop: 10 }}
          />
        )}

        {error && <p className="qa-hint" role="alert">{error}</p>}

        <button
          className="btn primary quick-note-save"
          onClick={read}
          disabled={busy || (!image && !text.trim())}
          style={{ opacity: busy || (!image && !text.trim()) ? 0.5 : 1 }}
        >
          {busy ? (
            "Reading…"
          ) : (
            <><Icon.Spark width={14} height={14} /> Read it</>
          )}
        </button>
        <p className="schimp-foot">
          Events land as blocks starting {WEEKDAY_LABEL(refDate)} week ·
          screenshot reading needs a signed-in account.
        </p>
      </>
    );

  return createPortal(
    isMobile ? (
      <div
        className="sheet-scrim quick-note-scrim"
        role="presentation"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="bottom-sheet quick-note-sheet schimp-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Import a schedule"
        >
          <div className="sheet-drag-area">
            <span className="sheet-handle" />
          </div>
          <div className="sheet-body quick-note-body">{body}</div>
        </div>
      </div>
    ) : (
      <div className="scrim" role="presentation" onMouseDown={onClose}>
        <div
          className="modal qa-modal schimp-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Import a schedule"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="qa-modal-body">{body}</div>
        </div>
      </div>
    ),
    document.body
  );
}
