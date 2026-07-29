import { useEffect, useState } from "react";
import { useLocalStorage } from "./useLocalStorage.js";
import { BADGES, earnedBadgeIds, planBadgeUpdate } from "../lib/badges.js";

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
  // Badges whose celebration has already played. DEVICE-LOCAL and append-only
  // on purpose: `ligand.badges` is synced, so a cloud pull carrying a slightly
  // stale list used to revert a just-granted badge, which then looked freshly
  // earned and replayed its full-screen celebration on every app open.
  const [celebrated, setCelebrated] = useLocalStorage("ligand.badgesCelebrated", null);
  const [toastQueue, setToastQueue] = useState([]);

  useEffect(() => {
    if (!stats) return;
    const plan = planBadgeUpdate({
      earned: earnedBadgeIds(stats),
      allIds: BADGES.map((b) => b.id),
      unlocked,
      known,
      celebrated,
    });

    if (plan.nextUnlocked) setUnlocked(plan.nextUnlocked);
    if (plan.nextKnown) setKnown(plan.nextKnown);
    if (plan.nextCelebrated) setCelebrated(plan.nextCelebrated);
    if (plan.celebrate.length) {
      setToastQueue((q) => [
        ...q,
        ...plan.celebrate.map((id) => BADGES.find((b) => b.id === id)).filter(Boolean),
      ]);
    }
  }, [stats, unlocked, known, celebrated, setUnlocked, setKnown, setCelebrated]);

  const dismissToast = (id) =>
    setToastQueue((q) => q.filter((b) => b.id !== id));

  const unlockedIds = (unlocked || []).map((u) => u.id);
  return { unlocked: unlocked || [], unlockedIds, toastQueue, dismissToast };
}

export default useBadges;
