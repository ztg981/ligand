/* ============================================================
   Science-backed encouragement.
   ------------------------------------------------------------
   A small library of gentle, research-flavored facts about habits,
   focus, and motivation, shown one-at-a-time on the dashboard. Tone
   matches the rest of Ligand: encouraging, never preachy, ADHD-kind.

   Rotation is DETERMINISTIC by calendar day, so everyone sees the
   same stat all day and a fresh one tomorrow (no spammy reshuffling).
   ============================================================ */

export const SCIENCE_STATS = [
  "People who write their goals down are around 42% more likely to achieve them.",
  "The average new habit takes about 66 days to feel automatic — not 21. Be patient with yourself.",
  "Short breaks can improve focus by up to 40% compared with powering straight through.",
  "Progress — even tiny progress — releases dopamine. Every checkmark genuinely counts.",
  "Self-compassion after a setback is linked to more motivation than self-criticism.",
  "The Pomodoro technique reduces mental fatigue for most people who give it a try.",
  "Simply tracking a habit can increase follow-through by over 50%.",
  "Breaking a big task into smaller steps lowers the effort your brain expects to start.",
  "A two-minute version of almost any task is often enough to break the inertia of starting.",
  "Sleep — not extra hours at the desk — is when your brain locks in what you practiced today.",
  "Novelty sharpens focus; even a new spot to work can re-engage a wandering mind.",
  "Writing a worry down frees up the working memory it was quietly taking up.",
  "Missing a single day barely affects habit formation. Consistency beats perfection.",
  "Motivation often shows up after you start, not before. Action comes first.",
  "Celebrating small wins trains your brain to want to repeat them.",
  "Focusing on one thing can be up to 40% more productive than juggling several at once.",
];

/* The index for "today" — stable within a calendar day, advances daily.
   Mirrors the day-seed used elsewhere so the rotation feels app-wide. */
export function dailyStatIndex(len = SCIENCE_STATS.length, date = new Date()) {
  const seed =
    date.getFullYear() * 1000 + date.getMonth() * 50 + date.getDate();
  return seed % len;
}

export default SCIENCE_STATS;
