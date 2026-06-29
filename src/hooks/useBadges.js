import { useEffect, useState } from "react";
import { useLocalStorage } from "./useLocalStorage.js";
import { BADGES, earnedBadgeIds } from "../lib/badges.js";

/* ============================================================
   useBadges — unlock detection for achievement milestones.

   Stores unlocked badges in ligand.badges as [{ id, at }] (synced
   for logged-in users, local for guests). Given a memoized `stats`
   object it:
     - first run (key absent): silently grants whatever is already
       earned, so returning users aren't flooded for past milestones;
     - when the badge SET grows (new definitions ship): any of those
       new badges already satisfied are granted silently too, so an
       upgrade doesn't trigger a storm of celebrations for things the
       user did long ago — ligand.badgesKnown tracks which definitions
       this install has already seen;
     - afterwards: any genuinely newly-earned badge is recorded and
       queued for a full celebration (the modal plays the chime).
   ============================================================ */
export function useBadges(stats) {
  // null === never initialized (distinguishes "no badges yet" from first run)
  const [unlocked, setUnlocked] = useLocalStorage("ligand.badges", null);
  // The set of badge ids this install has already evaluated at least once.
  const [known, setKnown] = useLocalStorage("ligand.badgesKnown", null);
  const [toastQueue, setToastQueue] = useState([]);

  useEffect(() => {
    if (!stats) return;
    const earned = earnedBadgeIds(stats);
    const allIds = BADGES.map((b) => b.id);
    const now = new Date().toISOString();

    // First run ever: grant already-earned badges quietly, record known set.
    if (unlocked === null) {
      setUnlocked(earned.map((id) => ({ id, at: now })));
      setKnown(allIds);
      return;
    }

    const knownSet = new Set(known || []);
    const unlockedSet = new Set(unlocked.map((u) => u.id));
    // Definitions brand-new to this install (incl. all of them when `known`
    // is absent, i.e. an existing user upgrading to a larger badge set).
    const newlyIntroduced = new Set(allIds.filter((id) => !knownSet.has(id)));

    const freshEarned = earned.filter((id) => !unlockedSet.has(id));
    const celebrate = freshEarned.filter((id) => !newlyIntroduced.has(id));

    if (freshEarned.length) {
      setUnlocked([...unlocked, ...freshEarned.map((id) => ({ id, at: now }))]);
    }
    if (newlyIntroduced.size) {
      setKnown(allIds); // we've now seen every current definition
    }
    if (celebrate.length) {
      setToastQueue((q) => [
        ...q,
        ...celebrate.map((id) => BADGES.find((b) => b.id === id)).filter(Boolean),
      ]);
    }
  }, [stats, unlocked, known, setUnlocked, setKnown]);

  const dismissToast = (id) =>
    setToastQueue((q) => q.filter((b) => b.id !== id));

  const unlockedIds = (unlocked || []).map((u) => u.id);
  return { unlocked: unlocked || [], unlockedIds, toastQueue, dismissToast };
}

export default useBadges;
