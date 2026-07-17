/* ============================================================
   Activities — pure helpers for the universal activity log.
   ------------------------------------------------------------
   The activity log answers "what did I just do?" for everything
   the dedicated logs don't cover: sports, games, scrolling,
   chores, people time, rest. It exists so the phone-check reflex
   lands somewhere useful — open Ligand, log the last thing,
   see your day taking shape — instead of dissolving into a feed.

   Tone rules (tested):
   - `feel` describes what the time did FOR the user (energized /
     drained), never a verdict on the user.
   - No copy here may call time "wasted" or the user "lazy" —
     an hour of games you chose is rest; an hour you didn't
     choose is information. Either way it's just a row.
   No React, no storage — unit-tested pure functions only.
   ============================================================ */

import { shiftDay, todayKey } from "./model.js";

/* Categories. Colors line up with the day-dial's BLOCK_CATEGORIES family
   so the Day tab reads as one system. Each carries quick-pick suggestions —
   one tap fills the title, which matters when the whole point is capturing
   the last hour in under five seconds. */
export const ACTIVITY_CATEGORIES = [
  { id: "sport", name: "Sport", emoji: "🎾", color: "oklch(0.62 0.13 150)", picks: ["Tennis", "Basketball", "Soccer", "Swimming", "Biking", "Running", "Volleyball", "Pickleball", "Skating", "Hiking"] },
  { id: "focus", name: "Work / study", emoji: "📚", color: "oklch(0.62 0.14 245)", picks: ["Homework", "Studying", "Reading", "Side project", "Emails"] },
  { id: "creative", name: "Creating", emoji: "🎨", color: "oklch(0.66 0.13 60)", picks: ["Drawing", "Music", "Writing", "Coding for fun", "Cooking"] },
  { id: "social", name: "People", emoji: "💬", color: "oklch(0.66 0.14 350)", picks: ["Hanging out", "Family time", "Call with a friend", "Eating out"] },
  { id: "gaming", name: "Gaming", emoji: "🎮", color: "oklch(0.55 0.12 285)", picks: ["Video games", "Board games", "Chess"] },
  { id: "screen", name: "Scrolling", emoji: "📱", color: "oklch(0.6 0.02 260)", picks: ["Scrolling", "YouTube", "TV / show", "Reddit", "Videos"] },
  { id: "chores", name: "Chores", emoji: "🧺", color: "oklch(0.66 0.11 180)", picks: ["Cleaning", "Laundry", "Groceries", "Errands"] },
  { id: "rest", name: "Rest", emoji: "🛋️", color: "oklch(0.55 0.10 290)", picks: ["Nap", "Chilling", "Walk", "Shower", "Music break"] },
  { id: "other", name: "Other", emoji: "✨", color: "oklch(0.6 0.02 260)", picks: [] },
];

/* The five most-reached-for categories, for one-tap launchers (Home card). */
export const QUICK_CATEGORIES = ["sport", "gaming", "screen", "social", "rest"];

export const categoryOf = (id) =>
  ACTIVITY_CATEGORIES.find((c) => c.id === id) ||
  ACTIVITY_CATEGORIES[ACTIVITY_CATEGORIES.length - 1];

/* How the time left you. This is the whole "was I productive?" question,
   reframed so the answer is information about the ACTIVITY, not a grade on
   the person. Five options, no numbers, skippable. */
export const FEELS = [
  { value: "energized", label: "Energized", emoji: "⚡" },
  { value: "accomplished", label: "Accomplished", emoji: "✅" },
  { value: "fun", label: "Fun", emoji: "😄" },
  { value: "meh", label: "Meh", emoji: "😐" },
  { value: "drained", label: "Drained me", emoji: "🫠" },
];

export const feelOf = (value) => FEELS.find((f) => f.value === value) || null;

/* Duration presets for the quick logger. */
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

