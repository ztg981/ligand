import { useEffect, useState } from "react";
import { useLocalStorage } from "./useLocalStorage.js";
import { BADGES, earnedBadgeIds } from "../lib/badges.js";
import { ding } from "../lib/uiSounds.js";

/* ============================================================
   useBadges — unlock detection for achievement milestones.

   Stores unlocked badges in ligand.badges as [{ id, at }] (synced
   for logged-in users, local for guests). Given a memoized `stats`
   object it:
     - first run (key absent): silently grants whatever is already
       earned, so returning users aren't flooded with toasts for
       past milestones;
     - afterwards: any newly-earned badge is recorded, queued for a
       gentle toast, and a soft chime plays (ding() already respects
       the user's sound setting; the toast animation respects
       reduced-motion via the global CSS rule).
   ============================================================ */
export function useBadges(stats) {
  // null === never initialized (distinguishes "no badges yet" from first run)
  const [unlocked, setUnlocked] = useLocalStorage("ligand.badges", null);
  const [toastQueue, setToastQueue] = useState([]);

  useEffect(() => {
    if (!stats) return;
    const earned = earnedBadgeIds(stats);

    // First run: grant already-earned badges quietly (no toast / no chime).
    if (unlocked === null) {
      setUnlocked(earned.map((id) => ({ id, at: new Date().toISOString() })));
      return;
    }

    const known = new Set(unlocked.map((u) => u.id));
    const fresh = earned.filter((id) => !known.has(id));
    if (fresh.length === 0) return;

    const now = new Date().toISOString();
    setUnlocked([...unlocked, ...fresh.map((id) => ({ id, at: now }))]);
    setToastQueue((q) => [
      ...q,
      ...fresh.map((id) => BADGES.find((b) => b.id === id)).filter(Boolean),
    ]);
    try {
      ding();
    } catch {
      /* sound is best-effort */
    }
  }, [stats, unlocked, setUnlocked]);

  const dismissToast = (id) =>
    setToastQueue((q) => q.filter((b) => b.id !== id));

  const unlockedIds = (unlocked || []).map((u) => u.id);
  return { unlocked: unlocked || [], unlockedIds, toastQueue, dismissToast };
}

export default useBadges;
