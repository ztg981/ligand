import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons.jsx";
import {
  isRecordingSupported,
  startRecording,
  openStream,
  releaseAudioSession,
  formatDuration,
  MAX_AUDIO_MS,
  MAX_VIDEO_MS,
  MAX_VIDEO_LOCKED_MS,
} from "../lib/mediaRecord.js";
import { putMedia, getMediaUrl, deleteMedia, formatBytes } from "../lib/mediaStore.js";
import { fetchMedia } from "../lib/mediaSync.js";
import { posterFromVideo } from "../lib/videoPoster.js";
import { startLiveTranscript } from "../lib/liveTranscript.js";

/* JournalMedia — recording controls for the composer, and playback for saved
   entries.

   The two capture gestures mirror the phone camera on purpose:
     • Voice note  — tap to start, tap again to stop.
     • Quick clip  — press AND HOLD, release to stop (like QuickTake).

   The clip is recorded with the microphone switched off, which is what lets
   your music keep playing; a voice note necessarily takes the mic, so iOS will
   pause whatever is playing. That trade-off is stated in the UI instead of
   surprising the user afterwards. */

/* ---------- the capture sheet (camera-app style) ----------

   A full-screen recorder rather than inline buttons. The inline press-and-hold
   was unusable on a phone: holding a button inside a text form triggers the
   browser's own text-selection and callout gestures, so the "hold" fought the
   page instead of driving the recorder.

   This mirrors the camera app people already know — mode switch, live preview,
   one big shutter, a timer, and an obvious way out — and every control opts out
   of touch selection so a press does exactly one thing. */

const LOCK_SLIDE_PX = 56; // how far right you drag before the take locks
const TAP_MS = 350; // below this a press is a tap ("start"), not a hold

