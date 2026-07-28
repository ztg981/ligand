import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons.jsx";
import {
  isRecordingSupported,
  startRecording,
  formatDuration,
  MAX_AUDIO_MS,
  MAX_VIDEO_MS,
} from "../lib/mediaRecord.js";
import { putMedia, getMediaUrl, deleteMedia, formatBytes } from "../lib/mediaStore.js";
import { fetchMedia } from "../lib/mediaSync.js";

/* JournalMedia — recording controls for the composer, and playback for saved
   entries.

   The two capture gestures mirror the phone camera on purpose:
     • Voice note  — tap to start, tap again to stop.
     • Quick clip  — press AND HOLD, release to stop (like QuickTake).

   The clip is recorded with the microphone switched off, which is what lets
   your music keep playing; a voice note necessarily takes the mic, so iOS will
   pause whatever is playing. That trade-off is stated in the UI instead of
   surprising the user afterwards. */

const MUSIC_NOTE = "Recording audio pauses music. A clip (hold) leaves it playing.";

/* ---------- capture (composer) ---------- */

export function MediaCapture({ media = [], onAdd, onRemove, userId = null }) {
  const supported = isRecordingSupported();
  const [busy, setBusy] = useState(null); // null | "audio" | "video"
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const controllerRef = useRef(null);
  const holdingRef = useRef(false);
  const previewRef = useRef(null);
  const timerRef = useRef(null);

  // Always release the camera/mic if this unmounts mid-recording.
  useEffect(
    () => () => {
      controllerRef.current?.cancel();
      clearInterval(timerRef.current);
    },
    []
  );

  const tick = (startedAt) => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed(Date.now() - startedAt), 200);
  };

  const finish = async ({ blob, durationMs, kind }) => {
    clearInterval(timerRef.current);
    setBusy(null);
    setElapsed(0);
    controllerRef.current = null;
    const ref = await putMedia(blob, { kind, durationMs });
    if (ref) onAdd?.(ref);
    else setError("Couldn't save that recording on this device.");
  };

  const begin = async (kind) => {
    if (busy) return;
    setError("");
    setBusy(kind);
    try {
      const controller = await startRecording({
        kind,
        onStop: finish,
        onError: () => {
          clearInterval(timerRef.current);
          setBusy(null);
          setError("Recording stopped unexpectedly.");
        },
      });
      // A hold released before the camera warmed up should not start a clip.
      if (kind === "video" && !holdingRef.current) {
        controller.cancel();
        setBusy(null);
        return;
      }
      controllerRef.current = controller;
      tick(controller.startedAt);
      if (kind === "video" && previewRef.current) {
        previewRef.current.srcObject = controller.stream;
        previewRef.current.play?.().catch(() => {});
      }
    } catch (err) {
      setBusy(null);
      setError(
        err?.name === "NotAllowedError"
          ? "Ligand needs permission to use the microphone or camera."
          : "Couldn't start recording here."
      );
    }
  };

  const stop = () => {
    controllerRef.current?.stop();
    controllerRef.current = null;
  };

  // Hold-to-record wiring for the clip button.
  const holdStart = (e) => {
    e.preventDefault();
    holdingRef.current = true;
    begin("video");
  };
  const holdEnd = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    if (busy === "video") stop();
  };

  if (!supported) {
    return (
      <p className="jm-note" style={{ marginTop: 8 }}>
        This browser can't record audio or video. You can still attach images.
      </p>
    );
  }

  const cap = busy === "video" ? MAX_VIDEO_MS : MAX_AUDIO_MS;

  return (
    <div className="jm-capture">
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className={"btn ghost sm" + (busy === "audio" ? " jm-recording" : "")}
          onClick={() => (busy === "audio" ? stop() : begin("audio"))}
          disabled={busy === "video"}
          title="Record a voice note"
        >
          <Icon.Mic width={13} height={13} />
          {busy === "audio" ? "Stop" : "Voice note"}
        </button>

        <button
          type="button"
          className={"btn ghost sm" + (busy === "video" ? " jm-recording" : "")}
          disabled={busy === "audio"}
          onPointerDown={holdStart}
          onPointerUp={holdEnd}
          onPointerLeave={holdEnd}
          onPointerCancel={holdEnd}
          onContextMenu={(e) => e.preventDefault()}
          title="Hold to record a short clip (keeps your music playing)"
        >
          <Icon.Video width={13} height={13} />
          {busy === "video" ? "Recording…" : "Hold for clip"}
        </button>

        {busy && (
          <span className="jm-timer mono" role="status">
            {formatDuration(elapsed)} <span className="jm-cap">/ {formatDuration(cap)}</span>
          </span>
        )}
      </div>

      {busy === "video" && (
        <video ref={previewRef} className="jm-preview" muted playsInline autoPlay />
      )}

      {!busy && <p className="jm-note">{MUSIC_NOTE}</p>}
      {error && (
        <p className="jm-note jm-error" role="alert">
          {error}
        </p>
      )}

      {media.length > 0 && (
        <MediaStrip media={media} onRemove={onRemove} userId={userId} />
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
    <div className={"jm-item" + (item.kind === "video" ? " is-video" : "")}>
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
      {onRemove && (
        <button type="button" className="jm-x" onClick={remove} title="Remove recording">
          <Icon.Close width={11} height={11} />
        </button>
      )}
    </div>
  );
}

export function MediaStrip({ media = [], onRemove, userId = null }) {
  if (!media.length) return null;
  return (
    <div className="jm-strip">
      {media.map((item) => (
        <MediaItem key={item.id} item={item} onRemove={onRemove} userId={userId} />
      ))}
    </div>
  );
}

export default MediaCapture;
