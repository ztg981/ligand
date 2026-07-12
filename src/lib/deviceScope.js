export function isHandheldDevice(nav = globalThis.navigator) {
  if (!nav) return false;
  const ua = nav.userAgent || "";
  return (
    /Android|iPhone|iPad|iPod/i.test(ua) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)
  );
}