export function fmtMinutes(min) {
  if (!min || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/* "HH:MM" -> minutes from midnight, or null. */
export function hhmmToMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return null;
  return Math.min(24 * 60, Number(m[1]) * 60 + Number(m[2]));
}

function minToLabel(min) {
  const d = new Date();
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function activitiesOn(activities = [], dayKey = todayKey()) {
  return activities.filter((a) => a.date === dayKey);
}

/* ---- the day story ---------------------------------------------
   Merge everything Ligand knows actually happened on a date into one
   chronological list: activities, workouts, focus sessions, journal
   entries, meals, and the night's sleep. This is the "what did I do
   yesterday?" answer, and the Day tab's reality track next to the plan.

   Every event: { id, kind, minutes(sort key), timeLabel, title, meta,
   color, feel? }. Events without a real clock time (focus sessions only
   store a date) sink to a trailing "also today" bucket via minutes:null.

   Workouts that an activity already mirrors (sport logged as a workout,
   linkType "workout") are skipped so nothing shows twice. */
export function buildDayStory(
  {
    activities = [],
    workouts = [],
    focusLog = [],
    journal = [],
    meals = [],
    sleepLog = [],
  } = {},
  dayKey = todayKey()
) {
  const events = [];

  const mirrored = new Set(
    activities
      .filter((a) => a.date === dayKey && a.linkType === "workout" && a.linkId)
      .map((a) => a.linkId)
  );

  activitiesOn(activities, dayKey).forEach((a) => {
    const end = hhmmToMin(a.endTime);
    const cat = categoryOf(a.category);
    events.push({
      id: a.id,
      kind: "activity",
      category: a.category,
      minutes: end,
      timeLabel: end != null ? minToLabel(end) : null,
      title: a.title || cat.name,
      meta: [fmtMinutes(a.durationMin), feelOf(a.feel)?.label]
        .filter(Boolean)
        .join(" · "),
      durationMin: a.durationMin || 0,
      feel: a.feel || null,
      note: a.note || "",
      color: cat.color,
    });
  });

  workouts
    .filter((w) => w.date === dayKey && !mirrored.has(w.id))
    .forEach((w) => {
      const end = w.createdAt ? new Date(w.createdAt) : null;
      const endMin =
        end && !Number.isNaN(end.getTime())
          ? end.getHours() * 60 + end.getMinutes()
          : null;
      const names = (w.exercises || []).map((e) => e.name).filter(Boolean);
      events.push({
        id: w.id,
        kind: "workout",
        minutes: endMin,
        timeLabel: endMin != null ? minToLabel(endMin) : null,
        title: names.length <= 2 ? names.join(" + ") || "Workout" : "Workout",
        meta: [
          names.length > 2 ? `${names.length} exercises` : null,
          w.durationSec ? fmtMinutes(Math.round(w.durationSec / 60)) : null,
        ]
          .filter(Boolean)
          .join(" · "),
        durationMin: Math.round((w.durationSec || 0) / 60),
        color: "oklch(0.65 0.14 150)",
      });
    });

  journal
    .filter((e) => String(e.createdAt || "").slice(0, 10) === dayKey)
    .forEach((e) => {
      const d = new Date(e.createdAt);
      const min = Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
      events.push({
        id: e.id,
        kind: "journal",
        minutes: min,
        timeLabel: min != null ? minToLabel(min) : null,
        title: "Journal entry",
        meta: (e.text || "").slice(0, 60) + ((e.text || "").length > 60 ? "…" : ""),
        durationMin: 0,
        color: "oklch(0.66 0.13 60)",
      });
    });

  meals
    .filter((m) => m.date === dayKey)
    .forEach((m) => {
      const min = hhmmToMin(m.time);
      events.push({
        id: m.id,
        kind: "meal",
        minutes: min,
        timeLabel: min != null ? minToLabel(min) : null,
        title: m.name || "Meal",
        meta: "",
        durationMin: 0,
        color: "oklch(0.66 0.11 180)",
      });
    });

  // The night that ENDED this morning anchors the story's start.
  const night = sleepLog.find((s) => s.date === dayKey);
  if (night?.wakeTime) {
    const min = hhmmToMin(night.wakeTime);
    events.push({
      id: "sleep-" + dayKey,
      kind: "sleep",
      minutes: min,
      timeLabel: min != null ? minToLabel(min) : null,
      title: "Woke up",
      meta: "",
      durationMin: 0,
      color: "oklch(0.55 0.10 290)",
    });
  }

  // Focus sessions carry only a date, so they summarize into one line.
  const focusMin = focusLog
    .filter((f) => f.date === dayKey)
    .reduce((n, f) => n + (f.minutes || 0), 0);
  if (focusMin > 0) {
    events.push({
      id: "focus-" + dayKey,
      kind: "focus",
      minutes: null,
      timeLabel: null,
      title: "Focus sessions",
      meta: fmtMinutes(focusMin),
      durationMin: focusMin,
      color: "oklch(0.62 0.14 245)",
    });
  }

  // Chronological; the untimed bucket trails at the end.
  events.sort((a, b) => {
    if (a.minutes == null && b.minutes == null) return 0;
    if (a.minutes == null) return 1;
    if (b.minutes == null) return -1;
    return a.minutes - b.minutes;
  });
  return events;
}

/* Small rollup for the summary strip above the story. */
export function daySummary(events = []) {
  const sum = { movingMin: 0, focusedMin: 0, screenMin: 0, restMin: 0, count: events.length };
  events.forEach((e) => {
    if (e.kind === "workout" || e.category === "sport") sum.movingMin += e.durationMin || 0;
    else if (e.kind === "focus" || e.category === "focus") sum.focusedMin += e.durationMin || 0;
    else if (e.category === "screen") sum.screenMin += e.durationMin || 0;
    else if (e.category === "rest") sum.restMin += e.durationMin || 0;
  });
  return sum;
}

/* ---- screen time (self-noticed, self-reported) -------------------
   Minutes of "screen" activities per day for the last `days` days,
   oldest → newest. Self-report is the point: the act of noticing is
   the intervention. */
export function screenSeries(activities = [], days = 7, refKey = todayKey()) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = shiftDay(refKey, -i);
    const minutes = activitiesOn(activities, day)
      .filter((a) => a.category === "screen")
      .reduce((n, a) => n + (a.durationMin || 0), 0);
    out.push({ day, minutes });
  }
  return out;
}

