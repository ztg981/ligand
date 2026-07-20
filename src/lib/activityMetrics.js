/* ============================================================
   Activity metrics
   ------------------------------------------------------------
   Pure helpers for the non-strength logging kinds (distance,
   cardio, sport): pace, calorie estimates, and the small bits of
   formatting the logger and summaries share. No React, no storage.

   Calories use the standard MET formula:
       kcal = MET × bodyWeightKg × hours
   scaled by a perceived-intensity multiplier. It's an estimate —
   the same one Apple Fitness / Strava fall back to without a
   heart-rate strap — but it makes a run or a pickup game feel like
   something you *did*, instead of an empty duration.
   ============================================================ */

import { exerciseMET } from "./exercises.js";

// Perceived-effort multipliers applied to an exercise's base (moderate) MET.
export const INTENSITIES = [
  { id: "light", label: "Light", mult: 0.75, hint: "easy, could hold a conversation" },
  { id: "moderate", label: "Moderate", mult: 1.0, hint: "working, breathing harder" },
  { id: "hard", label: "Hard", mult: 1.3, hint: "tough, short on breath" },
  { id: "allout", label: "All-out", mult: 1.6, hint: "everything you had" },
];
const INTENSITY_BY_ID = new Map(INTENSITIES.map((i) => [i.id, i]));
export function intensityMeta(id) {
  return INTENSITY_BY_ID.get(id) || INTENSITY_BY_ID.get("moderate");
}

// The lifter's bodyweight in kg, from the most recent logged body stat, else a
// sane default. bodyStats weights are in the profile's weightUnit.
export function bodyWeightKg(profile) {
  const stats = profile?.bodyStats || [];
  const latest = stats.length
    ? [...stats].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
    : null;
  const w = latest?.weight;
  if (!w || w <= 0) return 70; // ~154 lb default when we don't know yet
  return profile?.weightUnit === "kg" ? w : w / 2.2046226218;
}

// Estimated calories for a single effort. Returns a rounded integer, or null
// when we can't estimate (no MET, no duration).
export function estimateCalories({ met, durationSec, intensity, profile }) {
  if (!met || !durationSec || durationSec <= 0) return null;
  const mult = intensityMeta(intensity).mult;
  const hours = durationSec / 3600;
  const kcal = met * mult * bodyWeightKg(profile) * hours;
  return Math.max(1, Math.round(kcal));
}

// Calories for a logged workout-exercise (sums its done efforts).
export function exerciseCalories(ex, profile) {
  const met = exerciseMET(ex);
  if (!met) return null;
  let total = 0;
  let any = false;
  (ex.sets || []).forEach((s) => {
    if (!s.done || !s.durationSec) return;
    const c = estimateCalories({ met, durationSec: s.durationSec, intensity: s.intensity, profile });
    if (c != null) {
      total += c;
      any = true;
    }
  });
  return any ? total : null;
}

// Total estimated calories across a whole session (all activity efforts).
export function workoutCalories(workout, profile) {
  let total = 0;
  let any = false;
  (workout?.exercises || []).forEach((ex) => {
    const c = exerciseCalories(ex, profile);
    if (c != null) {
      total += c;
      any = true;
    }
  });
  return any ? total : null;
}

// ---- distance + pace -------------------------------------------
export function distanceUnit(profile) {
  return profile?.distanceUnit || (profile?.weightUnit === "kg" ? "km" : "mi");
}

// "6.2 mi" — trims trailing zeros, keeps one decimal for readability.
export function formatDistance(distance, profile) {
  if (!distance || distance <= 0) return null;
  const u = distanceUnit(profile);
  const n = Math.round(distance * 100) / 100;
  return `${n} ${u}`;
}

// Pace in min:sec per unit distance (the number runners live by), e.g. "8:34
// /mi". Returns null when either side is missing.
export function formatPace(distance, durationSec, profile) {
  if (!distance || distance <= 0 || !durationSec || durationSec <= 0) return null;
  const secPer = durationSec / distance;
  if (!isFinite(secPer) || secPer <= 0) return null;
  const m = Math.floor(secPer / 60);
  const s = Math.round(secPer % 60);
  const mm = s === 60 ? m + 1 : m;
  const ss = s === 60 ? 0 : s;
  return `${mm}:${String(ss).padStart(2, "0")} /${distanceUnit(profile)}`;
}

// Speed in distance-units per hour (for cycling, where mph/kph reads better
// than pace). e.g. "16.4 mph".
export function formatSpeed(distance, durationSec, profile) {
  if (!distance || distance <= 0 || !durationSec || durationSec <= 0) return null;
  const perHr = distance / (durationSec / 3600);
  if (!isFinite(perHr) || perHr <= 0) return null;
  const u = distanceUnit(profile) === "km" ? "kph" : "mph";
  return `${Math.round(perHr * 10) / 10} ${u}`;
}

// ---- duration formatting ---------------------------------------
// "1:05:30" or "42:10" — the elapsed style the logger uses. Whole seconds.
export function formatClock(totalSec) {
  const s = Math.max(0, Math.round(totalSec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// "45 min" / "1 hr 5 min" — a friendlier duration for summaries.
export function formatMinutes(totalSec) {
  const mins = Math.round((totalSec || 0) / 60);
  if (mins <= 0) return "0 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
