export function usesMobilePreferenceScope(nav = globalThis.navigator) {
  if (!nav) return false;
  const ua = nav.userAgent || "";
  // iPad intentionally follows the desktop preference record so Safari on
  // iPad, the PC website, and Electron all share one appearance/settings set.
  return /Android|iPhone|iPod/i.test(ua);
}
