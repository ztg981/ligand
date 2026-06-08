import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../components/Icons.jsx";

const TOOLS = [
  { id: "home", label: "Home", icon: <Icon.Home /> },
  { id: "productivity", label: "Productivity", icon: <Icon.Bolt /> },
  { id: "tasks", label: "Tasks", icon: <Icon.Check /> },
  { id: "pomodoro", label: "Pomodoro", icon: <Icon.Timer /> },
  { id: "journal", label: "Journal", icon: <Icon.Book /> },
  { id: "settings", label: "Settings", icon: <Icon.Gear /> },
];

/* A pill group whose active highlight SLIDES between items (iOS / Claude-app
   style). We measure the active button's box and translate a single indicator
   element to it, so the highlight glides instead of snapping. */
function Tabset({ items, activeId, onSelect, variant, trailing, onDelete }) {
  const btnRefs = useRef({});
  const [ind, setInd] = useState({ x: 0, w: 0, visible: false });

  useLayoutEffect(() => {
    const el = btnRefs.current[activeId];
    if (el) {
      setInd({ x: el.offsetLeft, w: el.offsetWidth, visible: true });
    } else {
      // active item isn't in this group → hide its indicator
      setInd((p) => ({ ...p, visible: false }));
    }
  }, [activeId, items]);

  return (
    <div className={"tabset" + (variant === "goals" ? " goals" : "")}>
      <span
        className="tab-indicator"
        style={{
          transform: `translateX(${ind.x}px)`,
          width: ind.w,
          opacity: ind.visible ? 1 : 0,
        }}
      />
      {items.map((it) => (
        <button
          key={it.id}
          ref={(el) => (btnRefs.current[it.id] = el)}
          className={"tab " + (activeId === it.id ? "active" : "")}
          onClick={() => onSelect(it.id)}
          title={it.label}
        >
          {it.dot ? (
            <span
              className="dot"
              style={{ background: it.dot, boxShadow: `0 0 6px ${it.dot}aa` }}
            />
          ) : (
            it.icon
          )}
          {it.label}
          {onDelete && it.deletable && (
            <span
              className="tab-x"
              role="button"
              tabIndex={0}
              title={`Delete ${it.label}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(it.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onDelete(it.id);
                }
              }}
            >
              <Icon.Close />
            </span>
          )}
        </button>
      ))}
      {trailing}
    </div>
  );
}

export default function TopNav({
  tab,
  setTab,
  goals,
  activeGoal,
  setActiveGoal,
  onAddGoal,
  onDeleteGoal,
  theme,
  toggleTheme,
}) {
  const goalItems = goals.map((g) => ({
    id: g.id,
    label: g.name,
    dot: g.color,
    // The built-in Productivity goal is fixed; everything else can be removed.
    deletable: g.type !== "built-in",
  }));

  return (
    <div className="topbar">
      <div className="brand">
        <span className="brand-dot" />
        <span>Ligand</span>
      </div>

      {/* Scrollable middle: main app tabs + goal tabs. This region can shrink
         and scroll horizontally on narrow screens, so the brand (left) and the
         tools group (right, with the avatar) are never pushed off-screen. */}
      <div className="topbar-scroll">
        {/* Main app tabs */}
        <Tabset items={TOOLS} activeId={tab} onSelect={setTab} />

        {/* Divider between app tabs and goal tabs */}
        <div className="tab-sep" />

        {/* Goal tabs — active only when we're on the "goal" screen */}
        <Tabset
          variant="goals"
          items={goalItems}
          activeId={tab === "goal" ? activeGoal : null}
          onSelect={(id) => {
            setActiveGoal(id);
            setTab("goal");
          }}
          onDelete={onDeleteGoal}
          trailing={
            <button className="plusbtn" onClick={onAddGoal} title="New goal tab">
              <Icon.Plus />
            </button>
          }
        />
      </div>

      <div className="topbar-tools">
        <button className="iconbtn" title="Search">
          <Icon.Search />
        </button>
        <button className="iconbtn" title="Notifications" style={{ position: "relative" }}>
          <Icon.Bell />
          <span
            style={{
              position: "absolute",
              top: 6,
              right: 7,
              width: 5,
              height: 5,
              borderRadius: 999,
              background: "var(--accent)",
              boxShadow: "0 0 5px var(--accent-glow)",
            }}
          />
        </button>
        <button className="iconbtn" title="Toggle theme" onClick={toggleTheme}>
          {theme === "dark" ? <Icon.Sun /> : <Icon.Moon />}
        </button>
        <div style={{ width: 1, height: 20, background: "var(--line)", margin: "0 4px" }} />
        <button
          className="iconbtn"
          title="You"
          style={{
            background:
              "linear-gradient(140deg, oklch(0.78 0.10 var(--accent-h)), oklch(0.65 0.12 var(--hue-lav)))",
            color: "white",
            border: "none",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          M
        </button>
      </div>
    </div>
  );
}
