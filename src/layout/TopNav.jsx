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
import WindowControls from "../components/WindowControls.jsx";

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

/* The soonest enabled alarm and how far off it is, for the popover's alarm
   shortcut. Walks up to 8 days ahead so weekly-repeating alarms resolve; a
   day-less alarm counts as "every day". Returns null when nothing is armed. */
function nextAlarm(alarms = [], now = new Date()) {
  let best = null;
  for (const a of alarms) {
    if (!a?.enabled || !a.time) continue;
    const [hh, mm] = a.time.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
    for (let add = 0; add < 8; add++) {
      const d = new Date(now);
      d.setDate(d.getDate() + add);
      d.setHours(hh, mm, 0, 0);
      if (d <= now) continue;
      const weekday = (d.getDay() + 6) % 7; // Mon=0..Sun=6
      if (a.days?.length && !a.days.includes(weekday)) continue;
      if (!best || d < best.when) best = { when: d, alarm: a };
      break;
    }
  }
  if (!best) return null;
  const mins = Math.round((best.when - now) / 60000);
  let rel;
  if (mins < 1) rel = "under a minute";
  else if (mins < 60) rel = `${mins} min`;
  else if (mins < 60 * 24) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    rel = m ? `${h}h ${m}m` : `${h}h`;
  } else {
    rel = `${Math.round(mins / (60 * 24))}d`;
  }
  const timeStr = best.when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return { rel, timeStr, label: best.alarm.label || "Alarm" };
}

/* The notification bell: a dot badge when there are unread items, and a
   small dropdown listing the most recent few. Opening marks all as read.

   The popover also carries an Alarms shortcut in its footer. On a phone the
   bell is the most obvious "reminders live here" affordance, so tapping it is
   the natural way to reach alarms — no digging through the avatar overflow. */
function NotificationBell({ items = [], unreadCount = 0, onOpen, onClear, onOpenAlarms, alarms = [] }) {
  const { open, toggle, close, triggerRef, menuRef } = useDropdown();
  const hasUnread = unreadCount > 0;
  // Recompute only while the popover is open (cheap, and keeps the "in Xm"
  // label fresh each time it's shown without a background timer).
  const upcoming = open ? nextAlarm(alarms) : null;

  const onToggle = () => {
    if (!open) onOpen?.(); // opening clears the unread badge
    toggle();
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        className={"iconbtn notif-bell" + (hasUnread ? " has-unread" : "")}
        title="Notifications & alarms"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications"}
        onClick={onToggle}
        style={{ position: "relative" }}
      >
        <Icon.Bell />
        {hasUnread && <span className="notif-dot" aria-hidden="true" />}
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
              {items.slice(0, 8).map((n, i) => (
                <div
                  key={n.id}
                  className="notif-item"
                  style={{ "--i": i }}
                >
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

          {onOpenAlarms && (
            <button
              className="notif-alarm-cta"
              onClick={() => {
                close();
                onOpenAlarms();
              }}
            >
              <span className="notif-alarm-ic"><Icon.Bell /></span>
              <span className="notif-alarm-txt">
                <span className="notif-alarm-title">Alarms</span>
                <span className="notif-alarm-sub">
                  {upcoming
                    ? `Next: ${upcoming.timeStr} · in ${upcoming.rel}`
                    : "Set a photo-scan wake-up"}
                </span>
              </span>
              <span className="notif-alarm-arrow"><Icon.Arrow /></span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* Appearance control: a clear three-state menu (Light / Dark / Auto) instead
   of an ambiguous two-way toggle. The icon reflects what's SHOWING; the menu
   shows which choice is SET, including Auto following the system. */
function ThemeMenu({ theme, themeChoice, setThemeChoice }) {
  const { open, toggle, close, triggerRef, menuRef } = useDropdown();
  const OPTIONS = [
    { id: "light", label: "Light", icon: <Icon.Sun /> },
    { id: "dark", label: "Dark", icon: <Icon.Moon /> },
    { id: "auto", label: "Auto", icon: <Icon.Wand />, hint: "Follows system" },
  ];
  return (
    <div style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        className="iconbtn"
        title="Appearance"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Appearance: ${themeChoice}`}
        onClick={toggle}
        style={{ position: "relative" }}
      >
        {theme === "dark" ? <Icon.Moon /> : <Icon.Sun />}
        {themeChoice === "auto" && <span className="theme-auto-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="notif-pop theme-pop" ref={menuRef} role="menu">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              className={"avatar-menu-item" + (themeChoice === o.id ? " theme-current" : "")}
              role="menuitemradio"
              aria-checked={themeChoice === o.id}
              onClick={() => {
                setThemeChoice?.(o.id);
                close();
              }}
            >
              {o.icon} {o.label}
              {o.hint && <span className="theme-opt-hint">{o.hint}</span>}
              {themeChoice === o.id && <span className="theme-opt-check"><Icon.Check /></span>}
            </button>
          ))}
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
  onOpenDay,
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

            {/* Day planner is a desktop top tab; on phones it lives here so
               the dial (read-only) and the day's blocks stay reachable. */}
            <button
              className="avatar-menu-item avatar-menu-mobile-only"
              onClick={() => {
                onOpenDay?.();
                close();
              }}
            >
              <Icon.Calendar /> Day planner
            </button>

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
  { id: "day", label: "Day", icon: <Icon.Timer /> },
  { id: "habits", label: "Habits", icon: <Icon.CheckCircle /> },
  { id: "tasks", label: "Tasks", icon: <Icon.Check /> },
  { id: "pomodoro", label: "Pomodoro", icon: <Icon.Timer /> },
  { id: "notes", label: "Notes", icon: <Icon.Note /> },
  { id: "journal", label: "Journal", icon: <Icon.Book /> },
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
  alarms = [],
  activeGoal,
  setActiveGoal,
  onAddGoal,
  onArchiveGoal,
  setGoalOrder,
  theme,
  themeChoice = "light",
  setThemeChoice,
  onOpenSearch,
  onOpenQuickAdd,
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
          {/* Desktop quick-add (the phone uses the floating Add button). */}
          <button
            className="iconbtn topbar-quickadd"
            title="Quick add — task, note, workout, alarm, focus"
            onClick={onOpenQuickAdd}
          >
            <Icon.Plus />
          </button>
          <button className="iconbtn" title="Search (⌘K)" onClick={onOpenSearch}>
            <Icon.Search />
          </button>
          <button className="iconbtn topbar-badges" title="Badges" onClick={onOpenBadges}>
            <Icon.Trophy />
          </button>
          <NotificationBell
            items={notifications}
            unreadCount={unreadCount}
            onOpen={onOpenNotifications}
            onClear={onClearNotifications}
            onOpenAlarms={onOpenAlarms}
            alarms={alarms}
          />
          <ThemeMenu theme={theme} themeChoice={themeChoice} setThemeChoice={setThemeChoice} />
          <div className="topbar-tools-sep" />
          <AvatarMenu
            userName={userName}
            onOpenSettings={onOpenSettings}
            onOpenDay={() => setTab("day")}
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
        <WindowControls />
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
