import { useMemo, useRef, useState, useEffect } from "react";
import { todayKey, shiftDay, isCheckedOn, daysBetween } from "../lib/model.js";
import { fetchWeeklyReview } from "../lib/aiApi.js";
import { Icon } from "../components/Icons.jsx";

/* ============================================================
   WeeklyReview - a once-a-week, gentle AI summary of the user's
   activity across all goals. Built only from real data (tasks,
   habit check-ins, journal entries, weekday patterns) so the AI
   has something concrete to reflect on rather than inventing.

   Caches per ISO week via fetchWeeklyReview; a normal load reuses
   this week's result, Refresh forces a new one. Same honest
   labels as the AI Insight widget (AI-generated / Last AI insight
   / Using fallback / Sign in for AI).
   ============================================================ */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildContext({ goals = [], tasks = [], journal = [] }) {
  const today = todayKey();
  const last7 = Array.from({ length: 7 }, (_, i) => shiftDay(today, -i));
  const last28 = Array.from({ length: 28 }, (_, i) => shiftDay(today, -i));
  const allHabits = (goals || []).flatMap((g) => g?.habits || []);

  const habitCheckInsThisWeek = allHabits.reduce(
    (sum, h) => sum + last7.filter((d) => isCheckedOn(h, d)).length,
    0
  );

  // Habit check-ins by weekday over the last 4 weeks - gives the AI a real
  // signal to (optionally) spot a pattern like "Tuesdays are your strongest."
  const weekdayCheckIns = {};
  for (const d of last28) {
    const dow = new Date(d + "T00:00:00").getDay();
    const n = allHabits.filter((h) => isCheckedOn(h, d)).length;
    if (n) weekdayCheckIns[DAY_NAMES[dow]] = (weekdayCheckIns[DAY_NAMES[dow]] || 0) + n;
  }

  const tasksDone = (tasks || []).filter((t) => t?.done).length;
  const tasksTotal = (tasks || []).length;

  const journalEntriesThisWeek = (journal || []).filter((j) => {
    if (!j?.createdAt) return false;
    const day = String(j.createdAt).slice(0, 10);
    const diff = daysBetween(day, today);
    return diff >= 0 && diff <= 6;
  }).length;

  const hasActivity =
    tasksTotal > 0 || habitCheckInsThisWeek > 0 || journalEntriesThisWeek > 0;

  return {
    context: {
      activeGoals: (goals || []).map((g) => g?.name).filter(Boolean).slice(0, 8),
      tasksDone,
      tasksTotal,
      habitCheckInsThisWeek,
      weekdayCheckIns,
      journalEntriesThisWeek,
    },
    hasActivity,
  };
}

function sourceLabel(source) {
  if (source === "ai") return "AI-generated";
  if (source === "last-ai") return "Last AI insight";
  if (source === "fallback") return "Using fallback";
  if (source === "logged-out") return "Sign in for AI";
  return null;
}

export default function WeeklyReview({ goals = [], tasks = [], journal = [] }) {
  const { context, hasActivity } = useMemo(
    () => buildContext({ goals, tasks, journal }),
    [goals, tasks, journal]
  );

  const [review, setReview] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // Keep the latest context in a ref so the fetch uses fresh data even if it
  // arrived after this effect was set up.
  const contextRef = useRef(context);
  contextRef.current = context;

  // Fetch when there's real activity to summarize. The dependency is the
  // boolean hasActivity (not the context object), so this re-runs only when
  // activity first appears - not on every task/habit edit - while staying
  // safe under StrictMode's double-invoke. Per-week caching in
  // fetchWeeklyReview keeps repeat loads to a single AI call.
  useEffect(() => {
    if (!hasActivity) {
      setReview({
        text:
          "Your week is just getting started here. Add a task or check in on a habit, and next week I'll have something to reflect back.",
        source: "empty",
      });
      return;
    }
    let active = true;
    fetchWeeklyReview(contextRef.current)
      .then((res) => {
        if (active) setReview(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [hasActivity]);

  const handleRefresh = () => {
    if (isRefreshing || !hasActivity) return;
    setIsRefreshing(true);
    fetchWeeklyReview(context, true)
      .then((res) => setReview(res))
      .catch(() => {})
      .finally(() => {
        setIsRefreshing(false);
        setLastRefreshed(new Date());
      });
  };

  if (!review) return null;
  const label = sourceLabel(review.source);

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Spark width={14} height={14} /> Your week
        </div>
        {hasActivity && review.source !== "off" && (
          <button
            className="btn ghost sm"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: isRefreshing ? 0.5 : 1 }}
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh weekly review"
          >
            <Icon.Reset width={12} height={12} />
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      <div
        style={{
          opacity: isRefreshing ? 0.5 : 1,
          transition: "opacity 0.2s",
          fontSize: 13,
          color: "var(--ink-2)",
          lineHeight: 1.5,
        }}
      >
        {review.text}
      </div>

      {(label || lastRefreshed) && (
        <div className="row between" style={{ marginTop: 8 }}>
          {label ? (
            <span style={{ fontSize: 10, color: "var(--ink-4, var(--ink-3))" }}>
              ({label})
            </span>
          ) : (
            <span />
          )}
          {lastRefreshed && (
            <span style={{ fontSize: 10, color: "var(--ink-4, var(--ink-3))" }}>
              Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
