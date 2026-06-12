import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../components/Icons.jsx";

// Per-type icon for the notification feed.
const NOTIF_ICON = {
  pomodoro: <Icon.Timer />,
  overdue: <Icon.Calendar />,
  urgent: <Icon.Bell />,
  reentry: <Icon.Heart />,
};

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/* The notification bell: a dot badge when there are unread items, and a
   small dropdown listing the most recent few. Opening marks all as read. */
function NotificationBell({ items = [], unreadCount = 0, onOpen, onClear }) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) onOpen?.(); // opening clears the unread badge
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        className="iconbtn"
        title="Notifications"
        onClick={toggle}
        style={{ position: "relative" }}
      >
        <Icon.Bell />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 6,
              right: 7,
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "var(--accent)",
              boxShadow: "0 0 5px var(--accent-glow)",
            }}
          />
        )}
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 90 }}
          />
          <div className="notif-pop">
            <div className="notif-pop-head">
              <span>Notifications</span>
              {items.length > 0 && (
                <button className="btn ghost sm" onClick={onClear}>
                  Clear
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <div className="notif-empty">
                You're all caught up. Nudges will show up here.
              </div>
            ) : (
              <div className="notif-list">
                {items.slice(0, 8).map((n) => (
                  <div key={n.id} className="notif-item">
                    <span className="notif-ic">
                      {NOTIF_ICON[n.type] || <Icon.Spark />}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="notif-title">{n.title}</div>
                      {n.body && <div className="notif-body">{n.body}</div>}
                      <div className="notif-time">{timeAgo(n.ts)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

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
function Tabset({ items, activeId, onSelect, variant, trailing, onArchive }) {
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
          {onArchive && it.deletable && (
            <span
              className="tab-x"
              role="button"
              tabIndex={0}
              title={`Archive ${it.label}`}
              onClick={(e) => {
                e.stopPropagation();
                onArchive(it.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onArchive(it.id);
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
  onArchiveGoal,
  theme,
  toggleTheme,
  notifications = [],
  unreadCount = 0,
  onOpenNotifications,
  onClearNotifications,
}) {
  const goalItems = goals.map((g) => ({
    id: g.id,
    label: g.name,
    dot: g.color,
    // The built-in Productivity goal is fixed; everything else can be archived.
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
          onArchive={onArchiveGoal}
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
        <NotificationBell
          items={notifications}
          unreadCount={unreadCount}
          onOpen={onOpenNotifications}
          onClear={onClearNotifications}
        />
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
