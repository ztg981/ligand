import assert from "node:assert/strict";
import test from "node:test";
import {
  readCookieBridge,
  removeCookieBridge,
  writeCookieBridge,
} from "../src/lib/cookieBridge.js";

function cookieJar() {
  const values = new Map();
  return {
    get cookie() {
      return [...values].map(([key, value]) => `${key}=${value}`).join("; ");
    },
    set cookie(serialized) {
      const [pair, ...attributes] = serialized.split(";");
      const separator = pair.indexOf("=");
      const key = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      const expired = attributes.some((part) => part.trim() === "Max-Age=0");
      if (expired) values.delete(key);
      else values.set(key, value);
    },
  };
}

test("cookie bridge round-trips chunked JSON", () => {
  const doc = cookieJar();
  const value = JSON.stringify({ theme: "light", note: "x".repeat(7000) });
  writeCookieBridge("ligand.mobileTweaks", value, doc);
  assert.equal(readCookieBridge("ligand.mobileTweaks", doc), value);
});

test("cookie bridge removal clears the handoff", () => {
  const doc = cookieJar();
  writeCookieBridge("ligand.profile", JSON.stringify({ name: "Tiger" }), doc);
  removeCookieBridge("ligand.profile", doc);
  assert.equal(readCookieBridge("ligand.profile", doc), null);
});
