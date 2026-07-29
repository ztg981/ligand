/* taskSort — how a task list is ordered, per filter tab.

   Each tab (All, Today, Urgent, a goal) keeps its OWN order, because the
   tabs are used for different things: "Today" wants what's due soonest,
   a goal's backlog often wants oldest-first so nothing rots at the bottom.
   One global setting forced those to share, which suited neither.

   Pure and unit-tested; the Tasks tab only stores the choice and renders. */

export const SORT_OPTIONS = [
  { value: "created", label: "Date created" },
  { value: "due", label: "Scheduled day" },
  { value: "name", label: "Name" },
];

export const DEFAULT_SORT = { by: "created", dir: "desc" };

/** Labels for the direction toggle — they only read right per sort key. */
export function directionLabel(by, dir) {
  if (by === "name") return dir === "asc" ? "A → Z" : "Z → A";
  if (by === "due") return dir === "asc" ? "Soonest first" : "Latest first";
  return dir === "asc" ? "Oldest first" : "Newest first";
}

export function normalizeSort(sort) {
  const by = SORT_OPTIONS.some((o) => o.value === sort?.by) ? sort.by : DEFAULT_SORT.by;
  const dir = sort?.dir === "asc" || sort?.dir === "desc" ? sort.dir : DEFAULT_SORT.dir;
  return { by, dir };
}

/**
 * A comparator for the chosen order.
 *
 * Task ids carry a base36 timestamp, so comparing them IS comparing creation
 * time — no separate field needed, and it stays stable for tasks made on the
 * same day (createdAt only has date precision).
 *
 * Unscheduled tasks always sink to the bottom of a "scheduled day" sort,
 * in both directions: they have no date, so putting them first when you
 * reverse would bury everything that does.
 */
export function taskComparator(sort) {
  const { by, dir } = normalizeSort(sort);
  const flip = dir === "asc" ? 1 : -1;

  return (a, b) => {
    if (by === "due") {
      const ad = a?.scheduledFor || null;
      const bd = b?.scheduledFor || null;
      if (!ad && !bd) return String(b?.id).localeCompare(String(a?.id));
      if (!ad) return 1; // undated last, whichever way the sort runs
      if (!bd) return -1;
      const cmp = ad.localeCompare(bd);
      return (cmp || String(a?.id).localeCompare(String(b?.id))) * flip;
    }

    if (by === "name") {
      const cmp = String(a?.text || "").localeCompare(String(b?.text || ""), undefined, {
        sensitivity: "base",
      });
      return (cmp || String(a?.id).localeCompare(String(b?.id))) * flip;
    }

    // created
    return String(a?.id).localeCompare(String(b?.id)) * flip;
  };
}
