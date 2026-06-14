import { useEffect, useMemo, useRef, useState } from "react";
import { configure as configureUiSounds } from "./lib/uiSounds.js";
import { useAuth } from "./hooks/useAuth.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import TopNav from "./layout/TopNav.jsx";
import TweaksPanel from "./layout/TweaksPanel.jsx";
import { useTweaks } from "./theme/useTweaks.js";
import { useStore } from "./hooks/useStore.js";
import { useSettings } from "./hooks/useSettings.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { useLocalStorage } from "./hooks/useLocalStorage.js";
import { todayKey, daysBetween, isGoalOverdue } from "./lib/model.js";
import { PHASES } from "./hooks/usePomodoro.js";
import { wallpaperById } from "./lib/wallpaper.js";
import Home from "./tabs/Home.jsx";
import Tasks from "./tabs/Tasks.jsx";
import Pomodoro from "./tabs/Pomodoro.jsx";
import GoalTab from "./tabs/GoalTab.jsx";
import Journal from "./tabs/Journal.jsx";
import Settings from "./tabs/Settings.jsx";
import { Icon } from "./components/Icons.jsx";
import SmartGoalModal from "./components/SmartGoalModal.jsx";
import SearchModal from "./components/SearchModal.jsx";

export default function App() {
  // --- auth (Supabase) ---------------------------------------------------
  // Guest mode is the default and keeps the original local-only behavior.
  // The auth screen only appears when there's no session AND the user hasn't
  // chosen to continue as a guest (or has explicitly asked to sign in).
  const { session, user, loading: authLoading, signOut } = useAuth();
  const [guestMode, setGuestMode] = useLocalStorage("ligand.guestMode", false);
  const [authRequested, setAuthRequested] = useState(false);
  const showAuthScreen = !authLoading && !session && (!guestMode || authRequested);

  // Once a session exists, drop any pending "open auth" request.
  useEffect(() => {
    if (session) setAuthRequested(false);
  }, [session]);

  const { tweaks, set } = useTweaks();
  const store = useStore();
  const { settings, setSection, reset: resetSettings } = useSettings();
  const notif = useNotifications({ enabled: settings.notifications.enabled });
  const { goals, addGoal } = store;
  const [tab, setTab] = useState("home");
  const [activeGoal, setActiveGoal] = useState("productivity");
  const [showTweaks, setShowTweaks] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  // When a search result wants us to scroll to a specific row, we stash a
  // { tab, id, nonce } here; the destination tab flashes the matching element.
  const [scrollTarget, setScrollTarget] = useState(null);
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

  // --- visit-date history (one entry per calendar day, last 60 days) ---
  const [visitDates, setVisitDates] = useLocalStorage("ligand.visitDates", []);

  // How many distinct days in the last 7 (including today) the user opened.
  const weekVisits = useMemo(() => {
    const today = todayKey();
    const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return todayKey(d); })();
    return (visitDates || []).filter((d) => d >= cutoff && d <= today).length;
  }, [visitDates]);

  // --- custom wallpaper (data URL stored in its own key to avoid bloating ligand.settings) ---
  const [customWallpaper, setCustomWallpaper] = useLocalStorage("ligand.customWallpaper", null);

  useEffect(() => {
    const today = todayKey();
    setLastVisit(today);
    setVisitDates((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      if (arr.includes(today)) return arr; // already recorded
      const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 60); return todayKey(d); })();
      return [...arr.filter((d) => d >= cutoff), today].sort();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the uiSounds module in sync with the setting.
  useEffect(() => {
    configureUiSounds({ enabled: settings.uiSounds?.enabled ?? true });
  }, [settings.uiSounds?.enabled]);

  // Counts that drive the load-time notification triggers.
  const overdueGoals = useMemo(
    () => activeGoals.filter((g) => isGoalOverdue(g)),
    [activeGoals]
  );
  const urgentCount = useMemo(
    () => store.tasks.filter((t) => !t.done && t.label === "Urgent").length,
    [store.tasks]
  );
  // Habits not yet checked in today across all active goals.
  const uncheckedHabitsCount = useMemo(() => {
    const today = todayKey();
    return activeGoals
      .flatMap((g) => g.habits || [])
      .filter((h) => !(h.checkIns || []).includes(today)).length;
  }, [activeGoals]);

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
    if (uncheckedHabitsCount > 0) {
      notif.push(
        "habit",
        "Keep the momentum going",
        uncheckedHabitsCount === 1
          ? "A habit is still open today — no pressure, just a nudge."
          : `${uncheckedHabitsCount} habits are still open today — no pressure, just a nudge.`,
        { oncePerDay: true }
      );
    }
    // Daily reminder — fires if the user has enabled it and the set time has passed.
    // Checks on app open only (not a background alarm — browsers can't do that from a closed tab).
    if (settings.notifications.dailyReminder && settings.notifications.reminderTime) {
      const [rh, rm] = settings.notifications.reminderTime.split(":").map(Number);
      const now = new Date();
      if (now.getHours() > rh || (now.getHours() === rh && now.getMinutes() >= rm)) {
        notif.push(
          "daily",
          "Checking in",
          "Just a gentle nudge — Ligand's here whenever you're ready today.",
          { oncePerDay: true }
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the chosen wallpaper. The gradient (or photo for custom) is painted
  // behind the ambient blobs via --app-bg; the wallpaper's tone drives the
  // effective light/dark token set so text stays readable on top.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.wallpaper.id === "custom" && customWallpaper) {
      // Custom photo: use the data URL directly, cover the viewport.
      // Theme follows the user's toggle (we can't know the photo's tone).
      root.dataset.theme = tweaks.theme;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
      root.style.setProperty("--app-bg", `url(${customWallpaper})`);
    } else {
      document.body.style.backgroundSize = "";
      document.body.style.backgroundPosition = "";
      const wp = wallpaperById(settings.wallpaper.id);
      const hasWallpaper = wp.id !== "none";
      root.dataset.theme = hasWallpaper ? wp.tone : tweaks.theme;
      if (hasWallpaper) {
        root.style.setProperty("--app-bg", wp.bg);
      } else {
        root.style.removeProperty("--app-bg");
      }
    }
  }, [settings.wallpaper.id, tweaks.theme, customWallpaper]);

  // Cmd/Ctrl+K opens search from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Escape closes search (works even when focus has left the input).
  useEffect(() => {
    if (!showSearch) return;
    const onEsc = (e) => {
      if (e.key === "Escape") setShowSearch(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [showSearch]);

  // Navigate to a chosen search result: switch tab (and goal), and — for the
  // flat list tabs — set a scroll target so the row flashes into view.
  const handleSearchNavigate = (item) => {
    const nav = item?.nav;
    if (!nav) return;
    if (nav.goalId) setActiveGoal(nav.goalId);
    setTab(nav.tab);
    // Tasks, journal entries, and count-ups carry a row id to scroll/flash.
    if (nav.id) {
      setScrollTarget({ tab: nav.tab, id: nav.id, nonce: Date.now() });
    } else {
      setScrollTarget(null);
    }
  };

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
            weekVisits={weekVisits}
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
            onGoToTasks={() => setTab("tasks")}
            confirmBeforeDelete={confirmBeforeDelete}
            showStreaks={settings.habits.showStreaks}
            weekStartsMonday={settings.habits.weekStartsMonday}
            scrollTo={scrollTarget?.tab === "goal" ? scrollTarget : null}
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
            scrollTo={scrollTarget?.tab === "tasks" ? scrollTarget : null}
          />
        );
      case "pomodoro":
        return (
          <Pomodoro
            chimeEnabled={settings.notifications.pomodoroChime}
            ambientOverride={settings.wallpaper?.sound ?? "none"}
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
            scrollTo={scrollTarget?.tab === "journal" ? scrollTarget : null}
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
            customWallpaper={customWallpaper}
            setCustomWallpaper={setCustomWallpaper}
          />
        );
      default:
        return null;
    }
  })();

  // While Supabase resolves the initial session, show a brief loading veil so
  // we don't flash the auth screen at someone who's already logged in.
  if (authLoading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <div>Loading…</div>
      </div>
    );
  }

  // Not logged in and hasn't chosen guest mode → the sign-in / sign-up gate.
  if (showAuthScreen) {
    return (
      <AuthScreen
        onContinueAsGuest={() => {
          setGuestMode(true);
          setAuthRequested(false);
        }}
      />
    );
  }

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
          onOpenSearch={() => setShowSearch(true)}
          notifications={notif.items}
          unreadCount={notif.unreadCount}
          onOpenNotifications={notif.markAllRead}
          onClearNotifications={notif.clearAll}
          userName={settings.profile.name}
          onOpenSettings={() => setTab("settings")}
          onClearData={store.resetData}
          accountEmail={user?.email ?? null}
          onSignOut={async () => {
            await signOut();
          }}
          onRequestAuth={() => setAuthRequested(true)}
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
        <TweaksPanel
          tweaks={tweaks}
          set={set}
          onClose={() => setShowTweaks(false)}
          wallpaperActive={settings.wallpaper.id !== "none"}
        />
      )}

      {showGoalModal && (
        <SmartGoalModal
          onCreate={handleCreateGoal}
          onClose={() => setShowGoalModal(false)}
        />
      )}

      <SearchModal
        open={showSearch}
        onClose={() => setShowSearch(false)}
        goals={activeGoals}
        tasks={store.tasks}
        journal={store.journal}
        countUps={store.countUps}
        onNavigate={handleSearchNavigate}
      />
    </div>
  );
}
