import { Icon } from "./Icons.jsx";
import {
  WORKOUT_SCOPE_ALL,
  WORKOUT_SCOPE_UNASSIGNED,
  workoutScopeOptions,
} from "../lib/workoutScope.js";

/* Which fitness goal the Workout workspace is pointed at.

   A native <select> on purpose. It is one linear choice from a short list,
   and the platform control already gives us keyboard operation, type-ahead,
   a real focus ring and a proper touch picker on a phone — all things the
   brief asks for and all things a custom popup would have to reimplement.
   Recovery goals are never in the list: fitnessGoals() only returns goals of
   type "fitness", so the private tracker cannot appear here.

   Rendered only when there is a genuine choice to make. With no fitness goals
   and nothing unassigned, "All workouts" is the only option, and a dropdown
   with one entry is furniture, not a control. */
export default function WorkoutGoalSelect({
  goals = [],
  workouts = [],
  value = WORKOUT_SCOPE_ALL,
  onChange,
  id = "workout-goal-scope",
}) {
  const options = workoutScopeOptions(goals, workouts);
  if (options.length <= 1) return null;

  const active = options.find((option) => option.id === value) || options[0];

  return (
    <div className="workout-goal-select">
      <label className="eyebrow" htmlFor={id}>
        Showing
      </label>
      <div className="workout-goal-select-control">
        <span className="workout-goal-select-mark" aria-hidden="true">
          {active.type === "goal" ? (
            <span className="gs-dot" style={{ background: active.color }} />
          ) : (
            <Icon.Dumbbell />
          )}
        </span>
        <select
          id={id}
          className="input"
          value={active.id}
          onChange={(event) => onChange?.(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {active.id === WORKOUT_SCOPE_UNASSIGNED && (
        <span className="muted workout-goal-select-note">
          Sessions not linked to a fitness goal.
        </span>
      )}
    </div>
  );
}
