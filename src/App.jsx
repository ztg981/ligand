import { useState } from "react";
import TopNav from "./layout/TopNav.jsx";
import TweaksPanel from "./layout/TweaksPanel.jsx";
import { useTweaks } from "./theme/useTweaks.js";
import { useStore } from "./hooks/useStore.js";
import { useSettings } from "./hooks/useSettings.js";
import Home from "./tabs/Home.jsx";
import Tasks from "./tabs/Tasks.jsx";
import Pomodoro from "./tabs/Pomodoro.jsx";
import GoalTab from "./tabs/GoalTab.jsx";
import Journal from "./tabs/Journal.jsx";
import Settings from "./tabs/Settings.jsx";
import { Icon } from "./components/Icons.jsx";

export default function App() {
  const { tweaks, set } = useTweaks();
  const store = useStore();
  const { settings, setSection, reset: resetSettings } = useSettings();
  const { goals, addGoal } = store;
  const [tab, setTab] = useState("home");
  const [activeGoal, setActiveGoal] = useState("productivity");
  const [showTweaks, setShowTweaks] = useState(false);

  // Temporary add-goal flow (a proper dialog arrives with the goal UI later).
  const handleAddGoal = () => {
    const name = window.prompt("Name your new goal:");
    if (!name || !name.trim()) return;
    const goal = addGoal({ name: name.trim() });
    setActiveGoal(goal.id);
    setTab("goal");
  };

  const screen = (() => {
    switch (tab) {
      case "home":
        return (
          <Home
            goals={store.goals}
            tasks={store.tasks}
            countUps={store.countUps}
            toggleTask={store.toggleTask}
            onGoToTasks={() => setTab("tasks")}
            userName={settings.profile.name}
            showEncouragement={settings.assistant.encouragement}
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
            addHabit={store.addHabit}
            checkInHabit={store.checkInHabit}
            removeHabit={store.removeHabit}
            addReflection={store.addReflection}
          />
        );
      }
      case "tasks":
        return (
          <Tasks
            tasks={store.tasks}
            goals={store.goals}
            addTask={store.addTask}
            updateTask={store.updateTask}
            toggleTask={store.toggleTask}
            removeTask={store.removeTask}
          />
        );
      case "pomodoro":
        return <Pomodoro />;
      case "journal":
        return (
          <Journal
            journal={store.journal}
            addJournalEntry={store.addJournalEntry}
            removeJournalEntry={store.removeJournalEntry}
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
          goals={goals}
          activeGoal={activeGoal}
          setActiveGoal={setActiveGoal}
          onAddGoal={handleAddGoal}
          theme={tweaks.theme}
          toggleTheme={() => set({ theme: tweaks.theme === "dark" ? "light" : "dark" })}
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
    </div>
  );
}
