import { GOAL_TYPES } from "../lib/model.js";
import HabitChecker from "../widgets/HabitChecker.jsx";
import GoalProgress from "../widgets/GoalProgress.jsx";
import Reflections from "../widgets/Reflections.jsx";
import CountUp from "../widgets/CountUp.jsx";

/* GoalTab — the preset layout shown for any goal.
   The built-in "Productivity" goal uses the very same layout; it just
   can't be deleted. Composition (left = do/track, right = feel/reflect)
   keeps the most actionable things first for an ADHD-friendly flow. */

export default function GoalTab({
  goal,
  tasks,
  countUps,
  addHabit,
  checkInHabit,
  removeHabit,
  addReflection,
}) {
  if (!goal) return null;
  const builtIn = goal.type === GOAL_TYPES.BUILT_IN;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {builtIn ? "Built-in goal" : "Your goal"}
            {goal.deadline ? ` · due ${goal.deadline}` : ""}
          </div>
          <h1 className="page-title">
            <span
              className="swatch"
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: goal.color,
                display: "inline-block",
                marginRight: 10,
                verticalAlign: "middle",
              }}
            />
            {goal.name}
          </h1>
          <p className="page-sub">
            {builtIn
              ? "Forgiving habits, goal progress, and a place to reflect."
              : "Habits, progress, and reflection for this goal."}
          </p>
        </div>
      </div>

      <div className="grid grid-12">
        {/* Left: do & track */}
        <div className="col-8 stack" style={{ gap: 12, minWidth: 0 }}>
          <HabitChecker
            goal={goal}
            addHabit={addHabit}
            checkInHabit={checkInHabit}
            removeHabit={removeHabit}
          />
          <GoalProgress goal={goal} tasks={tasks} />
        </div>

        {/* Right: feel & reflect */}
        <div className="col-4 stack" style={{ gap: 12, minWidth: 0 }}>
          <CountUp countUp={countUps && countUps[0]} />
          <Reflections goal={goal} addReflection={addReflection} />
        </div>
      </div>
    </>
  );
}
