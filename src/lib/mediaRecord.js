/* mediaRecord — a thin, careful wrapper over MediaRecorder.

   Two deliberate shapes, matching how the phone camera behaves:

     • voice note  — mic on. iOS activates an audio session for this, which
       ducks or stops whatever you were listening to. There is NO web API to
       ask for "mix with others" (native apps use AVAudioSession; Safari does
       not expose it), so this interruption is a platform fact we surface in
       the UI rather than a bug we can fix.

     • quick clip  — video with `audio: false`. Because the mic is never
       requested, iOS generally leaves your music playing. This is the
       QuickTake-style capture.

   Codecs differ by browser and cannot be hardcoded: Safari records MP4
   (AAC/H.264), Chrome records WebM (Opus/VP8). `pickMimeType` walks a ladder
   and lets the browser pick the first it actually supports; it takes the
   support test as an argument so it stays unit-testable off-browser.

   Bitrates are deliberately low. These are journal notes, not production
   footage, and every byte lives in the user's device quota. */

export const MAX_AUDIO_MS = 2 * 60 * 1000; // 2 minutes
export const MAX_VIDEO_MS = 15 * 1000; // a quick hold-to-record clip
export const MAX_VIDEO_LOCKED_MS = 3 * 60 * 1000; // after you slide to lock

const AUDIO_TYPES = [
  "audio/webm;codecs=opus", // best voice quality per byte (Chrome/Firefox)
  "audio/ogg;codecs=opus",
  "audio/mp4", // Safari's only option
  "audio/webm",
];

const VIDEO_TYPES = [
  "video/mp4", // Safari, and plays back everywhere
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

const defaultIsSupported = (type) => {
  try {
    return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type) === true;
  } catch {
    return false;
  }
};

/** First supported container/codec for `kind`, or "" to let the browser choose. */
export function pickMimeType(kind, isSupported = defaultIsSupported) {
  const ladder = kind === "video" ? VIDEO_TYPES : AUDIO_TYPES;
  for (const type of ladder) {
    if (isSupported(type)) return type;
  }
  return ""; // MediaRecorder falls back to its own default
}

export function isRecordingSupported() {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Ask an active video track to change cameras without replacing the stream.
 * Replacing tracks after MediaRecorder starts is not portable (notably on
 * Safari), while applyConstraints keeps the recorder and preview attached to
 * the same track. Browsers that cannot do this reject cleanly so the UI can
 * explain that the take must be stopped before switching.
 */
export async function switchCameraTrack(stream, facingMode) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track || typeof track.applyConstraints !== "function") {
    throw new Error("Active camera switching is not supported here.");
  }
  await track.applyConstraints({ facingMode: { exact: facingMode } });
  return facingMode;
}

/**
 * Begin recording. Resolves to a controller once the stream is live:
 *
 *   { stream, mimeType, kind, stop(), cancel() }
 *
 * `stop()` resolves the recording via onStop({ blob, durationMs }); `cancel()`
 * discards it. Both always release the camera/mic — leaving a track live keeps
 * the recording indicator on and holds the audio session open.
 */
/**
 * Open a capture stream.
 *
 * Video records WITH sound by default — a silent clip of someone talking is
 * worthless, which is exactly what shipping `audio: false` produced. The
 * music-preserving variant is still available via `silent: true`, but it is now
 * an opt-in for when you deliberately want ambience over narration, not the
 * default that quietly eats your voice.
 *
 * The back camera is the default: journal clips are usually of something in
 * front of you, not a selfie.
 */
/* iOS audio-session juggling.

   Capturing needs a "play-and-record" session; the rest of the app wants
   "ambient" (obeys the silent switch, mixes with music). Declaring the right
   one around a take is also the closest the web gets to letting your music
   resume afterwards: handing the session back is what lets iOS reactivate
   whatever it interrupted. Nothing can force a resume — that call is iOS's. */
function setAudioSession(type) {
  try {
    if (navigator.audioSession) navigator.audioSession.type = type;
  } catch {
    /* unsupported — the browser keeps its default behaviour */
  }
}

export function releaseAudioSession() {
  setAudioSession("ambient");
}

export async function openStream({
  kind = "audio",
  facingMode = "environment",
  silent = false,
} = {}) {
  // A silent clip never touches the mic, so it needs no recording session and
  // leaves your music alone.
  if (!(kind === "video" && silent)) setAudioSession("play-and-record");
  const constraints =
    kind === "video"
      ? {
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: !silent,
        }
      : { audio: true };
  return navigator.mediaDevices.getUserMedia(constraints);
}

export async function startRecording({
  kind = "audio",
  maxMs = kind === "video" ? MAX_VIDEO_MS : MAX_AUDIO_MS,
  facingMode = "environment",
  // An already-open stream (e.g. a live camera preview). When supplied we
  // record from it and leave it running afterwards, so the preview survives
  // between takes; the caller owns closing it.
  stream: existingStream = null,
  onStop,
  onError,
} = {}) {
  if (!isRecordingSupported()) throw new Error("Recording is not supported here.");

  const ownsStream = !existingStream;
  const stream = existingStream || (await openStream({ kind, facingMode }));

  const mimeType = pickMimeType(kind);
  let recorder;
  try {
    recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      ...(kind === "video"
        ? { videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 64_000 }
        : { audioBitsPerSecond: 32_000 }),
    });
  } catch {
    // Some browsers reject the options object; retry bare before giving up.
    recorder = new MediaRecorder(stream);
  }

  const chunks = [];
  const startedAt = Date.now();
  let settled = false;
  let cancelled = false;
  let capTimer = null;

  const releaseStream = () => {
    // Only tear down a stream we opened. A caller-supplied preview stream stays
    // live so the camera doesn't blink off between takes.
    if (ownsStream) {
      stream.getTracks().forEach((track) => track.stop());
      releaseAudioSession(); // hand the session back so iOS can resume music
    }
    if (capTimer) clearTimeout(capTimer);
    capTimer = null;
  };

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  recorder.onerror = (event) => {
    releaseStream();
    if (!settled) {
      settled = true;
      onError?.(event?.error || new Error("Recording failed."));
    }
  };

  recorder.onstop = () => {
    releaseStream();
    if (settled) return;
    settled = true;
    if (cancelled) return;
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "application/octet-stream" });
    onStop?.({ blob, durationMs: Date.now() - startedAt, kind });
  };

  recorder.start();

  // Hard cap so a forgotten recording can't eat the device's storage.
  const armCap = (ms) => {
    if (capTimer) clearTimeout(capTimer);
    capTimer = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, Math.max(0, ms - (Date.now() - startedAt)));
  };
  armCap(maxMs);

  return {
    stream,
    kind,
    mimeType: recorder.mimeType || mimeType,
    startedAt,
    /** Raise the cap mid-take — used when a hold is slid into a locked take. */
    extendCap(ms) {
      armCap(ms);
    },
    switchCamera(facingMode) {
      return switchCameraTrack(stream, facingMode);
    },
    stop() {
      if (recorder.state === "recording") recorder.stop();
      else releaseStream();
    },
    cancel() {
      cancelled = true;
      if (recorder.state === "recording") recorder.stop();
      else releaseStream();
    },
  };
}
