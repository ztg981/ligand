import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import OfflineBanner from "./components/OfflineBanner.jsx";
import UpdateBanner from "./components/UpdateBanner.jsx";
import { playBgMusic, stopBgMusic, setBgMusicVolume, isBgMusicPlaying } from "./lib/bgMusicPlayer.js";
import { configure as configureUiSounds, ding, pop } from "./lib/uiSounds.js";
import HyperfocusBackdrop from "./components/HyperfocusBackdrop.jsx";
import { useAuth } from "./hooks/useAuth.jsx";
import { useSupabaseSync } from "./hooks/useSupabaseSync.js";
import { hasMeaningfulLocalData } from "./lib/syncManager.js";
import AuthScreen from "./components/AuthScreen.jsx";
import MigrationModal from "./components/MigrationModal.jsx";
import SetNewPassword from "./components/SetNewPassword.jsx";
import BadgeCelebration from "./components/BadgeCelebration.jsx";
import BadgesModal from "./components/BadgesModal.jsx";
import { useBadges } from "./hooks/useBadges.js";
import TopNav from "./layout/TopNav.jsx";
import GoalSidebar from "./components/GoalSidebar.jsx";
import TweaksPanel from "./layout/TweaksPanel.jsx";
import { useTweaks } from "./theme/useTweaks.js";
import { useStore } from "./hooks/useStore.js";
import { useSettings } from "./hooks/useSettings.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { useLocalStorage } from "./hooks/useLocalStorage.js";
import { todayKey, daysBetween, isGoalOverdue, currentStreak, daysSince, SEED_GOAL_IDS, workoutVolume, weeklyWorkoutStreak } from "./lib/model.js";
import { PHASES } from "./hooks/usePomodoro.js";
import { wallpaperById } from "./lib/wallpaper.js";
import { setAiGuestMode } from "./lib/aiApi.js";
import Home from "./tabs/Home.jsx";
import Tasks from "./tabs/Tasks.jsx";
import Pomodoro from "./tabs/Pomodoro.jsx";
import GoalTab from "./tabs/GoalTab.jsx";
import RecoveryGoalTab from "./components/RecoveryGoalTab.jsx";
import FitnessGoalTab from "./components/FitnessGoalTab.jsx";
import Journal from "./tabs/Journal.jsx";
import Notes from "./tabs/Notes.jsx";
import Habits from "./tabs/Habits.jsx";
import WorkoutTab from "./tabs/WorkoutTab.jsx";
import Settings from "./tabs/Settings.jsx";
import MobileSettings from "./tabs/MobileSettings.jsx";
import { Icon } from "./components/Icons.jsx";
import SmartGoalModal from "./components/SmartGoalModal.jsx";
import SearchModal from "./components/SearchModal.jsx";
import QuickNoteFab from "./components/QuickNoteFab.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { useElectron } from "./hooks/useElectron.js";

