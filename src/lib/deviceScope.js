export function usesMobilePreferenceScope(
  nav = globalThis.navigator,
  display = globalThis.screen
) {
  if (!nav) return false;
  const ua = nav.userAgent || "";

  // iPad intentionally follows the desktop preference record so Safari on
  // iPad, the PC website, and Electron all share one appearance/settings set.
  if (/iPad/i.test(ua)) return false;
  if (/Android|iPhone|iPod/i.test(ua)) return true;

  // iOS can give a Home Screen app a desktop-style Macintosh user agent. Use
  // the physical screen class as a fallback so an iPhone is not mistaken for
  // an iPad/Mac. The smallest current iPad side is comfortably above 600 CSS
  // pixels, while iPhones remain below it in either orientation.
  const platform = nav.platform || "";
  const isTouchAppleDesktopUa =
    /Macintosh|MacIntel/i.test(`${ua} ${platform}`) &&
    Number(nav.maxTouchPoints || 0) > 1;
  if (!isTouchAppleDesktopUa) return false;

  const sides = [Number(display?.width), Number(display?.height)].filter(
    (side) => Number.isFinite(side) && side > 0
  );
  if (sides.length < 2) return false;

  return Math.min(...sides) <= 600;
}
