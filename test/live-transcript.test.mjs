import { test } from "node:test";
import assert from "node:assert/strict";
import {
  speechRecognitionConstructor,
  startLiveTranscript,
} from "../src/lib/liveTranscript.js";

test("speech recognition supports Safari's prefixed constructor", () => {
  class SafariRecognition {}
  assert.equal(
    speechRecognitionConstructor({ webkitSpeechRecognition: SafariRecognition }),
    SafariRecognition
  );
});

test("live transcript combines final and interim speech", async () => {
  let instance;
  class Recognition {
    constructor() { instance = this; }
    start() {}
    stop() { this.onend?.(); }
    abort() {}
  }
  const seen = [];
  const capture = startLiveTranscript({
    scope: { SpeechRecognition: Recognition },
    onText: (text) => seen.push(text),
  });
  instance.onresult({
    resultIndex: 0,
    results: [
      Object.assign([{ transcript: "hello world" }], { isFinal: true }),
      Object.assign([{ transcript: "still talking" }], { isFinal: false }),
    ],
  });
  assert.equal(await capture.stop(), "hello world still talking");
  assert.deepEqual(seen, ["hello world still talking"]);
});

test("unsupported browsers leave transcription disabled", () => {
  assert.equal(startLiveTranscript({ scope: {} }), null);
});
