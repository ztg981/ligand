/* Live transcript capture for journal recordings.

   The Web Speech API does not accept an existing media file, so transcript
   text has to be captured alongside the take. Safari still exposes the API
   under webkitSpeechRecognition; unsupported browsers simply return null and
   recording continues normally. */

export function speechRecognitionConstructor(scope = globalThis) {
  return scope?.SpeechRecognition || scope?.webkitSpeechRecognition || null;
}

export function startLiveTranscript({ scope = globalThis, onText } = {}) {
  const Recognition = speechRecognitionConstructor(scope);
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  let finalText = "";
  let latestText = "";
  let stopped = false;
  let resolveEnd;
  const ended = new Promise((resolve) => {
    resolveEnd = resolve;
  });

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex || 0; i < event.results.length; i += 1) {
      const phrase = event.results[i]?.[0]?.transcript || "";
      if (event.results[i]?.isFinal) finalText += `${phrase} `;
      else interim += `${phrase} `;
    }
    latestText = `${finalText}${interim}`.replace(/\s+/g, " ").trim();
    onText?.(latestText);
  };
  // Safari can end a continuous session after a quiet stretch. Keep listening
  // for the duration of the take, but never restart after the caller stops it.
  recognition.onend = () => {
    if (!stopped) {
      try {
        recognition.start();
        return;
      } catch {
        /* fall through and preserve what was captured */
      }
    }
    resolveEnd?.(latestText);
  };
  recognition.onerror = (event) => {
    if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event?.error)) {
      stopped = true;
      resolveEnd?.(latestText);
    }
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    async stop() {
      if (!stopped) {
        stopped = true;
        try {
          recognition.stop();
        } catch {
          resolveEnd?.(latestText);
        }
      }
      // A browser may never emit `end` after an interrupted permission flow.
      await Promise.race([ended, new Promise((resolve) => setTimeout(resolve, 500))]);
      return latestText;
    },
    cancel() {
      stopped = true;
      try {
        recognition.abort();
      } catch {
        /* already ended */
      }
    },
    text() {
      return latestText;
    },
  };
}
