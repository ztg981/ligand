/* Scroll a freshly-navigated element into view and briefly flash it, so a
   search result the user picked is obvious once the destination tab renders.
   Waits a frame so the target has a chance to mount before we look for it. */
export function flashElement(domId, { duration = 1600 } = {}) {
  if (typeof window === "undefined" || !domId) return;
  requestAnimationFrame(() => {
    const el = document.getElementById(domId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("search-flash");
    window.setTimeout(() => el.classList.remove("search-flash"), duration);
  });
}

export default flashElement;
