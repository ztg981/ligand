import DailyFocus from "../widgets/DailyFocus.jsx";

/* Habits - the daily check-in hub. Was "Overview"; the goals grid moved to
   Home (the motivating landing tab), leaving this tab focused on what it does
   best: the full habit checklist with hold-to-check, quick check-in, Today's
   Focus card, and the goals-to-review health summary - all calm and
   non-judgmental in tone. */
export default function Habits({
  goals = [],
  tasks = [],
  checkInHabit,
  updateHabit,
  onOpenGoal,
}) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Show up today</div>
          <h1 className="page-title">Habits</h1>
          <p className="page-sub">
            One calm place to check in on your habits and see what needs
            attention across all your goals.
          </p>
        </div>
      </div>

      {/* Today's focus: habits to check in (hold-to-check), Today/Urgent tasks,
         and any goals to review. */}
      <DailyFocus
        goals={goals}
        tasks={tasks}
        checkInHabit={checkInHabit}
        updateHabit={updateHabit}
        onOpenGoal={onOpenGoal}
      />
    </>
  );
}
