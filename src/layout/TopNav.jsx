import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import GoalDropdown from "../components/GoalDropdown.jsx";
import { useDropdown } from "../hooks/useDropdown.js";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  const { open, toggle, triggerRef, menuRef } = useDropdown();

  const onToggle = () => {
    if (!open) onOpen?.(); // opening clears the unread badge
    toggle();
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        className="iconbtn"
        title="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
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
        <div className="notif-pop" ref={menuRef} role="menu">
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
      )}
    </div>
  );
}

const AVATAR_BG =
  "linear-gradient(140deg, oklch(0.78 0.10 var(--accent-h)), oklch(0.65 0.12 var(--hue-lav)))";

/* The profile avatar + dropdown: shows the user's name, account status
   (signed-in email or local/guest), a jump to Settings, and a two-step
   "Clear all data" with inline confirmation. */
function AvatarMenu({
  userName = "You",
  onOpenSettings,
  onOpenPomodoro,
  onOpenJournal,
  onOpenAlarms,
  onOpenBadges,
  onClearData,
  accountEmail = null,
  onSignOut,
  onRequestAuth,
}) {
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const initial = ((userName || "").trim()[0] || "Y").toUpperCase();
  const loggedIn = Boolean(accountEmail);

  // Reset the "clear data" confirm state whenever the menu closes.
  const { open, toggle, close, triggerRef, menuRef } = useDropdown({
    onClose: () => setConfirming(false),
  });

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        className="iconbtn avatar-btn"
        title="You"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        style={{
          background: AVATAR_BG,
          color: "white",
          border: "none",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {initial}
      </button>

      {open && (
        <div className="avatar-pop" ref={menuRef} role="menu">
            <div className="avatar-pop-head">
              <span className="avatar-pop-ic" style={{ background: AVATAR_BG }}>
                {initial}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="avatar-pop-name">{userName || "You"}</div>
                <div
                  className="avatar-pop-sub"
                  title={loggedIn ? accountEmail : undefined}
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {loggedIn ? accountEmail : "Local profile · this device"}
                </div>
              </div>
            </div>

            {/* Pomodoro is already a top-bar tab on tablet/desktop; this
               shortcut only shows on phone, where it moved out of the
               bottom tab bar to make room (see BOTTOM_NAV_IDS). */}
            <button
              className="avatar-menu-item avatar-menu-mobile-only"
              onClick={() => {
                onOpenPomodoro?.();
                close();
              }}
            >
              <Icon.Timer /> Pomodoro
            </button>

            {/* Journal moved off the phone bottom bar to make room for Workout;
               it lives here on mobile (hidden on desktop, where it's a top tab). */}
            <button
              className="avatar-menu-item avatar-menu-mobile-only"
              onClick={() => {
                onOpenJournal?.();
                close();
              }}
            >
              <Icon.Book /> Journal
            </button>

            {/* Alarms lives in Settings; this is the discoverable front door on
               a phone (the label literally says Alarms, no vague wording). */}
            <button
              className="avatar-menu-item avatar-menu-mobile-only"
              onClick={() => {
                onOpenAlarms?.();
                close();
              }}
            >
              <Icon.Bell /> Alarms
            </button>

            <button
              className="avatar-menu-item"
              onClick={() => {
                onOpenSettings?.();
                close();
              }}
            >
              <Icon.Gear /> Settings
            </button>

            <button
              className="avatar-menu-item"
              onClick={() => {
                onOpenBadges?.();
                close();
              }}
            >
              <Icon.Trophy /> Badges
            </button>

            {loggedIn ? (
              <button
                className="avatar-menu-item"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  try {
                    await onSignOut?.();
                  } finally {
                    setSigningOut(false);
                    close();
                  }
                }}
              >
                <Icon.Arrow /> {signingOut ? "Signing out…" : "Sign out"}
              </button>
            ) : (
              <button
                className="avatar-menu-item"
                onClick={() => {
                  onRequestAuth?.();
                  close();
                }}
              >
                <Icon.Cloud /> Sign in or create account
              </button>
            )}

            {!confirming ? (
              <button
                className="avatar-menu-item danger"
                onClick={() => setConfirming(true)}
              >
                <Icon.Trash /> Clear all data
              </button>
            ) : (
              <div className="avatar-confirm">
                <div className="avatar-confirm-text">
                  Erase all goals, tasks, habits and journal entries? This can't be
                  undone.
                </div>
                <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                  <button className="btn ghost sm" onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn sm avatar-erase"
                    onClick={() => {
                      onClearData?.();
                      close();
                    }}
                  >
                    Erase
                  </button>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

/* Tiny cloud-sync status pill. Stays out of the way: nothing in guest mode
   (idle) or once everything is saved (synced); a quiet "Syncing…" during a
   push, and a clear "Offline" when the cloud can't be reached (data is still
   safe in localStorage). */
function SyncPill({ status }) {
  // Flash a brief "Saved" tick when a push completes, so saving is visibly
  // confirmed (matters most mid-workout on a phone).
  const [justSaved, setJustSaved] = useState(false);
  const prevRef = useRef(status);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = status;
    if (prev === "syncing" && status === "synced") {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 2000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [status]);

  if (status === "synced" && justSaved) {
    return (
      <span className="sync-pill saved" title="All changes saved to your account.">
        <span className="sync-dot" /> Saved
      </span>
    );
  }
  if (status === "idle" || status === "synced") return null;
  if (status === "offline") {
    return (
      <span className="sync-pill offline" title="Can't reach the cloud. Your changes are saved on this device and will sync when you're back online.">
        <span className="sync-dot" /> Offline
      </span>
    );
  }
  if (status === "syncing" || status === "loading") {
    return (
      <span className="sync-pill syncing" title="Saving to your account…">
        <span className="sync-dot" /> Syncing…
      </span>
    );
  }
  return null;
}

const TOOLS = [
  { id: "home", label: "Home", icon: <Icon.Home /> },
  { id: "habits", label: "Habits", icon: <Icon.CheckCircle /> },
  { id: "tasks", label: "Tasks", icon: <Icon.Check /> },
  { id: "pomodoro", label: "Pomodoro", icon: <Icon.Timer /> },
  { id: "journal", label: "Journal", icon: <Icon.Book /> },
  { id: "notes", label: "Notes", icon: <Icon.Note /> },
  { id: "workout", label: "Workout", icon: <Icon.Dumbbell /> },
  { id: "settings", label: "Settings", icon: <Icon.Gear /> },
];

// The phone bottom tab bar only has room for ~5 comfortable targets, so it
// shows the tabs people actually reach for one-handed: capturing a task or
// note, checking in on a habit, reviewing goals. Pomodoro (a sit-down focus
// session) and Settings (infrequent) move to the avatar overflow menu
// instead of crowding the bar - both still one tap away, just not in the
// thumb zone.
const BOTTOM_NAV_IDS = ["home", "habits", "tasks", "workout", "notes"];

/* A pill group whose active highlight SLIDES between items (iOS / Claude-app
   style). We measure the active button's box and translate a single indicator
   element to it, so the highlight glides instead of snapping. 
   When `sortable` is true, items are wrapped in @dnd-kit useSortable. */
function Tab({ it, activeId, onSelect, onArchive, sortable }) {
  const isActive = activeId === it.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: it.id, disabled: !sortable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={"tab " + (isActive ? "active" : "")}
      // Only call onSelect if we are not dragging. Note: on pointer down,
      // listeners handles the drag. onClick handles the selection.
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
          onPointerDown={(e) => e.stopPropagation()} // Prevent drag start when clicking X
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
  );
}

function Tabset({ items, activeId, onSelect, variant, trailing, onArchive, sortable }) {
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
      {sortable ? (
        <SortableContext items={items.map(it => it.id)} strategy={horizontalListSortingStrategy}>
          {items.map((it) => (
            <div key={it.id} ref={(el) => (btnRefs.current[it.id] = el)}>
              <Tab
                it={it}
                activeId={activeId}
                onSelect={onSelect}
                onArchive={onArchive}
                sortable={true}
              />
            </div>
          ))}
        </SortableContext>
      ) : (
        items.map((it) => (
          <div key={it.id} ref={(el) => (btnRefs.current[it.id] = el)}>
            <Tab
              it={it}
              activeId={activeId}
              onSelect={onSelect}
              onArchive={onArchive}
              sortable={false}
            />
          </div>
        ))
      )}
      {trailing}
    </div>
  );
}

export default function TopNav({
  tab,
  setTab,
  goals,
  tasks = [],
  activeGoal,
  setActiveGoal,
  onAddGoal,
  onArchiveGoal,
  setGoalOrder,
  theme,
  toggleTheme,
  onOpenSearch,
  notifications = [],
  unreadCount = 0,
  onOpenNotifications,
  onClearNotifications,
  userName = "You",
  onOpenSettings,
  onOpenAlarms,
  onOpenBadges,
  onClearData,
  accountEmail = null,
  onSignOut,
  onRequestAuth,
  syncStatus = "idle",
}) {
  const goalItems = goals.map((g) => ({
    id: g.id,
    label: g.name,
    // Recovery goals use a leaf icon instead of the color dot - subtle privacy.
    dot: g.type === "recovery" ? null : g.color,
    icon: g.type === "recovery" ? (
      <span className="recovery-leaf"><Icon.Leaf /></span>
    ) : null,
    deletable: g.type !== "built-in",
  }));

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Require a 5px drag to start sorting
      },
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = goals.findIndex((g) => g.id === active.id);
      const newIndex = goals.findIndex((g) => g.id === over.id);
      const newOrder = arrayMove(goals.map(g => g.id), oldIndex, newIndex);
      setGoalOrder?.(newOrder);
    }
  };

  return (
    <>
      <div className="topbar-status-cover" aria-hidden="true" />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="topbar">
        {/* The logo doubles as a Home button (kept tight — just the mark +
           wordmark, not the whole bar). */}
        <button className="brand" onClick={() => setTab("home")} title="Home" aria-label="Home">
          <span className="brand-dot" />
          <span className="brand-name">Ligand</span>
        </button>

        {/* Scrollable middle: main app tabs + goal tabs. This region can shrink
           and scroll horizontally on narrow screens, so the brand (left) and the
           tools group (right, with the avatar) are never pushed off-screen.
           On phones the main app tabs move to a bottom tab bar, so only the goal
           pills remain here. */}
        <div className="topbar-scroll">
          {/* Main app tabs (hidden on phone - see .bottom-nav) */}
          <div className="topbar-main-tabs">
            <Tabset items={TOOLS} activeId={tab} onSelect={setTab} />
            {/* Divider between app tabs and goal tabs */}
            <div className="tab-sep" />
          </div>

          {/* Goal tabs - active only when we're on the "goal" screen.
             DESKTOP (≥768px): hidden - goals live in the left sidebar instead.
             Tablet/phone: shown here (phones get a dropdown in a later pass). */}
          <div className="topbar-goals">
            <Tabset
              variant="goals"
              items={goalItems}
              sortable={true}
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

          {/* MOBILE (<768px) goal selector - replaces the cramped goal pills.
             Desktop uses the sidebar; this is hidden there via CSS. */}
          <GoalDropdown
            goals={goals}
            tasks={tasks}
            activeGoalId={activeGoal}
            isGoalTab={tab === "goal"}
            onSelect={(id) => {
              setActiveGoal(id);
              setTab("goal");
            }}
            onAddGoal={onAddGoal}
          />
        </div>

        <div className="topbar-tools">
          <SyncPill status={syncStatus} />
          <button className="iconbtn" title="Search (⌘K)" onClick={onOpenSearch}>
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
          <div className="topbar-tools-sep" />
          <AvatarMenu
            userName={userName}
            onOpenSettings={onOpenSettings}
            onOpenPomodoro={() => setTab("pomodoro")}
            onOpenJournal={() => setTab("journal")}
            onOpenAlarms={onOpenAlarms}
            onOpenBadges={onOpenBadges}
            onClearData={onClearData}
            accountEmail={accountEmail}
            onSignOut={onSignOut}
            onRequestAuth={onRequestAuth}
          />
        </div>
        </div>
      </DndContext>

      {/* Bottom tab bar - phone only (CSS-gated). Shows the 5 tabs most useful
         one-handed; Pomodoro + Settings live in the avatar menu on mobile. */}
      <nav className="bottom-nav" aria-label="Main">
        {BOTTOM_NAV_IDS.map((id) => {
          const it = TOOLS.find((t) => t.id === id);
          const active = tab === id;
          return (
            <button
              key={id}
              className={"bottom-nav-item " + (active ? "active" : "")}
              onClick={() => setTab(id)}
              aria-current={active ? "page" : undefined}
            >
              <span className="bottom-nav-pill">
                <span className="bottom-nav-ic">{it.icon}</span>
                <span className="bottom-nav-label">{it.label}</span>
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