export default function App() {
  // Register the PWA service worker (autoUpdate mode — updates silently
  // in background, activates on next navigation). No user prompt needed.
  useRegisterSW({ immediate: true });
  // --- auth (Supabase) ---------------------------------------------------
  // Guest mode is the default and keeps the original local-only behavior.
  // The auth screen only appears when there's no session AND the user hasn't
  // chosen to continue as a guest (or has explicitly asked to sign in).
  const { session, user, loading: authLoading, signOut, recovery } = useAuth();
  const [guestMode, setGuestMode] = useLocalStorage("ligand.guestMode", false);
  const [authRequested, setAuthRequested] = useState(false);
  const showAuthScreen = !authLoading && !session && (!guestMode || authRequested);

  // Once a session exists, drop any pending "open auth" request.
  useEffect(() => {
    if (session) setAuthRequested(false);
  }, [session]);

  // --- cloud data sync (dormant in guest mode) -----------------------------
  const {
    status: syncStatus,
    hydrating: syncHydrating,
    needsMigration,
    runMigration,
  } = useSupabaseSync(session);

  // First login with no cloud row yet. If there's meaningful local (guest)
  // data, ask whether to import it (modal below). If there's nothing worth
  // importing, just create the empty cloud row and move on — no prompt.
  const [showMigrate, setShowMigrate] = useState(false);
  useEffect(() => {
    if (!needsMigration) {
      setShowMigrate(false);
      return;
    }
    if (hasMeaningfulLocalData()) {
      setShowMigrate(true);
    } else {
      runMigration(true); // nothing to lose — seed an empty row silently
    }
  }, [needsMigration, runMigration]);

  const { tweaks, set } = useTweaks();
  const store = useStore();
  // Below 768px, the Hyperfocus FAB is replaced by a quick-capture note
  // button (see the FAB render further down) - desktop keeps Hyperfocus.
  const isMobile = useIsMobile(768);
  // Desktop shell detection: stamps <html data-electron> and keeps the native
  // window-controls overlay themed. Inert in the browser/PWA build.
  useElectron();
  const { settings, setSection, reset: resetSettings } = useSettings();
  const isGuest = !session;
  const notif = useNotifications({ enabled: settings.notifications.enabled });
  const { goals, addGoal } = store;
  const [tab, setTab] = useState("home");
  const [activeGoal, setActiveGoal] = useState("productivity");
  const [showTweaks, setShowTweaks] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useLayoutEffect(() => {
    setAiGuestMode(isGuest);
  }, [isGuest]);

  useEffect(() => {
    if (!isGuest) return;
    if ((settings.profile?.name || "").trim() === "Maya") {
      setSection("profile", { name: "Guest" });
    }
  }, [isGuest, settings.profile?.name, setSection]);

  useEffect(() => {
    if (!isGuest) return;
    const ai = settings.ai || {};
    if (
      ai.aiGoalInsights !== false ||
      ai.aiWeeklyReview !== false ||
      ai.includeJournalText === true ||
      ai.aiRecoveryInsights === true
    ) {
      setSection("ai", {
        aiGoalInsights: false,
        aiWeeklyReview: false,
        includeJournalText: false,
        aiRecoveryInsights: false,
      });
    }
  }, [
    isGuest,
    settings.ai?.aiGoalInsights,
    settings.ai?.aiWeeklyReview,
    settings.ai?.includeJournalText,
    settings.ai?.aiRecoveryInsights,
    setSection,
  ]);

  useEffect(() => {
    if (!isGuest || settings.habits?.weekStartsMonday === true) return;
    try {
      const key = "ligand.guestWeekStartMondayDefault.v1";
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      // If localStorage is unavailable, still apply the in-memory preference.
    }
    setSection("habits", { weekStartsMonday: true });
  }, [isGuest, settings.habits?.weekStartsMonday, setSection]);

  // --- Hyperfocus mode: a dramatic dark-red "locked in" theme. State persists
  // across reloads; the data-hyperfocus attribute on <html> drives all the CSS.
  const [hyperfocus, setHyperfocus] = useLocalStorage("ligand.hyperfocus", false);
  useEffect(() => {
    const root = document.documentElement;
    if (hyperfocus) root.setAttribute("data-hyperfocus", "true");
    else root.removeAttribute("data-hyperfocus");
  }, [hyperfocus]);

  // Desktop focus-mode website blocker: when "Auto-block whenever Hyperfocus is
  // on" is enabled (see BlockerPanel), flipping Hyperfocus on applies the saved
  // blocklist and flipping it off lifts it. Electron/Windows only; a no-op
  // everywhere else (window.electron.blocker is undefined on web).
  useEffect(() => {
    const blocker = typeof window !== "undefined" && window.electron?.blocker;
    if (!blocker) return;
    let cfg = {};
    try {
      cfg = JSON.parse(localStorage.getItem("ligand.blocker") || "{}");
    } catch { /* ignore */ }
    if (!cfg.autoFocus) return;
    if (hyperfocus) {
      blocker
        .status()
        .then((s) => {
          const domains = [
            ...new Set([
              ...(cfg.presets || []).flatMap((p) => (s?.presets?.[p]) || []),
              ...(cfg.custom || []),
            ]),
          ];
          if (domains.length) blocker.apply(domains);
        })
        .catch(() => {});
    } else {
      blocker.clear().catch(() => {});
    }
  }, [hyperfocus]);
  // Mousemove parallax for hyperfocus card tilt.
  // Normalised cursor position (-1 to 1) from viewport centre is written to
  // CSS vars --hf-mx / --hf-my. Cards read these for their rotateX/Y tilt.
  useEffect(() => {
    const root = document.documentElement;
    if (!hyperfocus) {
      root.style.removeProperty("--hf-mx");
      root.style.removeProperty("--hf-my");
      return;
    }
    const onMove = (e) => {
      root.style.setProperty("--hf-mx", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
      root.style.setProperty("--hf-my", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      root.style.removeProperty("--hf-mx");
      root.style.removeProperty("--hf-my");
    };
  }, [hyperfocus]);

  const toggleHyperfocus = () => {
    setHyperfocus((on) => {
      if (on) pop(); else ding();
      return !on;
    });
  };
  // When a search result wants us to scroll to a specific row, we stash a
  // { tab, id, nonce } here; the destination tab flashes the matching element.
  const [scrollTarget, setScrollTarget] = useState(null);
  const confirmBeforeDelete = settings.behavior.confirmBeforeDelete;

  // Archived goals are tucked away in a recycle bin (Settings) and hidden from
  // the nav, pickers and dashboards until restored or permanently deleted.
  const activeGoals = goals.filter((g) => g.status !== "archived");
  const archivedGoals = goals.filter((g) => g.status === "archived");
  const userDisplayName =
    isGuest && (settings.profile?.name || "").trim() === "Maya"
      ? "Guest"
      : settings.profile?.name || (isGuest ? "Guest" : "You");

  // Reorder active goals based on the stored goalOrder array.
  // Any goals not listed in goalOrder (e.g. newly created ones) fall back to the end
  // in their natural array order.
  const orderedActiveGoals = useMemo(() => {
    const orderMap = new Map((store.data?.goalOrder || []).map((id, i) => [id, i]));
    return [...activeGoals].sort((a, b) => {
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity;
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity;
      if (idxA !== idxB) return idxA - idxB;
      return 0; // maintain natural order for ties (unlisted items)
    });
  }, [activeGoals, store.data?.goalOrder]);

  // --- gentle re-entry detection (centralised here so the value is captured
  // before anything overwrites it; passed down to Home for its banner) ---
  const [lastVisit, setLastVisit] = useLocalStorage("ligand.lastVisit", null);
  const [daysAway] = useState(() =>
    lastVisit ? daysBetween(lastVisit, todayKey()) : 0
  );

  // --- visit-date history (one entry per calendar day, last 60 days) ---
  const [visitDates, setVisitDates] = useLocalStorage("ligand.visitDates", []);

  // --- all-time distinct active days ("Days showing up") -----------------
  // A cumulative count of DISTINCT calendar days the app was actually opened.
  // It increments at most once per day (never for days the app wasn't opened,
  // never for elapsed-but-unopened days). `null` means "not migrated yet".
  // `activeDaysDay` records the last day already counted so reloads on the same
  // day never double-count; a ref guards the StrictMode double-invoke in dev.
  const [activeDaysCount, setActiveDaysCount] = useLocalStorage("ligand.activeDays", null);
  const [activeDaysDay, setActiveDaysDay] = useLocalStorage("ligand.activeDaysDay", null);
  const countedTodayRef = useRef(false);
  const activeDays = activeDaysCount ?? (visitDates || []).length;

  // How many distinct days in the last 7 (including today) the user opened.
  const weekVisits = useMemo(() => {
    const today = todayKey();
    const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return todayKey(d); })();
    return (visitDates || []).filter((d) => d >= cutoff && d <= today).length;
  }, [visitDates]);

  // --- achievement badges: derive milestone stats from existing data, then
  // let useBadges detect unlocks (gentle toast + chime, respecting settings).
  const badgeStats = useMemo(() => {
    const allGoals = store.goals || [];
    const allTasks = store.tasks || [];
    const allCountUps = store.countUps || [];
    const journalLen = (store.journal || []).length;
    const seed = new Set(SEED_GOAL_IDS);
    const today = todayKey();
    const reflectionCount =
      journalLen + allGoals.reduce((n, g) => n + (g.reflections?.length || 0), 0);
    const maxStreak = allGoals.reduce(
      (m, g) => Math.max(m, ...(g.habits || []).map((h) => currentStreak(h)), 0),
      0
    );
    const maxCountUp = allCountUps.reduce(
      (m, c) => Math.max(m, daysSince(c.startDate)),
      0
    );

    // Time-of-day + length signals from every journal/reflection entry.
    const allEntries = [
      ...(store.journal || []),
      ...allGoals.flatMap((g) => g.reflections || []),
    ];
    let entryAfter10pm = false;
    let entryBefore7am = false;
    let longEntry = false;
    allEntries.forEach((e) => {
      const d = new Date(e.createdAt);
      if (!Number.isNaN(d.getTime())) {
        const h = d.getHours();
        if (h >= 22) entryAfter10pm = true;
        if (h < 7) entryBefore7am = true;
      }
      const words = (e.text || "").trim().split(/\s+/).filter(Boolean).length;
      if (words > 200) longEntry = true;
    });

    // A comeback: any habit checked in again after a 3+ day gap.
    const habitComeback = allGoals.some((g) =>
      (g.habits || []).some((h) => {
        const days = [...(h.checkIns || [])].sort();
        for (let i = 1; i < days.length; i++) {
          if (daysBetween(days[i - 1], days[i]) >= 4) return true;
        }
        return false;
      })
    );

    // Most tasks completed on any single day (groups by completedOn).
    const byDay = {};
    allTasks.forEach((t) => {
      if (t.done && t.completedOn) byDay[t.completedOn] = (byDay[t.completedOn] || 0) + 1;
    });
    const maxTasksOneDay = Object.values(byDay).reduce((m, n) => Math.max(m, n), 0);

    // Longest run of consecutive app-open days.
    const sortedVisits = [...(visitDates || [])].sort();
    let maxVisitStreak = sortedVisits.length ? 1 : 0;
    let run = maxVisitStreak;
    for (let i = 1; i < sortedVisits.length; i++) {
      if (daysBetween(sortedVisits[i - 1], sortedVisits[i]) === 1) {
        run += 1;
        maxVisitStreak = Math.max(maxVisitStreak, run);
      } else {
        run = 1;
      }
    }

    return {
      ownGoal: allGoals.some((g) => !seed.has(g.id)),
      goalDone: allGoals.some((g) => g.status === "done"),
      tasksDone: allTasks.filter((t) => t.done).length,
      habitCount: allGoals.reduce((n, g) => n + (g.habits?.length || 0), 0),
      maxStreak,
      reflectionCount,
      maxCountUp,
      visitDays: (visitDates || []).length,
      focusSessions: (store.focusLog || []).length,
      // New badge signals
      entryAfter10pm,
      entryBefore7am,
      longEntry,
      habitComeback,
      allTasksClearedDay: allTasks.length > 0 && allTasks.every((t) => t.done),
      maxGoalAgeDays: allGoals.reduce(
        (m, g) => (g.createdAt ? Math.max(m, daysBetween(g.createdAt, today)) : m),
        0
      ),
      maxTasksOneDay,
      recoveryReset: allGoals.some(
        (g) => g.type === "recovery" && (g.recoveryData?.resets || 0) >= 1
      ),
      goalCount: allGoals.length,
      habitGoalCount: allGoals.filter((g) => (g.habits?.length || 0) >= 1).length,
      maxVisitStreak,
      // --- fitness / workout signals ---
      ...(() => {
        const workouts = store.workouts || [];
        const unit = store.fitnessProfile?.weightUnit || "lbs";
        const toLbs = unit === "kg" ? 2.20462 : 1;

        // Max single-session volume, normalised to lbs for the badge threshold.
        let maxSessionVolumeLbs = 0;
        workouts.forEach((w) => {
          maxSessionVolumeLbs = Math.max(maxSessionVolumeLbs, workoutVolume(w) * toLbs);
        });

        // Beat a PR: per exercise, a later session's top set exceeds the best
        // that came before it (the first-ever lift doesn't count as "beating").
        // Tiebreak same-day sessions by createdAt so within-day order is right.
        const asc = [...workouts].sort(
          (a, b) =>
            String(a.date).localeCompare(String(b.date)) ||
            String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
        );
        const bestByEx = {};
        let beatPR = false;
        for (const w of asc) {
          for (const ex of w.exercises || []) {
            if (!ex.exerciseId) continue;
            const top = (ex.sets || []).reduce(
              (m, s) => (s.done && s.weight != null ? Math.max(m, s.weight) : m),
              0
            );
            if (top <= 0) continue;
            if (bestByEx[ex.exerciseId] != null && top > bestByEx[ex.exerciseId]) beatPR = true;
            bestByEx[ex.exerciseId] = Math.max(bestByEx[ex.exerciseId] ?? 0, top);
          }
        }

        // Comeback: a 2+ week gap between consecutive workout days.
        const dates = [...new Set(workouts.map((w) => w.date))].sort();
        let comebackWorkout = false;
        for (let i = 1; i < dates.length; i++) {
          if (daysBetween(dates[i - 1], dates[i]) >= 14) comebackWorkout = true;
        }

        // Most workouts in any Mon-anchored calendar week.
        const weekKey = (key) => {
          const d = new Date(key + "T00:00:00");
          const dow = (d.getDay() + 6) % 7;
          d.setDate(d.getDate() - dow);
          return todayKey(d);
        };
        const weekCounts = {};
        workouts.forEach((w) => {
          const k = weekKey(w.date);
          weekCounts[k] = (weekCounts[k] || 0) + 1;
        });
        const maxWorkoutsInWeek = Object.values(weekCounts).reduce(
          (m, c) => Math.max(m, c),
          0
        );

        return {
          workoutCount: workouts.length,
          maxWorkoutsInWeek,
          beatPR,
          comebackWorkout,
          maxSessionVolumeLbs,
          workoutWeekStreak: weeklyWorkoutStreak(workouts),
        };
      })(),
    };
  }, [store.goals, store.tasks, store.countUps, store.journal, store.focusLog, store.workouts, store.fitnessProfile, visitDates]);

  const { unlocked: unlockedBadges, toastQueue: badgeToasts, dismissToast: dismissBadgeToast } =
    useBadges(badgeStats);
  const [showBadges, setShowBadges] = useState(false);

  // --- custom wallpaper gallery (data URLs in their own key to avoid bloating
  // ligand.settings). Up to 5 photos; the active one is picked by
  // settings.wallpaper.customId when settings.wallpaper.id === "custom". ---
  const [customWallpapers, setCustomWallpapers] = useLocalStorage("ligand.customWallpapers", []);

  // One-time migration from the old single-wallpaper key into the gallery.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("ligand.customWallpaper");
      if (raw == null) return;
      const url = JSON.parse(raw);
      if (typeof url === "string" && url) {
        setCustomWallpapers((prev) =>
          prev && prev.length ? prev : [{ id: "cw-legacy", url }]
        );
      }
      window.localStorage.removeItem("ligand.customWallpaper");
    } catch {
      /* ignore malformed legacy data */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The active custom photo: the one whose id matches customId, else the first
  // (covers the migrated legacy wallpaper, which has no stored customId).
  const activeCustom =
    settings.wallpaper.id === "custom"
      ? customWallpapers.find((w) => w.id === settings.wallpaper.customId) ||
        customWallpapers[0] ||
        null
      : null;

  useEffect(() => {
    const today = todayKey();
    setLastVisit(today);
    const priorVisits = Array.isArray(visitDates) ? visitDates : [];
    const isNewDay = !priorVisits.includes(today);
    setVisitDates((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      if (arr.includes(today)) return arr; // already recorded
      const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 60); return todayKey(d); })();
      return [...arr.filter((d) => d >= cutoff), today].sort();
    });

    // All-time distinct active days. On first run after this change, seed the
    // counter from the distinct days we already have on record (honest — never
    // inflated by elapsed-but-unopened days). Then count today if it's new.
    // Two guards keep this idempotent: `countedTodayRef` absorbs React's
    // StrictMode double-invoke (dev only), and `activeDaysDay` prevents a
    // same-day reload from counting twice across sessions.
    if (!countedTodayRef.current && activeDaysDay !== today) {
      countedTodayRef.current = true;
      setActiveDaysCount((prev) => {
        const base = prev == null ? priorVisits.length : prev;
        return isNewDay ? base + 1 : base;
      });
      setActiveDaysDay(today);
    }

    // One-time cleanup: the old seed shipped a generic "What I'm proud of"
    // count-up labelled "Days showing up" whose number was elapsed calendar
    // days since install — it could read far higher than the days actually
    // opened. The real metric now lives in `activeDays`, so retire that one
    // seeded count-up (only the untouched seed, matched by its exact label).
    try {
      if (!localStorage.getItem("ligand.daysShowingUpMigrated")) {
        (store.countUps || [])
          .filter((c) => c.label === "Days showing up")
          .forEach((c) => store.removeCountUp(c.id));
        localStorage.setItem("ligand.daysShowingUpMigrated", "1");
      }
    } catch {
      /* localStorage unavailable — harmless, migration simply retries later */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the uiSounds module in sync with the setting (toggle + volume).
  useEffect(() => {
    configureUiSounds({
      enabled: settings.uiSounds?.enabled ?? true,
      volume: (settings.uiSounds?.volume ?? 75) / 100,
    });
  }, [settings.uiSounds?.enabled, settings.uiSounds?.volume]);

  // Background music — app-wide ambient loops. Plays across all tabs.
  // Off by default; only starts after the user explicitly enables it
  // (the toggle in Settings acts as the required user gesture).
  const bgMusic = settings.bgMusic ?? {};
  const bgEnabled = bgMusic.enabled ?? false;
  const bgTrack   = bgMusic.track   ?? "rain";
  const bgVolume  = bgMusic.volume  ?? 30;
  const bgVolumeRef = useRef(bgVolume);

  useEffect(() => {
    if (bgEnabled) {
      playBgMusic(bgTrack, bgVolume / 100);
    } else {
      stopBgMusic();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgEnabled, bgTrack]);

  // Volume-only changes apply without restarting the track.
  useEffect(() => {
    bgVolumeRef.current = bgVolume;
    if (bgEnabled && isBgMusicPlaying()) {
      setBgMusicVolume(bgVolume / 100);
    }
  }, [bgVolume, bgEnabled]);

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
          ? "A habit is still open today. No pressure, just a nudge."
          : `${uncheckedHabitsCount} habits are still open today. No pressure, just a nudge.`,
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
          "Just a gentle nudge. Ligand's here whenever you're ready today.",
          { oncePerDay: true }
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // System color-scheme, tracked live so the "Auto" theme can follow the OS
  // and update the instant the user flips their system between light and dark.
  const [systemTheme, setSystemTheme] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Mobile keeps its OWN theme preference (ligand.mobileTheme), fully separate
  // from the desktop `tweaks.theme`, so flipping light/dark on a phone never
  // changes the PC and vice-versa. Default: auto (follow the system scheme).
  const [mobileTheme, setMobileTheme] = useLocalStorage("ligand.mobileTheme", "auto");
  const themeChoice = isMobile ? mobileTheme : tweaks.theme;
  const setThemeChoice = (val) =>
    isMobile ? setMobileTheme(val) : set({ theme: val });

  // The actual light/dark to apply: "auto" follows the OS, otherwise the
  // explicit choice. A wallpaper's tone still wins over this (handled below).
  const resolvedTheme = themeChoice === "auto" ? systemTheme : themeChoice;

  // Apply the chosen wallpaper. The gradient (or photo for custom) is painted
  // behind the ambient blobs via --app-bg; the wallpaper's tone drives the
  // effective light/dark token set so text stays readable on top.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.wallpaper.id === "custom" && activeCustom) {
      // Custom photo: use the data URL directly, cover the viewport.
      // Theme follows the user's choice (we can't know the photo's tone).
      root.dataset.theme = resolvedTheme;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
      root.style.setProperty("--app-bg", `url(${activeCustom.url})`);
    } else {
      document.body.style.backgroundSize = "";
      document.body.style.backgroundPosition = "";
      const wp = wallpaperById(settings.wallpaper.id);
      const hasWallpaper = wp.id !== "none";
      // Wallpaper tone wins; otherwise the resolved (auto-aware) theme.
      root.dataset.theme = hasWallpaper ? wp.tone : resolvedTheme;
      if (hasWallpaper) {
        root.style.setProperty("--app-bg", wp.bg);
      } else {
        root.style.removeProperty("--app-bg");
      }
    }
  }, [settings.wallpaper.id, settings.wallpaper.customId, resolvedTheme, activeCustom]);

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
    // Fitness goals carry a fitnessProfile payload from onboarding; persist it
    // app-wide (one lifter) and keep it off the goal object itself.
    const { fitnessProfile, ...goalOnly } = goalInput || {};
    const goal = addGoal(goalOnly);
    if (fitnessProfile) store.updateFitnessProfile(fitnessProfile);
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

  // Mobile Home's "Capture a thought" button: create a blank note and jump
  // straight to it in the Notes tab (the most common one-handed phone
  // action), instead of making the user navigate then tap "New note" again.
  const [quickCaptureNoteId, setQuickCaptureNoteId] = useState(null);
  const handleQuickCapture = () => {
    const note = store.addNote();
    setQuickCaptureNoteId(note.id);
    setTab("notes");
  };

  const screen = (() => {
    switch (tab) {
      case "home":
        return (
          <Home
            goals={activeGoals}
            tasks={store.tasks}
            journal={store.journal}
            toggleTask={store.toggleTask}
            onGoToTasks={() => setTab("tasks")}
            onGoToHabits={() => setTab("habits")}
            onSnoozeGoal={store.snoozeGoalReview}
            onReviseGoalDate={store.reviseGoalTargetDate}
            onArchiveGoal={handleArchiveGoal}
            onOpenGoal={(id) => {
              setActiveGoal(id);
              setTab("goal");
            }}
            userName={userDisplayName}
            showEncouragement={settings.assistant.encouragement}
            tone={settings.assistant.tone}
            daysAway={daysAway}
            weekVisits={weekVisits}
            activeDays={activeDays}
            checkInHabit={store.checkInHabit}
            updateHabit={store.updateHabit}
          />
        );
      case "habits":
        return (
          <Habits
            goals={activeGoals}
            tasks={store.tasks}
            checkInHabit={store.checkInHabit}
            updateHabit={store.updateHabit}
            onOpenGoal={(id) => {
              setActiveGoal(id);
              setTab("goal");
            }}
          />
        );
      case "goal": {
        const id = activeGoal;
        const goal = store.goals.find((g) => g.id === id);
        if (goal?.type === "recovery") {
          return (
            <RecoveryGoalTab
              goal={goal}
              updateGoal={store.updateGoal}
              onArchiveGoal={handleArchiveGoal}
              addReflection={store.addReflection}
              removeReflection={store.removeReflection}
            />
          );
        }
        if (goal?.type === "fitness") {
          return (
            <FitnessGoalTab
              goal={goal}
              profile={store.fitnessProfile}
              workouts={store.workouts}
              templates={store.workoutTemplates}
              addWorkout={store.addWorkout}
              updateWorkout={store.updateWorkout}
              deleteWorkout={store.deleteWorkout}
              addTemplate={store.addTemplate}
              updateTemplate={store.updateTemplate}
              deleteTemplate={store.deleteTemplate}
              updateFitnessProfile={store.updateFitnessProfile}
              onArchiveGoal={handleArchiveGoal}
            />
          );
        }
        return (
          <GoalTab
            goal={goal}
            goals={activeGoals}
            focusLog={store.focusLog}
            onOpenGoal={(gid) => {
              setActiveGoal(gid);
              setTab("goal");
            }}
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
            updateHabit={store.updateHabit}
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
            tasks={store.tasks}
            goals={activeGoals}
            hyperfocus={hyperfocus}
            logFocusSession={store.logFocusSession}
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
            songLog={store.songLog}
            addSong={store.addSong}
            updateSong={store.updateSong}
            deleteSong={store.deleteSong}
            confirmBeforeDelete={confirmBeforeDelete}
            scrollTo={scrollTarget?.tab === "journal" ? scrollTarget : null}
          />
        );
      case "notes":
        return (
          <Notes
            notes={store.notes}
            addNote={store.addNote}
            updateNote={store.updateNote}
            removeNote={store.removeNote}
            autoOpenNoteId={quickCaptureNoteId}
            onAutoOpenHandled={() => setQuickCaptureNoteId(null)}
          />
        );
      case "workout":
        return (
          <WorkoutTab
            profile={store.fitnessProfile}
            workouts={store.workouts}
            templates={store.workoutTemplates}
            addWorkout={store.addWorkout}
            addTemplate={store.addTemplate}
            updateFitnessProfile={store.updateFitnessProfile}
          />
        );
      case "settings":
        // Phones get a simplified, mobile-focused settings list; the full
        // desktop Settings (Pomodoro, wallpaper, AI config, density, etc.)
        // stays desktop-only where it applies.
        if (isMobile) {
          return (
            <MobileSettings
              mobileTheme={mobileTheme}
              setMobileTheme={setMobileTheme}
              tweaks={tweaks}
              setTweak={set}
              settings={settings}
              setSection={setSection}
              requestNotifyPermission={notif.requestPermission}
              notifyPermission={notif.permission}
              accountEmail={user?.email ?? null}
              onSignOut={async () => {
                await signOut();
              }}
              onRequestAuth={() => setAuthRequested(true)}
            />
          );
        }
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
            customWallpapers={customWallpapers}
            setCustomWallpapers={setCustomWallpapers}
            hasRecoveryGoal={activeGoals.some((g) => g.type === "recovery")}
            isGuest={isGuest}
          />
        );
      default:
        return null;
    }
  })();

  // While Supabase resolves the initial session — or fetches a logged-in
  // user's cloud data — show a brief loading veil so we neither flash the auth
  // screen at someone already logged in nor flash stale local data before the
  // cloud copy arrives.
  if (authLoading || syncHydrating) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <div>{syncHydrating ? "Syncing your data…" : "Loading…"}</div>
      </div>
    );
  }

  // Arrived via a password-reset email link → let them set a new password
  // before anything else (takes priority over the normal app / auth gate).
  if (recovery) {
    return <SetNewPassword />;
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
      <OfflineBanner />
      <UpdateBanner />
      <div className="ambient">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <span className="blob b4" />
      </div>

      {/* Hyperfocus animated backdrop — only mounted while the mode is active. */}
      {hyperfocus && <HyperfocusBackdrop />}

      <div className="shell">
        <TopNav
          tab={tab}
          setTab={setTab}
          goals={orderedActiveGoals}
          tasks={store.tasks}
          setGoalOrder={store.setGoalOrder}
          activeGoal={activeGoal}
          setActiveGoal={setActiveGoal}
          onAddGoal={() => setShowGoalModal(true)}
          onArchiveGoal={handleArchiveGoal}
          theme={resolvedTheme}
          toggleTheme={() => setThemeChoice(resolvedTheme === "dark" ? "light" : "dark")}
          onOpenSearch={() => setShowSearch(true)}
          notifications={notif.items}
          unreadCount={notif.unreadCount}
          onOpenNotifications={notif.markAllRead}
          onClearNotifications={notif.clearAll}
          userName={userDisplayName}
          onOpenSettings={() => setTab("settings")}
          onOpenBadges={() => setShowBadges(true)}
          onClearData={store.resetData}
          accountEmail={user?.email ?? null}
          onSignOut={async () => {
            await signOut();
          }}
          onRequestAuth={() => setAuthRequested(true)}
          syncStatus={syncStatus}
        />

        <div className="body">
          {/* key={tab} remounts on tab switch so the fade/slide-in plays. */}
          <div className="content">
            <div className="tab-fade" key={tab}>
              {screen}
            </div>
          </div>
          {/* DESKTOP-only goal navigation on the RIGHT (hidden <768px via CSS). */}
          <GoalSidebar
            goals={orderedActiveGoals}
            tasks={store.tasks}
            selectedId={tab === "goal" ? activeGoal : null}
            onSelect={(id) => {
              setActiveGoal(id);
              setTab("goal");
            }}
            onAddGoal={() => setShowGoalModal(true)}
            onArchiveGoal={handleArchiveGoal}
            setGoalOrder={store.setGoalOrder}
          />
        </div>
      </div>

      {/* Floating Theme toggle — desktop only. On mobile the theme controls
          live in Settings and the corner is given to the quick-note FAB, so
          the phone has just one floating button. */}
      {!isMobile && (
        <button
          className="iconbtn tweaks-fab"
          title="Theme"
          onClick={() => setShowTweaks((s) => !s)}
        >
          <Icon.Wand />
        </button>
      )}

      {/* Floating Hyperfocus toggle (bottom-right, stacked above the Tweaks
          wand so it never overlaps it regardless of viewport width).
          Mobile (<768px) swaps this for a quick-capture note button instead
          - Hyperfocus is a sit-down desktop mode, not a one-handed phone
          action, and the same corner is more useful as a capture tool
          there. Desktop keeps Hyperfocus exactly as it was. */}
      {isMobile ? (
        <QuickNoteFab addNote={store.addNote} />
      ) : (
        <button
          className={"hf-fab" + (hyperfocus ? " active" : "")}
          title={hyperfocus ? "Exit Hyperfocus" : "Enter Hyperfocus"}
          aria-pressed={hyperfocus}
          onClick={toggleHyperfocus}
          data-mute-click
        >
          <Icon.Bolt />
          <span className="hf-fab-label">Focus</span>
        </button>
      )}

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

      {showMigrate && (
        <MigrationModal
          onImport={() => runMigration(true)}
          onFresh={() => runMigration(false)}
        />
      )}

      {showBadges && (
        <BadgesModal unlocked={unlockedBadges} onClose={() => setShowBadges(false)} />
      )}

      <BadgeCelebration queue={badgeToasts} onDismiss={dismissBadgeToast} />

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
