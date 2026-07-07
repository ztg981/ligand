import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons.jsx";
import { startAlarm } from "../lib/uiSounds.js";
import { imageSimilarity, imageBrightness } from "../lib/imageMatch.js";

/* AlarmOverlay — the full-screen takeover when an alarm fires.

   It rings a persistent alarm tone (and vibrates on mobile) until you dismiss
   it, and dismissal requires photographing the object you saved at setup — so
   you actually have to get up and walk to the sink/kettle/door to turn it off.

   Balance (the hard part of this feature):
   - Strict enough that you can't wave the phone at the ceiling to kill it.
   - Forgiving of real life: matching is brightness-invariant (a dark room still
     works if you frame the object), the live % tells you how close you are, and
     after several honest tries a deliberate press-and-hold escape hatch appears
     so no one is ever truly trapped by a bad camera or a moved object. */

const HOLD_MS = 3000; // press-and-hold duration for the escape hatch

export default function AlarmOverlay({ alarm, onDismiss }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState("");
  const [checking, setChecking] = useState(false);
  const [score, setScore] = useState(null); // last match %
  const [attempts, setAttempts] = useState(0);
  const [tooDark, setTooDark] = useState(false);
  const [holdPct, setHoldPct] = useState(0);
  const holdTimer = useRef(null);
  const holdStart = useRef(0);

  const hasTarget = Boolean(alarm?.targetPhoto);
  const threshold = alarm?.threshold ?? 70;

  // Ring the alarm for the overlay's whole lifetime. startAlarm ignores the UI
  // sound toggle on purpose — an alarm you set should always be audible.
  useEffect(() => {
    const stop = startAlarm();
    const vib = setInterval(() => {
      try { navigator.vibrate?.([400, 200, 400]); } catch { /* fine */ }
    }, 1500);
    return () => {
      stop?.();
      clearInterval(vib);
    };
  }, []);

  // Open the rear camera (only needed when a scan is required).
  useEffect(() => {
    if (!hasTarget) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamReady(true);
      } catch (err) {
        setCamError(
          err?.name === "NotAllowedError"
            ? "Camera access was blocked. Allow it to dismiss with a scan."
            : "No camera available on this device."
        );
      }
    })();
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [hasTarget]);

  const captureDataUrl = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.8);
  };

  const scan = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const shot = captureDataUrl();
      if (!shot) return;
      const bright = await imageBrightness(shot);
      setTooDark(bright < 25);
      const sim = await imageSimilarity(alarm.targetPhoto, shot);
      setScore(sim);
      setAttempts((n) => n + 1);
      if (sim >= threshold) {
        onDismiss?.();
      }
    } finally {
      setChecking(false);
    }
  };

  // Escape-hatch hold handlers (only shown after several honest attempts).
  const startHold = () => {
    holdStart.current = Date.now();
    holdTimer.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - holdStart.current) / HOLD_MS) * 100);
      setHoldPct(pct);
      if (pct >= 100) {
        clearInterval(holdTimer.current);
        onDismiss?.();
      }
    }, 40);
  };
  const endHold = () => {
    clearInterval(holdTimer.current);
    setHoldPct(0);
  };
  useEffect(() => () => clearInterval(holdTimer.current), []);

  // The hold-to-dismiss hatch appears after several honest scan attempts —
  // or IMMEDIATELY when the camera can't open at all (blocked permission /
  // no camera), since scanning is impossible then and the user must never
  // be trapped with un-stoppable audio.
  const showEscape = attempts >= 4 || Boolean(camError);
  const now = new Date();
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return createPortal(
    <div className="alarm-overlay" role="alertdialog" aria-modal="true" aria-label="Alarm">
      <div className="alarm-top">
        <div className="alarm-time">{timeStr}</div>
        <div className="alarm-label">{alarm.label || "Alarm"}</div>
        <div className="alarm-ring-ic"><Icon.Bell /></div>
      </div>

      {hasTarget ? (
        <div className="alarm-scan">
          <div className="alarm-scan-instruction">
            Scan {alarm.targetLabel ? <strong>your {alarm.targetLabel}</strong> : "the object you saved"} to turn it off
          </div>

          <div className="alarm-cam-wrap">
            {camError ? (
              <div className="alarm-cam-error">{camError}</div>
            ) : (
              <>
                <video ref={videoRef} className="alarm-cam" playsInline muted />
                <div className="alarm-cam-frame" aria-hidden="true" />
                {/* Reference thumbnail of what to look for. */}
                <img className="alarm-cam-target" src={alarm.targetPhoto} alt="Target" />
              </>
            )}
          </div>

          {/* Live feedback */}
          {score != null && (
            <div className={"alarm-feedback" + (score >= threshold ? " ok" : "")}>
              <div className="alarm-meter">
                <div
                  className="alarm-meter-fill"
                  style={{ width: `${Math.min(100, (score / threshold) * 100)}%` }}
                />
              </div>
              <div className="alarm-feedback-text">
                {score >= threshold
                  ? "Match! Turning off…"
                  : `${score}% match, need ${threshold}%. ${score > threshold - 20 ? "So close, hold steadier." : "Point right at it."}`}
              </div>
            </div>
          )}
          {tooDark && (
            <div className="alarm-hint">It's dark. Turn on a light so the camera can see.</div>
          )}

          <button
            className="btn primary alarm-capture"
            onClick={scan}
            disabled={!camReady || checking}
          >
            <Icon.Search width={16} height={16} /> {checking ? "Checking…" : "Scan to dismiss"}
          </button>

          {showEscape && (
            <div className="alarm-escape">
              <div className="alarm-escape-lbl">Can't scan right now?</div>
              <button
                className="alarm-escape-btn"
                onMouseDown={startHold}
                onMouseUp={endHold}
                onMouseLeave={endHold}
                onTouchStart={startHold}
                onTouchEnd={endHold}
              >
                <span className="alarm-escape-fill" style={{ width: `${holdPct}%` }} />
                <span className="alarm-escape-text">Hold to dismiss</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        // No target photo saved — a plain dismiss (still forces a tap).
        <div className="alarm-scan">
          <button className="btn primary alarm-capture" onClick={onDismiss}>
            Turn off alarm
          </button>
        </div>
      )}

      <div className="alarm-foot">
        Ligand alarms only ring while the app is open. They can't wake a sleeping device.
      </div>
    </div>,
    document.body
  );
}
