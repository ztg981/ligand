import { useEffect, useMemo, useRef, useState } from "react";
import TopNav from "./layout/TopNav.jsx";
import TweaksPanel from "./layout/TweaksPanel.jsx";
import { useTweaks } from "./theme/useTweaks.js";
import { useStore } from "./hooks/useStore.js";
import { useSettings } from "./hooks/useSettings.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { useLocalStorage } from "./hooks/useLocalStorage.js";
import { todayKey, daysBetween, isGoalOverdue } from "./lib/model.js";
import { PHASES } from "./hooks/usePomodoro.js";
import Home from "./tabs/Home.jsx";
import Tasks from "./tabs/Tasks.jsx";
import Pomodoro from "./tabs/Pomodoro.jsx";
import GoalTab from "./tabs/GoalTab.jsx";
import Journal from "./tabs/Journal.jsx";
import Settings from "./tabs/Settings.jsx";
import { Icon } from "./components/Icons.jsx";
import SmartGoalModal from "./components/SmartGoalModal.jsx";

export default function App() {
  const { tweaks, set } = useTweaks();
  const store = useStore();
  const { settings, setSection, reset: resetSettings } = useSettings();
  const notif = useNotifications({ enabled: settings.notifications.enabled });
  const { goals, addGoal } = store;
  const [tab, setTab] = useState("home");
  const [activeGoal, setActiveGoal] = useState("productivity");
  const [showTweaks, setShowTweaks] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const confirmBeforeDelete = settings.behavior.confirmBeforeDelete;

  // Archived goals are tucked away in a recycle bin (Settings) and hidden from
  // the nav, pickers and dashboards until restored or permanently deleted.
  const activeGoals = goals.filter((g) => g.status !== "archived");
  const archivedGoals = goals.filter((g) => g.status === "archived");

  // --- gentle re-entry detection (centralised here so the value is captured
  // before anything overwrites it; passed down to Home for its banner) ---
  const [lastVisit, setLastVisit] = useLocalStorage("ligand.lastVisit", null);
  const [daysAway] = useState(() =>
    lastVisit ? daysBetween(lastVisit, todayKey()) : 0
  );
  useEffect(() => {
    setLastVisit(todayKey());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Counts that drive the load-time notification triggers.
  const overdueGoals = useMemo(
    () => activeGoals.filter((g) => isGoalOverdue(g)),
    [activeGoals]
  );
  const urgentCount = useMemo(
    () => store.tasks.filter((t) => !t.done && t.label === "Urgent").length,
    [store.tasks]
  );

  // Fire the on-load notification triggers exactly once per mount. The
  // once-per-day dedup lives inside push(); this guard just stops React
  // StrictMode's double-invoke from firing twice in dev.
  const firedLoadTriggers = useRef(false);
  useEffect(() => {
    if (firedLoadTriggers.current) return;
    firedLoadTriggers.current = true;
    if (daysAway >= 3) {
      notif.push(
        "reentry",
        "Hey, no pressure",
        "Ligand is here when you're ready.",
        { oncePerDay: true }
      );
    }
    if (overdueGoals.length > 0) {
      notif.push("overdue", "Goals to review", "You have overdue goals to review.", {
        oncePerDay: true,
      });
    }
    if (urgentCount > 0) {
      notif.push("urgent", "Urgent tasks", "You have urgent tasks waiting.", {
        oncePerDay: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateGoal = (goalInput) => {
    const goal = addGoal(goalInput);
    setShowGoalModal(false);
    setActiveGoal(goal.id);
    setTab("goal");
  };

  // "Deleting" a custom goal moves it to the archive (recycle bin) — reversible,
  // so no scary prompt. Permanent removal happens from the archive in Settings.
  // The built-in Productivity goal is never offered for archiving.
  const handleArchiveGoal = (id) => {
    const goal = goals.find((g) => g.id === id);
    if (!goal || goal.type === "built-in") return;
    if (
      confirmBeforeDelete &&
      !window.confirm(`Archive "${goal.name}"? You can restore it from Settings.`)
    ) {
      return;
    }
    store.archiveGoal(id);
    // If we were viewing it, step back to a safe screen.
    if (activeGoal === id) setActiveGoal("productivity");
    if (tab === "goal" && activeGoal === id) setTab("home");
  };

  const screen = (() => {
    switch (tab) {
      case "home":
        return (
          <Home
            goals={activeGoals}
            tasks={store.tasks}
            countUps={store.countUps}
            toggleTask={store.toggleTask}
            onGoToTasks={() => setTab("tasks")}
            onSnoozeGoal={store.snoozeGoalReview}
            onReviseGoalDate={store.reviseGoalTargetDate}
            onArchiveGoal={handleArchiveGoal}
            onOpenGoal={(id) => {
              setActiveGoal(id);
              setTab("goal");
            }}
            userName={settings.profile.name}
            showEncouragement={settings.assistant.encouragement}
            tone={settings.assistant.tone}
            daysAway={daysAway}
          />
        );
      case "productivity":
      case "goal": {
        const id = tab === "productivity" ? "productivity" : activeGoal;
        const goal = store.goals.find((g) => g.id === id);
        return (
          <GoalTab
            goal={goal}
            tasks={store.tasks}
            countUps={store.countUps}
            addCountUp={store.addCountUp}
            updateCountUp={store.updateCountUp}
            removeCountUp={store.removeCountUp}
            updateGoal={store.updateGoal}
            onArchiveGoal={handleArchiveGoal}
            addTask={store.addTask}
            updateTask={store.updateTask}
            toggleTask={store.toggleTask}
            removeTask={store.removeTask}
            addHabit={store.addHabit}
            checkInHabit={store.checkInHabit}
            removeHabit={store.removeHabit}
            addReflection={store.addReflection}
            removeReflection={store.removeReflection}
            onSnoozeGoal={store.snoozeGoalReview}
            onReviseGoalDate={store.reviseGoalTargetDate}
            onGoToPomodoro={() => setTab("pomodoro")}
            confirmBeforeDelete={confirmBeforeDelete}
            showStreaks={settings.habits.showStreaks}
            weekStartsMonday={settings.habits.weekStartsMonday}
          />
        );
      }
      case "tasks":
        return (
          <Tasks
            tasks={store.tasks}
            goals={activeGoals}
            addTask={store.addTask}
            updateTask={store.updateTask}
            toggleTask={store.toggleTask}
            removeTask={store.removeTask}
            confirmBeforeDelete={confirmBeforeDelete}
          />
        );
      case "pomodoro":
        return (
          <Pomodoro
            chimeEnabled={settings.notifications.pomodoroChime}
            onPhaseComplete={({ endedPhase }) => {
              const wasFocus = endedPhase === PHASES.WORK;
              notif.push(
                "pomodoro",
                wasFocus ? "Focus block done" : "Break over",
                wasFocus ? "Time for a break." : "Ready to focus?"
              );
            }}
          />
        );
      case "journal":
        return (
          <Journal
            journal={store.journal}
            addJournalEntry={store.addJournalEntry}
            removeJournalEntry={store.removeJournalEntry}
            confirmBeforeDelete={confirmBeforeDelete}
          />
        );
      case "settings":
        return (
          <Settings
            tweaks={tweaks}
            setTweak={set}
            settings={settings}
            setSection={setSection}
            resetSettings={resetSettings}
            resetData={store.resetData}
            archivedGoals={archivedGoals}
            restoreGoal={store.restoreGoal}
            removeGoal={store.removeGoal}
            confirmBeforeDelete={confirmBeforeDelete}
            requestNotifyPermission={notif.requestPermission}
            notifyPermission={notif.permission}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div className="app">
      <div className="ambient">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <span className="blob b4" />
      </div>

      <div className="shell">
        <TopNav
          tab={tab}
          setTab={setTab}
          goals={activeGoals}
          activeGoal={activeGoal}
          setActiveGoal={setActiveGoal}
          onAddGoal={() => setShowGoalModal(true)}
          onArchiveGoal={handleArchiveGoal}
          theme={tweaks.theme}
          toggleTheme={() => set({ theme: tweaks.theme === "dark" ? "light" : "dark" })}
          notifications={notif.items}
          unreadCount={notif.unreadCount}
          onOpenNotifications={notif.markAllRead}
          onClearNotifications={notif.clearAll}
        />

        {screen}
      </div>

      {/* Floating Tweaks toggle */}
      <button
        className="iconbtn"
        title="Tweaks"
        onClick={() => setShowTweaks((s) => !s)}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          width: 44,
          height: 44,
          borderRadius: 12,
          zIndex: 70,
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <Icon.Wand />
      </button>

      {showTweaks && (
        <TweaksPanel tweaks={tweaks} set={set} onClose={() => setShowTweaks(false)} />
      )}

      {showGoalModal && (
        <SmartGoalModal
          onCreate={handleCreateGoal}
          onClose={() => setShowGoalModal(false)}
        />
      )}
    </div>
  );
}
