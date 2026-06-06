import { useState } from "react";
import TopNav from "./layout/TopNav.jsx";
import TweaksPanel from "./layout/TweaksPanel.jsx";
import { useTweaks } from "./theme/useTweaks.js";
import { Icon } from "./components/Icons.jsx";

/* Static goal tabs for now — these become real, user-created goals in Step 2
   (data model) and Step 6 (built-in Productivity goal tab). */
const GOALS = [
  { id: "productivity", name: "Productivity", color: "oklch(0.62 0.10 245)" },
  { id: "side-hustles", name: "Side Hustles", color: "oklch(0.7 0.12 165)" },
  { id: "college", name: "College Planning", color: "oklch(0.62 0.10 290)" },
];

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
  const [tab, setTab] = useState("home");
  const [activeGoal, setActiveGoal] = useState("productivity");
  const [showTweaks, setShowTweaks] = useState(false);

  const activeGoalName = GOALS.find((g) => g.id === activeGoal)?.name || "Goal";

  const screen = (() => {
    switch (tab) {
      case "home":
        return (
          <Placeholder
            eyebrow="Dashboard · Sun · May 10"
            title="Good afternoon, Maya."
            sub="Small steps still count. Pick one thing — momentum follows."
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
          <Placeholder
            eyebrow="To-do"
            title="Tasks"
            sub="Everything you want to get to — labelled and filterable."
          />
        );
      case "pomodoro":
        return (
          <Placeholder
            eyebrow="Focus"
            title="Pomodoro"
            sub="Immersive focus timer with adjustable sessions."
          />
        );
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
          goals={GOALS}
          activeGoal={activeGoal}
          setActiveGoal={setActiveGoal}
          onAddGoal={() => alert("New goal flow — coming in a later step.")}
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