function CaptureSheet({ onClose, onSaved }) {
  const [mode, setMode] = useState("audio"); // "audio" | "video"
  const [facing, setFacing] = useState("environment"); // back camera by default
  const [silent, setSilent] = useState(false); // opt-in music-preserving clip
  const [transcribe, setTranscribe] = useState(false); // explicit opt-in; browsers may use an online speech service
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [slide, setSlide] = useState(0); // px dragged toward the lock
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [switchingCamera, setSwitchingCamera] = useState(false);

  const controllerRef = useRef(null);
  const previewStreamRef = useRef(null);
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const closedRef = useRef(false);
  const holdRef = useRef({ active: false, x: 0, locked: false });
  const transcriptRef = useRef("");
  const transcriberRef = useRef(null);

  const cap =
    mode === "video" ? (locked ? MAX_VIDEO_LOCKED_MS : MAX_VIDEO_MS) : MAX_AUDIO_MS;

  /* Say how to FIX it, not just that it failed.
     Once a site has been denied, the browser stops prompting entirely — so
     "needs permission" with no dialog is exactly what the user sees, and the
     only way back is the padlock/camera control in the address bar. */
  const permissionMessage = (err) =>
    err?.name === "NotAllowedError"
      ? "Camera and microphone are blocked for this site. Click the camera (or padlock) icon in the address bar, allow them, then reload."
      : err?.name === "NotFoundError"
        ? "No camera or microphone found on this device."
        : err?.name === "NotReadableError"
          ? "Another app is using the camera or microphone. Close it and try again."
          : "Couldn't start recording here.";

  const releasePreview = () => {
    if (!previewStreamRef.current) return;
    previewStreamRef.current.getTracks().forEach((t) => t.stop());
    previewStreamRef.current = null;
    // Give the audio session back so iOS can resume whatever it interrupted.
    releaseAudioSession();
  };

  // Everything shuts down on the way out — a live track keeps the camera light
  // on and holds the audio session open.
  useEffect(
    () => () => {
      closedRef.current = true;
      controllerRef.current?.cancel();
      transcriberRef.current?.cancel();
      releasePreview();
      clearInterval(timerRef.current);
    },
    []
  );

  // Video mode opens the camera immediately so you can frame the shot, exactly
  // like the camera app. The mic is NOT requested here, so your music keeps
  // playing while you line things up (and for the whole clip).
  useEffect(() => {
    let cancelled = false;
    if (mode !== "video") {
      releasePreview();
      return () => {
        cancelled = true;
      };
    }
    // Updating `facing` after an in-take applyConstraints switch must not tear
    // down the exact stream MediaRecorder is still consuming.
    if (controllerRef.current) return;
    (async () => {
      try {
        releasePreview(); // flipping camera or muting reopens the stream
        const stream = await openStream({ kind: "video", facingMode: facing, silent });
        if (cancelled || closedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        previewStreamRef.current = stream;
        setError("");
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play?.().catch(() => {});
        }
      } catch (err) {
        if (!cancelled) setError(permissionMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, facing, silent]);

  const finish = async ({ blob, durationMs, kind }) => {
    clearInterval(timerRef.current);
    setRecording(false);
    setLocked(false);
    setSlide(0);
    holdRef.current = { active: false, x: 0, locked: false };
    setElapsed(0);
    controllerRef.current = null;
    setSaving(true);
    const transcript = (await transcriberRef.current?.stop()) || transcriptRef.current;
    transcriberRef.current = null;
    const ref = await putMedia(blob, { kind, durationMs, transcript });
    setSaving(false);
    if (ref) {
      onSaved?.(ref);
      onClose?.();
    } else {
      setError("Couldn't save that recording on this device.");
    }
  };

  const start = async () => {
    if (recording || saving) return;
    setError("");
    try {
      const controller = await startRecording({
        kind: mode,
        facingMode: facing,
        stream: mode === "video" ? previewStreamRef.current : null,
        onStop: finish,
        onError: () => {
          clearInterval(timerRef.current);
          transcriberRef.current?.stop();
          setRecording(false);
          setError("Recording stopped unexpectedly.");
        },
      });
      // Released before the recorder was ready — honour the release.
      if (!holdRef.current.active && !holdRef.current.locked) {
        controller.cancel();
        return;
      }
      controllerRef.current = controller;
      transcriptRef.current = "";
      // Speech recognition is best-effort and never gates recording. A silent
      // clip intentionally does not touch the microphone, so it stays off.
      if (mode === "video" && transcribe && !silent) {
        transcriberRef.current = startLiveTranscript({
          onText: (text) => {
            transcriptRef.current = text;
          },
        });
      }
      setRecording(true);
      clearInterval(timerRef.current);
      timerRef.current = setInterval(
        () => setElapsed(Date.now() - controller.startedAt),
        200
      );
    } catch (err) {
      setError(permissionMessage(err));
    }
  };

  const stop = () => {
    transcriberRef.current?.stop();
    controllerRef.current?.stop();
    controllerRef.current = null;
  };

  /* Hold to record, slide right to lock — the camera-app gesture.

     Holding keeps the take alive only while your finger is down, which suits a
     quick clip. Dragging past the lock threshold latches it so you can let go
     and keep filming; the cap rises from 15s to 3 minutes at the same moment,
     because "I meant this to be short" and "I meant this to run" are exactly
     what the two gestures distinguish. */
  const onShutterDown = (e) => {
    if (saving) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // Pressing a RUNNING take is ambiguous until you let go: a tap means stop,
    // but a slide means lock. So arm the gesture and decide on release —
    // that's what keeps "tap to start, then slide to lock" possible.
    if (recording) {
      // Once locked, the shutter is an unambiguous stop control. Stop on down
      // so a lost pointer-up cannot strand the user in a finished take.
      if (locked) {
        stop();
        return;
      }
      holdRef.current = {
        active: true,
        x: e.clientX,
        locked,
        at: Date.now(),
        onRunning: true,
      };
      setSlide(0);
      return;
    }
    holdRef.current = {
      active: true,
      x: e.clientX,
      locked: false,
      at: Date.now(),
      onRunning: false,
    };
    setSlide(0);
    start();
  };

  const onShutterMove = (e) => {
    const hold = holdRef.current;
    // Don't track the slide until a take is actually running — otherwise a
    // denied permission still "locks", showing a recording UI for nothing.
    if (!hold.active || hold.locked || !controllerRef.current) return;
    const dx = Math.max(0, e.clientX - hold.x);
    setSlide(Math.min(dx, LOCK_SLIDE_PX));
    if (dx >= LOCK_SLIDE_PX) {
      hold.locked = true;
      hold.active = false;
      setLocked(true);
      // The slide is only the locking gesture; the stop button belongs back in
      // its centered home as soon as the take latches.
      setSlide(0);
      // Locking is a promise of a longer take, so lift the cap to match.
      controllerRef.current?.extendCap?.(
        mode === "video" ? MAX_VIDEO_LOCKED_MS : MAX_AUDIO_MS
      );
    }
  };

  /* Releasing only ENDS the take if you were actually holding.

     A quick tap means "start recording", so the take simply keeps running —
     still on the SHORT cap, and still lockable by pressing again and sliding,
     because tapping shouldn't silently commit you to a three-minute take. Tap
     again to stop. Only a genuine hold ends on release. */
  const onShutterUp = () => {
    const hold = holdRef.current;
    if (!hold.active) return; // already locked, or never started
    hold.active = false;
    setSlide(0);
    if (!controllerRef.current) return;

    const wasTap = Date.now() - (hold.at || 0) < TAP_MS;
    if (hold.onRunning) {
      // Pressed a take that was already running: a tap stops it, while a slide
      // will have locked it on the way (so leave that alone).
      if (wasTap && !hold.locked) stop();
      return;
    }
    if (wasTap) return; // tap-start: leave it running, unlocked, on the short cap
    stop();
  };

  const close = () => {
    if (recording) controllerRef.current?.cancel();
    transcriberRef.current?.cancel();
    onClose?.();
  };

  const flipCamera = async () => {
    const next = facing === "environment" ? "user" : "environment";
    if (!recording) {
      setFacing(next);
      return;
    }
    setSwitchingCamera(true);
    setError("");
    try {
      const controller = controllerRef.current;
      if (!controller) return;
      await controller.switchCamera(next);
      setFacing(next);
    } catch {
      setError("This browser can't switch cameras during a recording. Stop the take, switch cameras, then start again.");
    } finally {
      setSwitchingCamera(false);
    }
  };

  // Escape leaves — never trap someone inside a recorder.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return createPortal(
    <div className="jm-sheet" role="dialog" aria-modal="true" aria-label="Record">
      <header className="jm-sheet-top">
        <button type="button" className="jm-sheet-x" onClick={close} aria-label="Close">
          <Icon.Close width={16} height={16} />
        </button>
        <span className={"jm-sheet-timer mono" + (recording ? " on" : "")}>
          {recording && <i className="jm-rec-dot" aria-hidden="true" />}
          {formatDuration(elapsed)} <span className="jm-cap">/ {formatDuration(cap)}</span>
          {locked && <span className="jm-lock-tag">Locked</span>}
        </span>
        {mode === "video" ? (
          <button
            type="button"
            className={"jm-tool" + (silent ? " off" : "")}
            onClick={() => {
              if (!silent) setTranscribe(false);
              setSilent((s) => !s);
            }}
            disabled={recording}
            title={
              silent
                ? "Sound off — your music keeps playing"
                : "Sound on — recording will pause your music"
            }
            aria-label={silent ? "Turn clip sound on" : "Turn clip sound off"}
          >
            {silent ? <Icon.VolumeOff width={16} height={16} /> : <Icon.Volume width={16} height={16} />}
          </button>
        ) : (
          <span className="jm-tool-spacer" />
        )}
      </header>

      <div className="jm-sheet-stage">
        {mode === "video" ? (
          <video ref={videoRef} className="jm-sheet-video" muted playsInline autoPlay />
        ) : (
          <div className={"jm-orb" + (recording ? " on" : "")} aria-hidden="true">
            <Icon.Mic width={38} height={38} />
          </div>
        )}
        {error && (
          <p className="jm-sheet-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <footer className="jm-sheet-bottom">
        {/* Mode can't change mid-take — that would throw away the recording. */}
        <div className="jm-modes" role="tablist" aria-label="What to record">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "audio"}
            className={mode === "audio" ? "on" : ""}
            disabled={recording}
            onClick={() => setMode("audio")}
          >
            Voice
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "video"}
            className={mode === "video" ? "on" : ""}
            disabled={recording}
            onClick={() => setMode("video")}
          >
            Video
          </button>
        </div>

        {mode === "video" && (
          <button
            type="button"
            className={"jm-transcribe-toggle" + (transcribe ? " on" : "")}
            onClick={() => setTranscribe((value) => !value)}
            disabled={recording || silent}
            title={
              silent
                ? "Turn clip sound on to add a transcript"
                : "Your browser may use its online speech service to create the transcript"
            }
            aria-pressed={transcribe}
          >
            <Icon.Note width={13} height={13} />
            {transcribe ? "Transcript on" : "Add transcript"}
          </button>
        )}

        {/* Shutter + the lock rail it slides along, with the camera flip
           parked bottom-right of it the way the camera app does. */}
        <div className={"jm-shutter-wrap" + (recording && !locked ? " sliding" : "")}>
          <button
            type="button"
            className={
              "jm-shutter" +
              (recording ? " recording" : "") +
              (locked ? " locked" : "")
            }
            style={slide ? { transform: `translateX(${slide}px)` } : undefined}
            onPointerDown={onShutterDown}
            onPointerMove={onShutterMove}
            onPointerUp={onShutterUp}
            onPointerCancel={onShutterUp}
            onContextMenu={(e) => e.preventDefault()}
            disabled={saving}
            aria-label={recording ? "Stop recording" : "Hold to record, slide right to lock"}
          >
            <span className="jm-shutter-core" />
          </button>
          {recording && !locked && (
            <span className="jm-lock-rail" aria-hidden="true">
              <Icon.Lock width={13} height={13} />
              <Icon.Arrow width={13} height={13} />
            </span>
          )}
          {mode === "video" && (
            <button
              type="button"
              className="jm-flip"
              onClick={flipCamera}
              disabled={saving || switchingCamera}
              title="Switch camera"
              aria-label="Switch camera"
            >
              <Icon.Reset width={22} height={22} />
            </button>
          )}
        </div>

        <p className="jm-sheet-hint">
          {saving
            ? "Saving…"
            : locked
              ? "Locked — tap to stop"
              : recording
                ? "Tap to stop · press and slide right to lock for longer"
                : mode === "video" && silent
                  ? "Tap to record, or hold. No sound, so your music keeps playing."
                  : "Tap to record · hold and release for a quick one"}
        </p>
      </footer>
    </div>,
    document.body
  );
}

/* ---------- capture (composer) ---------- */

export function MediaCapture({ media = [], onAdd, onRemove, userId = null }) {
  const supported = isRecordingSupported();
  const [open, setOpen] = useState(false);

  if (!supported) {
    return (
      <p className="jm-note" style={{ marginTop: 8 }}>
        This browser can't record audio or video. You can still attach images.
      </p>
    );
  }

  return (
    <div className="jm-capture">
      <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>
        <Icon.Mic width={13} height={13} /> Record
      </button>

      {open && (
        <CaptureSheet onClose={() => setOpen(false)} onSaved={(ref) => onAdd?.(ref)} />
      )}

      {media.length > 0 && (
        <MediaStrip media={media} onRemove={onRemove} userId={userId} expanded />
      )}
    </div>
  );
}

/* ---------- playback ---------- */

function MediaItem({ item, onRemove, userId = null }) {
  const [url, setUrl] = useState(null);
  const [missing, setMissing] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl = null;
    const show = (next) => {
      if (revoked) {
        if (next) URL.revokeObjectURL(next);
        return true;
      }
      objectUrl = next;
      setUrl(next);
      return false;
    };

    (async () => {
      const local = await getMediaUrl(item.id);
      if (local) return show(local);
      // Not on this device. If it was uploaded and we're signed in, pull it
      // down once and cache it locally so it plays offline from now on.
      if (userId && item.remotePath) {
        if (!revoked) setFetching(true);
        const blob = await fetchMedia(userId, item);
        if (!revoked) setFetching(false);
        if (blob) return show(URL.createObjectURL(blob));
      }
      if (!revoked) setMissing(true);
      return false;
    })();

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // Keyed on identity + where the bytes live, not the whole `item`: a
    // changed duration or size must not re-fetch and re-mint the object URL
    // (which would restart playback mid-listen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.remotePath, userId]);

  const remove = async () => {
    await deleteMedia(item.id);
    onRemove?.(item.id);
  };

  return (
    <div
      className={
        "jm-item" +
        (item.kind === "video" ? " is-video" : "") +
        (item.transcript ? " has-transcript" : "")
      }
    >
      {fetching ? (
        <span className="jm-note">Fetching this recording…</span>
      ) : missing ? (
        <span className="jm-note">
          {/* Either it was never uploaded (recorded in guest mode / offline) or
             we are signed out on this device, so there is nothing to fetch. */}
          {item.remotePath
            ? "Sign in to play this recording."
            : "This recording is only on the device it was made on."}
        </span>
      ) : item.kind === "video" ? (
        <video className="jm-video" src={url || undefined} controls playsInline preload="metadata" />
      ) : (
        <audio className="jm-audio" src={url || undefined} controls preload="metadata" />
      )}
      <span className="jm-meta">
        {formatDuration(item.durationMs || 0)}
        {item.size ? ` · ${formatBytes(item.size)}` : ""}
      </span>
      {item.transcript && (
        <details className="jm-transcript">
          <summary>Transcript</summary>
          <p>{item.transcript}</p>
          <small>Captured automatically and may contain mistakes.</small>
        </details>
      )}
      {onRemove && (
        <button type="button" className="jm-x" onClick={remove} title="Remove recording">
          <Icon.Close width={11} height={11} />
        </button>
      )}
    </div>
  );
}

/* In a saved entry the players are COLLAPSED to a one-line chip: a video box
   in every entry turned the journal into a wall of black rectangles. The chip
   says what it is and how long, and expands on click. In the composer
   (`expanded`) they stay open, since you've just made them. */
/* A collapsed clip keeps its first frame.

   Fully hiding it behind a text chip lost the one thing that tells clips apart
   at a glance; showing the full player made every entry a black rectangle.
   A small poster is the middle: the frame is drawn by seeking the video to its
   first moment with `preload="metadata"`, so nothing extra is stored. */
/* A clip's tile in the strip: a real frame from the video, not a <video>.

   The first attempt rendered `<video src={url + "#t=0.1"} preload="metadata">`
   and got a black rectangle every time — metadata preloading fetches no
   picture at all, the media fragment is ignored on blob: URLs, and frame zero
   of a recording is usually black regardless. The frame is now fetched
   deliberately and drawn to a canvas (see lib/videoPoster.js), which also
   means one <img> per row instead of one live decoder. */
function VideoThumb({ item, userId, onOpen }) {
  const [poster, setPoster] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    let objectUrl = null;
    (async () => {
      const local = await getMediaUrl(item.id);
      let url = local;
      if (!url && userId && item.remotePath) {
        const blob = await fetchMedia(userId, item);
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          url = objectUrl;
        }
      } else if (local) {
        objectUrl = local;
      }
      if (dead || !url) {
        if (!dead) setFailed(true);
        return;
      }
      const frame = await posterFromVideo(url);
      if (dead) return;
      if (frame) setPoster(frame);
      else setFailed(true);
    })();
    return () => {
      dead = true;
      // The frame is a self-contained data URL, so the object URL has done its
      // job the moment the poster exists and can be released either way.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // Keyed on identity and where the bytes live, not the whole item — a
    // changed duration must not re-fetch and redraw the poster.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.remotePath, userId]);

  return (
    <button type="button" className="jm-thumb" onClick={onOpen} title="Play clip">
      {poster ? (
        <img className="jm-thumb-img" src={poster} alt="" draggable={false} />
      ) : (
        <span className={"jm-thumb-fallback" + (failed ? "" : " loading")}>
          <Icon.Video width={18} height={18} />
        </span>
      )}
      <span className="jm-thumb-play"><Icon.Play width={14} height={14} /></span>
      <span className="jm-thumb-time mono">{formatDuration(item.durationMs || 0)}</span>
    </button>
  );
}

export function MediaStrip({ media = [], onRemove, userId = null, expanded = false }) {
  const [openIds, setOpenIds] = useState(() => (expanded ? media.map((m) => m.id) : []));
  if (!media.length) return null;
  const toggle = (id) =>
    setOpenIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <div className="jm-strip">
      {media.map((item) =>
        openIds.includes(item.id) ? (
          <MediaItem key={item.id} item={item} onRemove={onRemove} userId={userId} />
        ) : (
          item.kind === "video" ? (
            <VideoThumb
              key={item.id}
              item={item}
              userId={userId}
              onOpen={() => toggle(item.id)}
            />
          ) : (
            <button
              key={item.id}
              type="button"
              className="jm-chip"
              onClick={() => toggle(item.id)}
              title="Play"
            >
              <Icon.Mic width={13} height={13} />
              <span>Voice note</span>
              <span className="jm-chip-time mono">{formatDuration(item.durationMs || 0)}</span>
            </button>
          )
        )
      )}
    </div>
  );
}

export default MediaCapture;
