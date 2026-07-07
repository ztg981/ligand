import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons.jsx";

/* AlarmsPanel — create and manage photo-scan alarms.

   Setup has to be genuinely easy or no one uses it: pick a time, name what
   you'll scan, and snap one photo of it (your sink, kettle, front door). The
   photo lives locally in the alarm. Everything else has a sensible default. */

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function fmtDays(days) {
  if (!days || !days.length) return "Every day";
  if (days.length === 7) return "Every day";
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // Weekdays / weekends shortcuts.
  const set = new Set(days);
  if (days.length === 5 && [0, 1, 2, 3, 4].every((d) => set.has(d))) return "Weekdays";
  if (days.length === 2 && set.has(5) && set.has(6)) return "Weekends";
  return days.slice().sort((a, b) => a - b).map((d) => names[d]).join(", ");
}

// Inline camera capture for the target object.
function PhotoCapture({ value, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setErr("Couldn't open the camera. Check permissions.");
      }
    })();
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    onCapture(c.toDataURL("image/jpeg", 0.8));
    setOpen(false);
  };

  if (open) {
    return (
      <div className="alarm-capture-inline">
        {err ? (
          <div className="alarm-cam-error">{err}</div>
        ) : (
          <video ref={videoRef} className="alarm-setup-cam" playsInline muted />
        )}
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="btn primary sm" onClick={snap} disabled={!!err}>Capture</button>
          <button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="alarm-photo-row">
      {value ? (
        <img className="alarm-photo-thumb" src={value} alt="Scan target" />
      ) : (
        <div className="alarm-photo-empty"><Icon.Search width={18} height={18} /></div>
      )}
      <button className="btn sm" onClick={() => setOpen(true)}>
        {value ? "Retake photo" : "Take photo"}
      </button>
    </div>
  );
}

const EMPTY_DRAFT = { time: "07:00", label: "Wake up", targetLabel: "", targetPhoto: null, days: [] };

export default function AlarmsPanel({ alarms = [], addAlarm, updateAlarm, removeAlarm, onTest }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null); // alarm being edited (form reused)
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const camSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const toggleDay = (d) =>
    setDraft((s) => ({
      ...s,
      days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d],
    }));

  const startEdit = (a) => {
    setDraft({
      time: a.time,
      label: a.label,
      targetLabel: a.targetLabel || "",
      targetPhoto: a.targetPhoto || null,
      days: a.days || [],
    });
    setEditingId(a.id);
    setAdding(true);
  };

  const save = () => {
    const fields = {
      time: draft.time,
      label: draft.label.trim() || "Alarm",
      targetLabel: draft.targetLabel.trim(),
      targetPhoto: draft.targetPhoto,
      days: draft.days,
    };
    if (editingId) updateAlarm?.(editingId, fields);
    else addAlarm?.(fields);
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setAdding(false);
  };

  return (
    <div className="card alarms-card">
      <div className="card-head">
        <div className="card-title"><Icon.Bell /> Alarms</div>
      </div>
      <p className="alarms-sub">
        A wake-up alarm you can only turn off by photographing something across
        the room, so you actually get up. Rings only while Ligand is open.
      </p>

      {alarms.length > 0 && (
        <div className="alarms-list">
          {alarms.map((a) => (
            <div key={a.id} className={"alarm-row" + (a.enabled ? "" : " off")}>
              <div className="alarm-row-main">
                <div className="alarm-row-time">{a.time}</div>
                <div className="alarm-row-meta">
                  <span className="alarm-row-label">{a.label}</span>
                  <span className="alarm-row-days">
                    {fmtDays(a.days)}
                    {a.targetPhoto ? ` · scan ${a.targetLabel || "object"}` : " · tap to dismiss"}
                  </span>
                </div>
              </div>
              <div className="alarm-row-actions">
                <button
                  className={"alarm-toggle" + (a.enabled ? " on" : "")}
                  role="switch"
                  aria-checked={a.enabled}
                  title={a.enabled ? "Enabled" : "Disabled"}
                  onClick={() => updateAlarm?.(a.id, { enabled: !a.enabled })}
                >
                  <span className="alarm-toggle-knob" />
                </button>
                {onTest && (
                  <button
                    className="iconbtn sm"
                    title="Test this alarm now (sound + dismissal flow)"
                    onClick={() => onTest(a)}
                  >
                    <Icon.Play width={13} height={13} />
                  </button>
                )}
                <button className="iconbtn sm" title="Edit alarm" onClick={() => startEdit(a)}>
                  <Icon.Pencil width={13} height={13} />
                </button>
                <button className="iconbtn sm" title="Delete alarm" onClick={() => removeAlarm?.(a.id)}>
                  <Icon.Trash width={13} height={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="alarm-form">
          <div className="alarm-form-row">
            <label className="alarm-form-lbl">Time</label>
            <input
              type="time"
              className="input"
              value={draft.time}
              onChange={(e) => setDraft((s) => ({ ...s, time: e.target.value }))}
              style={{ maxWidth: 130 }}
            />
          </div>
          <div className="alarm-form-row">
            <label className="alarm-form-lbl">Label</label>
            <input
              className="input"
              value={draft.label}
              onChange={(e) => setDraft((s) => ({ ...s, label: e.target.value }))}
              placeholder="Wake up"
            />
          </div>
          <div className="alarm-form-row">
            <label className="alarm-form-lbl">Repeat</label>
            <div className="alarm-days">
              {DAY_LETTERS.map((letter, d) => (
                <button
                  key={d}
                  className={"alarm-day" + (draft.days.includes(d) ? " on" : "")}
                  onClick={() => toggleDay(d)}
                  type="button"
                  title={fmtDays([d])}
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>

          {camSupported ? (
            <>
              <div className="alarm-form-row">
                <label className="alarm-form-lbl">Scan to dismiss</label>
                <input
                  className="input"
                  value={draft.targetLabel}
                  onChange={(e) => setDraft((s) => ({ ...s, targetLabel: e.target.value }))}
                  placeholder="e.g. bathroom sink"
                />
              </div>
              <PhotoCapture
                value={draft.targetPhoto}
                onCapture={(url) => setDraft((s) => ({ ...s, targetPhoto: url }))}
              />
              <p className="alarm-form-hint">
                Photograph the object now. At alarm time you'll have to point the
                camera at it again to turn the alarm off. Leave blank for a plain
                tap-to-dismiss alarm.
              </p>
            </>
          ) : (
            <p className="alarm-form-hint">
              No camera on this device, so this alarm will use a plain tap to dismiss.
            </p>
          )}

          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            <button
              className="btn ghost sm"
              onClick={() => {
                setAdding(false);
                setEditingId(null);
                setDraft(EMPTY_DRAFT);
              }}
            >
              Cancel
            </button>
            <button className="btn primary sm" onClick={save}>
              {editingId ? "Save changes" : "Save alarm"}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn alarms-add" onClick={() => setAdding(true)}>
          <Icon.Plus width={14} height={14} /> Add alarm
        </button>
      )}
    </div>
  );
}