/* Gentle line under the screen-time bars. Noticing is treated as the win
   it is; the copy never scolds. Property-tested for shame words. */
export function screenLine(todayMin, weekSeries = []) {
  const daysNoticed = weekSeries.filter((d) => d.minutes > 0).length;
  if (!todayMin && daysNoticed === 0) {
    return "Nothing logged yet. When you catch yourself scrolling, log it — noticing is the whole skill.";
  }
  if (!todayMin) {
    return "Nothing noticed today yet. That could mean a quiet day — nice.";
  }
  if (todayMin <= 30) {
    return `You noticed ${fmtMinutes(todayMin)} of scrolling today. Catching it this early is the skill.`;
  }
  if (todayMin <= 90) {
    return `${fmtMinutes(todayMin)} noticed today. Every log is a moment you surfaced on purpose.`;
  }
  return `${fmtMinutes(todayMin)} noticed today. That's real information about the day — you saw it, and that's the hard part.`;
}

/* One-line reflection of the most recent activity, for the Home card.
   Kept factual and warm; never grades the choice. */
export function lastActivityLine(activity) {
  if (!activity) return null;
  const bits = [activity.title || categoryOf(activity.category).name];
  if (activity.durationMin) bits.push(fmtMinutes(activity.durationMin));
  const feel = feelOf(activity.feel);
  if (feel) bits.push(feel.label.toLowerCase());
  return bits.join(" · ");
}
