import { useState } from "react";
import TopNav from "./layout/TopNav.jsx";
import TweaksPanel from "./layout/TweaksPanel.jsx";
import { useTweaks } from "./theme/useTweaks.js";
import { useStore } from "./hooks/useStore.js";
import Home from "./tabs/Home.jsx";
import Tasks from "./tabs/Tasks.jsx";
import Pomodoro from "./tabs/Pomodoro.jsx";
import { Icon } from "./components/Icons.jsx";

// Placeholder screen — real tab content arrives in later build steps.
function Placeholder({ eyebrow, title, sub }) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="page-title">{title}</h1>
          <p className="page-sub">{sub}</p>
        </div>
      </div>
      <div
        className="card"
        style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}
      >
        <div className="mono" style={{ fontSize: 12 }}>
          Coming in a later build step.
        </div>
      </div>
    </>
  );
}

export default function App() {
  const { tweaks, set } = useTweaks();
  const store = useStore();
  const { goals, addGoal } = store;
  const [tab, setTab] = useState("home");
  const [activeGoal, setActiveGoal] = useState("productivity");
  const [showTweaks, setShowTweaks] = useState(false);

  const activeGoalName = goals.find((g) => g.id === activeGoal)?.name || "Goal";

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
          />
        );
      case "productivity":
        return (
          <Placeholder
            eyebrow="Built-in goal"
            title="Productivity"
            sub="Forgiving habits, goal progress, and reflection."
          />
        );
      case "goal":
        return (
          <Placeholder
            eyebrow="Goal tab"
            title={activeGoalName}
            sub="Habits, tasks, and progress for this goal."
          />
        );
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
          <Placeholder
            eyebrow="Reflect"
            title="Journal"
            sub="Gentle prompts and a record of how things are going."
          />
        );
      case "settings":
        return (
          <Placeholder
            eyebrow="Preferences"
            title="Settings"
            sub="Notifications, themes, Pomodoro, habits, and more."
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
