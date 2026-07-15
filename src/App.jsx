import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import OfflineBanner from "./components/OfflineBanner.jsx";
import UpdateBanner from "./components/UpdateBanner.jsx";
import { playBgMusic, stopBgMusic, setBgMusicVolume, isBgMusicPlaying } from "./lib/bgMusicPlayer.js";
import { configure as configureUiSounds, ding, pop } from "./lib/uiSounds.js";
import HyperfocusBackdrop from "./components/HyperfocusBackdrop.jsx";
import { useAuth } from "./hooks/useAuth.jsx";
import { useSupabaseSync } from "./hooks/useSupabaseSync.js";
import { clearLocalBlob, hasMeaningfulLocalData } from "./lib/syncManager.js";
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
import { paletteFor } from "./theme/palettes.js";
import { goalHealth } from "./lib/goalHealth.js";
import { triageGoals, shouldOfferReview } from "./lib/goalTriage.js";
import { summarizeWeek, DEFAULT_TARGET } from "./lib/showingUp.js";
import FreshStartReview from "./components/FreshStartReview.jsx";
import { useSleepLog } from "./hooks/useSleepLog.js";
import MorningCheckIn from "./components/MorningCheckIn.jsx";
import SleepTab from "./tabs/Sleep.jsx";
import { useStore } from "./hooks/useStore.js";
import { useSettings } from "./hooks/useSettings.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { useLocalStorage } from "./hooks/useLocalStorage.js";
import { todayKey, daysBetween, shiftDay, isGoalOverdue, currentStreak, daysSince, SEED_GOAL_IDS, workoutVolume, weeklyWorkoutStreak } from "./lib/model.js";
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
import DayPlanner from "./tabs/DayPlanner.jsx";
import Settings from "./tabs/Settings.jsx";
import MobileSettings from "./tabs/MobileSettings.jsx";
import { Icon } from "./components/Icons.jsx";
import SmartGoalModal from "./components/SmartGoalModal.jsx";
import SearchModal from "./components/SearchModal.jsx";
import QuickAdd from "./components/QuickAdd.jsx";
import AlarmOverlay from "./components/AlarmOverlay.jsx";
import { useAlarms } from "./hooks/useAlarms.js";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { useElectron } from "./hooks/useElectron.js";
import { usesMobilePreferenceScope } from "./lib/deviceScope.js";
import { StandaloneWindowChrome } from "./components/WindowControls.jsx";

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
  const handleSignOut = async () => {
    const result = await signOut();
    if (!result?.error) {
      clearLocalBlob();
      setGuestMode(false);
      setAuthRequested(false);
    }
    return result;
  };

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

  // Preference scope follows the device family, not viewport width. iPad joins
  // the desktop preference set; phones keep a separate mobile set. A narrow PC
  // window therefore never switches to phone preferences.
  const [usesMobilePreferences] = useState(usesMobilePreferenceScope);
  const preferenceScope = usesMobilePreferences ? "mobile" : "desktop";
  const { tweaks, set } = useTweaks(preferenceScope);
  const store = useStore();
  // Photo-scan alarms: watch the clock and raise the firing alarm (if any).
  const { firing: firingAlarm, dismiss: dismissAlarm } = useAlarms(
    store.alarms,
    store.updateAlarm
  );
  // Below 768px, the Hyperfocus FAB is replaced by a quick-capture note
  // button (see the FAB render further down) - desktop keeps Hyperfocus.
  const isMobile = useIsMobile(768);
  // Desktop shell detection: stamps <html data-electron> and keeps the native
  // window-controls overlay themed. Inert in the browser/PWA build.
  useElectron();
  const { settings, setSection, reset: resetSettings } = useSettings(preferenceScope);
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
  // True while a Pomodoro FOCUS block is actively running (drives the website
  // blocker auto-mode: block during focus, unblock on break/stop).
  const [pomoFocus, setPomoFocus] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    if (hyperfocus) root.setAttribute("data-hyperfocus", "true");
    else root.removeAttribute("data-hyperfocus");
  }, [hyperfocus]);
  // The chosen hyperfocus look (Settings → Appearance → Hyperfocus color).
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-hf-theme",
      settings.hyperfocus?.theme || "crimson"
    );
  }, [settings.hyperfocus?.theme]);

  // Cinematic transitions: when hyperfocus turns ON (a real toggle, not a
  // reload that restores it), play one of three full-screen intro sweeps at
  // random; when it turns OFF, a "dawn" bloom washes the dark away so leaving
  // feels like a deliberate release, not a light switch.
  const [hfIntro, setHfIntro] = useState(null); // "wipe" | "slats" | "aurora" | "dawn" | null
  const hfPrev = useRef(hyperfocus);
  useEffect(() => {
    const was = hfPrev.current;
    hfPrev.current = hyperfocus;
    const reduce =
      settings.behavior?.reduceMotion ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (was === hyperfocus || reduce) return undefined;
    const variants = ["wipe", "slats", "aurora", "stripes"];
    const pick = hyperfocus
      ? variants[Math.floor(Math.random() * variants.length)]
      : "dawn";
    // Scheduled (not set synchronously in the effect body) so the sweep starts
    // on the next tick, after the token swap has painted underneath it.
    const t0 = setTimeout(() => setHfIntro(pick), 0);
    const t = setTimeout(() => setHfIntro(null), 1450);
    return () => {
      clearTimeout(t0);
      clearTimeout(t);
    };
  }, [hyperfocus, settings.behavior?.reduceMotion]);

  // Desktop website blocker auto-mode: when "Auto-block during focus sessions"
  // is enabled (see BlockerPanel), the blocklist applies while a focus session
  // is running — a Pomodoro FOCUS block or Hyperfocus — and lifts the moment
  // the session ends or a break begins. Electron/Windows only; a no-op
  // everywhere else (window.electron.blocker is undefined on web).
  const focusActive = hyperfocus || pomoFocus;
  useEffect(() => {
    const blocker = typeof window !== "undefined" && window.electron?.blocker;
    if (!blocker) return;
    let cfg = {};
    try {
      cfg = JSON.parse(localStorage.getItem("ligand.blocker") || "{}");
    } catch { /* ignore */ }
    if (!cfg.autoFocus) return;
    if (focusActive) {
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
  }, [focusActive]);
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

  // --- Fresh-start review: guided reshaping of out-of-date goals ----------
  // Detection lives in lib/goalTriage.js; here we hold the offer state
  // (snooze/cooldown), open the wizard, and apply its batched decisions.
  const [freshStartState, setFreshStartState] = useLocalStorage("ligand.freshStart", {});
  const [showFreshStart, setShowFreshStart] = useState(false);
  const triageItems = useMemo(
    () => triageGoals(activeGoals, store.tasks),
    [activeGoals, store.tasks]
  );
  // What the Home entry card shows. Zero during a snooze or right after a
  // finished review — the user just made their calls; nagging them about
  // goals they consciously kept would undo the whole point.
  const triageOfferableCount = useMemo(() => {
    const today = todayKey();
    const s = freshStartState || {};
    if (s.snoozedUntil && s.snoozedUntil >= today) return 0;
    if (s.lastReviewAt && daysBetween(s.lastReviewAt, today) < 7) return 0;
    return triageItems.length;
  }, [triageItems, freshStartState]);

  // --- Sleep diary: the calm morning front door + dashboard card ----------
  // Self-contained under ligand.sleep (see useSleepLog). The gate shows on
  // the first open of a morning until today's night is logged or skipped;
  // "manual" opens come from the sleep card at any hour.
  const { sleepLog, logSleep, removeSleep, entryFor: sleepEntryFor } = useSleepLog();
  const [sleepSkippedOn, setSleepSkippedOn] = useLocalStorage("ligand.sleepSkipped", null);
  const [sleepGateManual, setSleepGateManual] = useState(false);
  // Decided ONCE at mount, then closed only by the user's own tap — so the
  // post-save "Start your day" moment isn't yanked away the instant the
  // entry lands in the log.
  const [morningGateOpen, setMorningGateOpen] = useState(() => {
    // Morning means MORNING: 5:00–11:59. At 1am the user hasn't slept yet —
    // asking "how did you sleep?" then is nonsense (and got reported as such).
    const h = new Date().getHours();
    return (
      settings.sleep?.morningCheckIn !== false &&
      h >= 5 &&
      h < 12 &&
      !(sleepLog || []).some((e) => e.date === todayKey()) &&
      sleepSkippedOn !== todayKey()
    );
  });
  const showSleepGate = sleepGateManual || morningGateOpen;
  // Prefill from the most recent night so a steady sleeper saves in one tap.
  const lastSleepEntry = useMemo(() => {
    const arr = [...(sleepLog || [])].sort((a, b) => a.date.localeCompare(b.date));
    return arr[arr.length - 1] || null;
  }, [sleepLog]);

  const closeSleepGate = () => {
    setSleepGateManual(false);
    setMorningGateOpen(false);
    // A close without a saved entry counts as "skip today" — the gate stays
    // out of the way until tomorrow morning.
    if (!sleepEntryFor(todayKey())) setSleepSkippedOn(todayKey());
  };

  const snoozeFreshStart = () => {
    setFreshStartState((s) => ({ ...s, snoozedUntil: shiftDay(todayKey(), 3) }));
    setShowFreshStart(false);
  };

  const finishFreshStart = (decisions, focusIds) => {
    for (const [goalId, d] of Object.entries(decisions)) {
      if (!d?.action) continue;
      if (d.action === "shrink") {
        const text = (d.stepText || "").trim();
        if (text) store.addTask({ text, label: "Today", goalId, term: "short" });
        store.reviseGoalTargetDate(goalId, d.newDate || null);
      } else if (d.action === "move") {
        if (d.newDate) store.reviseGoalTargetDate(goalId, d.newDate);
      } else if (d.action === "shelve") {
        store.archiveGoal(goalId);
      } else if (d.action === "keep") {
        store.snoozeGoalReview(goalId, 14);
      }
    }
    // Focus picks: pin the chosen keepers, unpin every other active goal so
    // the spotlight actually means something.
    if (focusIds?.length) {
      for (const g of activeGoals) {
        const want = focusIds.includes(g.id);
        if (Boolean(g.pinned) !== want) store.updateGoal(g.id, { pinned: want });
      }
    }
    setFreshStartState((s) => ({ ...s, lastReviewAt: todayKey(), snoozedUntil: null }));
    setShowFreshStart(false);
    // A receipt, so the reset visibly DID something (the feed keeps it).
    const n = { shrink: 0, move: 0, shelve: 0, keep: 0 };
    for (const d of Object.values(decisions)) if (d?.action) n[d.action]++;
    const parts = [
      n.shrink && `${n.shrink} restarted with a tiny step`,
      n.move && `${n.move} given a new date`,
      n.shelve && `${n.shelve} shelved`,
      n.keep && `${n.keep} kept`,
    ].filter(Boolean);
    if (parts.length) {
      notif.push("freshstart", "Reset applied", parts.join(" · ") + ".");
    }
  };
  // When set, the Settings screen scrolls that section into view on open
  // (e.g. avatar menu → Alarms). Cleared once handled.
  const [settingsFocus, setSettingsFocus] = useState(null);
  // "Test alarm": raises the real overlay (sound + photo-scan flow) on demand
  // without waiting for the scheduled time or stamping lastFired.
  const [testAlarm, setTestAlarm] = useState(null);

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

  // Mirror desktop tray preferences into the Electron main process (which
  // can't read localStorage). No-op in the browser/PWA.
  useEffect(() => {
    window.electron?.desktop?.configure?.({
      closeToTray: settings.desktop?.closeToTray ?? true,
      launchAtLogin: settings.desktop?.launchAtLogin ?? false,
    });
  }, [settings.desktop?.closeToTray, settings.desktop?.launchAtLogin]);

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
  //
  // BUDGETED: at most 3 load-time nudges land per day, highest priority
  // first. Eight simultaneous notifications is a wall, and walls get
  // ignored — a short, prioritized list actually gets read. Anything cut
  // by the budget simply tries again tomorrow (the state it describes is
  // still visible on the dashboard cards regardless).
  const firedLoadTriggers = useRef(false);
  useEffect(() => {
    if (firedLoadTriggers.current) return;
    firedLoadTriggers.current = true;

    let budget = 3;
    const tryPush = (type, title, body) => {
      if (budget <= 0) return;
      if (notif.push(type, title, body, { oncePerDay: true })) budget--;
    };

    // Fresh-start review decision first — it also opens the wizard (which
    // doesn't count against the notification budget).
    const offerReview = shouldOfferReview({
      items: triageItems,
      activeGoalCount: activeGoals.length,
      daysAway,
      state: freshStartState,
    });
    if (offerReview) {
      // Open a beat after first paint so the dashboard exists under the
      // overlay (and the modal open isn't a synchronous cascade).
      window.setTimeout(() => setShowFreshStart(true), 400);
    }

    // Priority order: time-sensitive first, ambient encouragement last.
    if (urgentCount > 0) {
      tryPush("urgent", "Urgent tasks", "You have urgent tasks waiting.");
    }
    if (offerReview) {
      tryPush(
        "freshstart",
        "Time for a two-minute reset?",
        "Some goals drifted out of date while life happened. A few taps reshapes them."
      );
    }
    if (overdueGoals.length > 0) {
      tryPush("overdue", "Goals to review", "You have overdue goals to review.");
    }
    if (daysAway >= 3) {
      tryPush("reentry", "Hey, no pressure", "Ligand is here when you're ready.");
    }
    if (uncheckedHabitsCount > 0) {
      tryPush(
        "habit",
        "Keep the momentum going",
        uncheckedHabitsCount === 1
          ? "A habit is still open today. No pressure, just a nudge."
          : `${uncheckedHabitsCount} habits are still open today. No pressure, just a nudge.`
      );
    }
    // Weekly-target nudge (goal-gradient): when exactly ONE more open day
    // makes the week and the week is getting late, say so — a near, concrete
    // finish line pulls; a distant "be consistent" doesn't. Positive framing
    // only, and never early in the week.
    try {
      const target =
        JSON.parse(window.localStorage.getItem("ligand.showUpWeek") || "null")?.target ??
        DEFAULT_TARGET;
      const week = summarizeWeek({
        visitDates: [...(visitDates || []), todayKey()],
        target,
        todayStr: todayKey(),
      });
      if (week.toGo === 1 && week.reachable && week.daysLeft <= 4) {
        tryPush(
          "week",
          "One day from making your week",
          `Today already counts. Just one more open day hits your ${target}-a-week target.`
        );
      }
    } catch {
      /* malformed storage — skip the nudge */
    }
    // A goal that's gone quiet (7+ days with no activity) gets a gentle,
    // NAMED nudge — once per day, never shaming, recovery goals excluded
    // for privacy.
    const quiet = activeGoals.find(
      (g) => g.type !== "recovery" && goalHealth(g, store.tasks).level === "red"
    );
    if (quiet) {
      tryPush(
        "overdue",
        `"${quiet.name}" misses you`,
        "It's been quiet over there. One tiny task today would wake it back up."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Daily reminder — a live tick, not just a load-time check. Runs every 30s
  // so the nudge fires AT the chosen time whenever the app is running (open,
  // in another window, or hidden in the tray) — an external cue at the point
  // of performance, which is what actually works for ADHD prospective memory.
  // push()'s oncePerDay dedup makes repeated ticks past the time harmless.
  // When the user has written an if-then anchor ("after I finish breakfast"),
  // the wording leans on it — implementation intentions beat bare reminders.
  useEffect(() => {
    const { dailyReminder, reminderTime, anchor } = settings.notifications;
    if (!dailyReminder || !reminderTime) return;
    const check = () => {
      const [rh, rm] = reminderTime.split(":").map(Number);
      const now = new Date();
      if (now.getHours() > rh || (now.getHours() === rh && now.getMinutes() >= rm)) {
        const body = anchor?.trim()
          ? `Your plan: after you ${anchor.trim()}, one small check-in. That's the whole ask.`
          : "Just a gentle nudge. One small check-in counts as showing up.";
        notif.push("daily", "Checking in", body, { oncePerDay: true });
      }
    };
    check();
    const id = window.setInterval(check, 30000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.notifications.dailyReminder,
    settings.notifications.reminderTime,
    settings.notifications.anchor,
  ]);

  // Bedtime wind-down nudge — 30 minutes before target lights-out (a steady
  // sleep window is the CBT-I lever, and ADHD "revenge bedtime" needs an
  // external cue, not intention). Modular clock math keeps it working for
  // after-midnight bedtimes; the 3-hour window plus oncePerDay dedup means
  // it fires once and never nags at 4am.
  useEffect(() => {
    const sleepPrefs = settings.sleep || {};
    if (!sleepPrefs.bedtimeReminder || !sleepPrefs.bedtime) return;
    const check = () => {
      const [bh, bm] = sleepPrefs.bedtime.split(":").map(Number);
      if (Number.isNaN(bh) || Number.isNaN(bm)) return;
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const remindMin = (bh * 60 + bm - 30 + 1440) % 1440;
      const dist = (nowMin - remindMin + 1440) % 1440;
      if (dist < 180) {
        notif.push(
          "bedtime",
          "Winding down soon?",
          `Lights-out target is ${sleepPrefs.bedtime}. Starting to land now makes the morning kinder.`,
          { oncePerDay: true }
        );
      }
    };
    check();
    const id = window.setInterval(check, 30000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sleep?.bedtimeReminder, settings.sleep?.bedtime]);

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

  // Theme lives in the device-scoped tweak record alongside accent, palettes,
  // corner radius and density.
  const themeChoice = tweaks.theme;
  const setThemeChoice = (val) => set({ theme: val });

  // The actual light/dark to apply: "auto" follows the OS, otherwise the
  // explicit choice. A wallpaper's tone still wins over this (handled below).
  const resolvedTheme = themeChoice === "auto" ? systemTheme : themeChoice;

  // Apply the chosen wallpaper. The gradient (or photo for custom) is painted
  // behind the ambient blobs via --app-bg; the wallpaper's tone drives the
  // effective light/dark token set so text stays readable on top.
  useEffect(() => {
    const root = document.documentElement;
    let effectiveMode = resolvedTheme;
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
      effectiveMode = hasWallpaper ? wp.tone : resolvedTheme;
      root.dataset.theme = effectiveMode;
      if (hasWallpaper) {
        root.style.setProperty("--app-bg", wp.bg);
      } else {
        root.style.removeProperty("--app-bg");
      }
    }
    // The user's chosen LOOK for whichever mode is actually showing — auto
    // mode swaps palettes together with the mode (Soft Paper by day, Deep
    // Navy by night, for example). EXCEPT in Hyperfocus: its dark token set
    // owns the whole screen, and palette selectors (two attributes) out-rank
    // the hyperfocus block in CSS specificity — a light palette left stamped
    // here would paint light-mode ink onto the hyperfocus dark background
    // (unreadable). So the palette attribute comes off entirely for the
    // duration; it's restored the moment hyperfocus ends.
    if (hyperfocus) delete root.dataset.palette;
    else root.dataset.palette = paletteFor(effectiveMode, tweaks);
  }, [settings.wallpaper.id, settings.wallpaper.customId, resolvedTheme, activeCustom, tweaks, hyperfocus]);

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

  // Command-palette actions (Ctrl/⌘K). Each runs on select; navigation tabs
  // plus the app's main capture/create points, so the palette is a keyboard
  // jump-off for the whole app, not just a search box. Plain const so the
  // React compiler can memoize it (a manual useMemo here made it bail).
  const go = (t) => () => setTab(t);
  const paletteActions = [
    { id: "qa", label: "Quick add…", sub: "Task, note, workout, alarm, or focus", keywords: "new create capture add task note", icon: <Icon.Plus />, run: () => setQuickAddOpen(true) },
    { id: "focus", label: "Start a focus session", sub: "Open the Pomodoro timer", keywords: "pomodoro timer focus deep work", icon: <Icon.Timer />, run: go("pomodoro") },
    { id: "new-goal", label: "New goal", sub: "Create a goal", keywords: "add create goal target", icon: <Icon.Target />, run: () => setShowGoalModal(true) },
    { id: "go-home", label: "Go to Home", sub: "Dashboard", keywords: "dashboard overview", icon: <Icon.Home />, run: go("home") },
    { id: "go-day", label: "Go to Day planner", sub: "The day dial", keywords: "day dial schedule planner ring", icon: <Icon.Timer />, run: go("day") },
    { id: "go-habits", label: "Go to Habits", sub: "Check in on habits", keywords: "habit streak check in", icon: <Icon.CheckCircle />, run: go("habits") },
    { id: "go-tasks", label: "Go to Tasks", sub: "Your task list", keywords: "todo task list", icon: <Icon.Check />, run: go("tasks") },
    { id: "go-notes", label: "Go to Notes", sub: "Scratchpad", keywords: "note scratchpad write", icon: <Icon.Note />, run: go("notes") },
    { id: "go-journal", label: "Go to Journal", sub: "Reflections & mood", keywords: "journal reflect mood diary", icon: <Icon.Book />, run: go("journal") },
    { id: "go-workout", label: "Go to Workout", sub: "Training & routines", keywords: "gym workout exercise fitness routine", icon: <Icon.Dumbbell />, run: go("workout") },
    { id: "go-settings", label: "Go to Settings", sub: "Preferences & appearance", keywords: "settings preferences theme appearance options", icon: <Icon.Gear />, run: go("settings") },
  ];

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

  // Unified quick-add: one capture point (task / note / workout / alarm /
  // focus) opened from the mobile FAB or the desktop topbar +.
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // A workout parsed in quick-add rides here to the Workout tab's review.
  const [quickWorkoutPlan, setQuickWorkoutPlan] = useState(null);

  // Notes can be auto-opened by id after cross-tab jumps.
  const [quickCaptureNoteId, setQuickCaptureNoteId] = useState(null);

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
            workouts={store.workouts}
            alarms={store.alarms}
            focusLog={store.focusLog}
            scheduledWorkouts={store.scheduledWorkouts}
            dayBlocks={store.dayBlocks}
            onOpenWorkout={() => setTab("workout")}
            onOpenPomodoro={() => setTab("pomodoro")}
            onOpenJournal={() => setTab("journal")}
            addJournalEntry={store.addJournalEntry}
            onOpenDay={() => setTab("day")}
            onOpenAlarms={() => {
              setSettingsFocus("alarms");
              setTab("settings");
            }}
            visitDates={visitDates}
            badgeStats={badgeStats}
            unlockedBadgeIds={unlockedBadges.map((u) => u.id)}
            onOpenBadges={() => setShowBadges(true)}
            triageCount={triageOfferableCount}
            onStartFreshStart={() => setShowFreshStart(true)}
            sleepLog={sleepLog}
            onLogSleep={() => setSleepGateManual(true)}
            onOpenSleep={() => setTab("sleep")}
          />
        );
      case "day":
        return (
          <DayPlanner
            dayBlocks={store.dayBlocks}
            addDayBlock={store.addDayBlock}
            updateDayBlock={store.updateDayBlock}
            deleteDayBlock={store.deleteDayBlock}
            tasks={store.tasks}
            toggleTask={store.toggleTask}
            goals={activeGoals}
            scheduledWorkouts={store.scheduledWorkouts}
            alarms={store.alarms}
            onOpenWorkout={() => setTab("workout")}
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
            alarmOnComplete={settings.notifications.pomodoroAlarm}
            ambientOverride={settings.wallpaper?.sound ?? "none"}
            tasks={store.tasks}
            goals={activeGoals}
            hyperfocus={hyperfocus}
            logFocusSession={store.logFocusSession}
            onFocusStateChange={setPomoFocus}
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
      case "sleep":
        return (
          <SleepTab
            sleepLog={sleepLog}
            logSleep={logSleep}
            removeSleep={removeSleep}
            sleepSettings={settings.sleep}
            setSection={setSection}
            onLogNight={() => setSleepGateManual(true)}
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
            scheduledWorkouts={store.scheduledWorkouts}
            addWorkout={store.addWorkout}
            addTemplate={store.addTemplate}
            updateTemplate={store.updateTemplate}
            deleteTemplate={store.deleteTemplate}
            addScheduledWorkout={store.addScheduledWorkout}
            updateScheduledWorkout={store.updateScheduledWorkout}
            deleteScheduledWorkout={store.deleteScheduledWorkout}
            updateFitnessProfile={store.updateFitnessProfile}
            quickPlan={quickWorkoutPlan}
            onQuickPlanHandled={() => setQuickWorkoutPlan(null)}
            meals={store.meals}
            waterLog={store.waterLog}
            addMeal={store.addMeal}
            removeMeal={store.removeMeal}
            addWater={store.addWater}
          />
        );
      case "settings":
        // Phones get a simplified, mobile-focused settings list; the full
        // desktop Settings (Pomodoro, wallpaper, AI config, density, etc.)
        // stays desktop-only where it applies.
        if (isMobile) {
          return (
            <MobileSettings
              mobileTheme={themeChoice}
              setMobileTheme={setThemeChoice}
              tweaks={tweaks}
              setTweak={set}
              settings={settings}
              setSection={setSection}
              requestNotifyPermission={notif.requestPermission}
              notifyPermission={notif.permission}
              accountEmail={user?.email ?? null}
              goals={store.goals}
              onSignOut={handleSignOut}
              onRequestAuth={() => setAuthRequested(true)}
              alarms={store.alarms}
              addAlarm={store.addAlarm}
              updateAlarm={store.updateAlarm}
              removeAlarm={store.removeAlarm}
              onTestAlarm={setTestAlarm}
              focusSection={settingsFocus}
              onFocusHandled={() => setSettingsFocus(null)}
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
            goals={store.goals}
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
            alarms={store.alarms}
            addAlarm={store.addAlarm}
            updateAlarm={store.updateAlarm}
            removeAlarm={store.removeAlarm}
            onTestAlarm={setTestAlarm}
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
      <>
        <StandaloneWindowChrome />
        <div className="app-loading">
          <div className="spinner" />
          <div>{syncHydrating ? "Syncing your data…" : "Loading…"}</div>
        </div>
      </>
    );
  }

  // Arrived via a password-reset email link → let them set a new password
  // before anything else (takes priority over the normal app / auth gate).
  if (recovery) {
    return (
      <>
        <StandaloneWindowChrome />
        <SetNewPassword />
      </>
    );
  }

  // Not logged in and hasn't chosen guest mode → the sign-in / sign-up gate.
  if (showAuthScreen) {
    return (
      <>
        <StandaloneWindowChrome />
        <AuthScreen
          onContinueAsGuest={() => {
            setGuestMode(true);
            setAuthRequested(false);
          }}
        />
      </>
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
      {hfIntro && (
        <div className={`hf-intro hf-intro-${hfIntro}`} aria-hidden="true">
          {hfIntro === "slats" && (
            <>
              <span className="hf-slat s1" />
              <span className="hf-slat s2" />
              <span className="hf-slat s3" />
              <span className="hf-slat s4" />
              <span className="hf-slat s5" />
            </>
          )}
          {hfIntro === "wipe" && (
            <>
              <span className="hf-wipe-core" />
              <span className="hf-wipe-ring r1" />
              <span className="hf-wipe-ring r2" />
            </>
          )}
          {hfIntro === "aurora" && (
            <>
              <span className="hf-aurora a1" />
              <span className="hf-aurora a2" />
              <span className="hf-aurora a3" />
              <span className="hf-aurora-veil" />
            </>
          )}
          {hfIntro === "stripes" && (
            <>
              <span className="hf-stripe p1" />
              <span className="hf-stripe p2" />
              <span className="hf-stripe p3" />
              <span className="hf-stripe p4" />
              <span className="hf-stripe p5" />
            </>
          )}
          {hfIntro === "dawn" && (
            <>
              <span className="hf-dawn-bloom" />
              <span className="hf-dawn-mote m1" />
              <span className="hf-dawn-mote m2" />
              <span className="hf-dawn-mote m3" />
              <span className="hf-dawn-mote m4" />
              <span className="hf-dawn-mote m5" />
            </>
          )}
        </div>
      )}

      <div className="shell">
        <TopNav
          tab={tab}
          setTab={setTab}
          goals={orderedActiveGoals}
          tasks={store.tasks}
          alarms={store.alarms}
          setGoalOrder={store.setGoalOrder}
          activeGoal={activeGoal}
          setActiveGoal={setActiveGoal}
          onAddGoal={() => setShowGoalModal(true)}
          onArchiveGoal={handleArchiveGoal}
          theme={resolvedTheme}
          themeChoice={themeChoice}
          setThemeChoice={setThemeChoice}
          onOpenSearch={() => setShowSearch(true)}
          onOpenQuickAdd={() => setQuickAddOpen(true)}
          notifications={notif.items}
          unreadCount={notif.unreadCount}
          onOpenNotifications={notif.markAllRead}
          onClearNotifications={notif.clearAll}
          userName={userDisplayName}
          onOpenSettings={() => setTab("settings")}
          onOpenAlarms={() => {
            setSettingsFocus("alarms");
            setTab("settings");
          }}
          onOpenBadges={() => setShowBadges(true)}
          onClearData={store.resetData}
          accountEmail={user?.email ?? null}
          onSignOut={handleSignOut}
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
        // The Notes tab has its own "New note" FAB, so suppress the global
        // quick-add FAB there — the phone shows exactly one floating button.
        tab !== "notes" && (
          <button
            type="button"
            className="hf-fab quick-note-fab"
            title="Quick add"
            onClick={() => setQuickAddOpen(true)}
            data-mute-click
          >
            <Icon.Plus />
            <span className="hf-fab-label">Add</span>
          </button>
        )
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

      {showSleepGate && (
        <MorningCheckIn
          manual={sleepGateManual}
          defaults={
            lastSleepEntry
              ? { bedTime: lastSleepEntry.bedTime, wakeTime: lastSleepEntry.wakeTime }
              : {}
          }
          onSave={(draft) => logSleep({ ...draft, date: todayKey() })}
          onSkip={closeSleepGate}
        />
      )}

      {showFreshStart && triageItems.length > 0 && (
        <FreshStartReview
          items={triageItems}
          daysAway={daysAway}
          onFinish={finishFreshStart}
          onSnooze={snoozeFreshStart}
          onClose={snoozeFreshStart}
        />
      )}

      <BadgeCelebration queue={badgeToasts} onDismiss={dismissBadgeToast} />

      <QuickAdd
        key={quickAddOpen ? "qa-open" : "qa-closed"}
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        isMobile={isMobile}
        addTask={store.addTask}
        addNote={store.addNote}
        addAlarm={store.addAlarm}
        onWorkoutPlan={(plan) => {
          setQuickWorkoutPlan(plan);
          setTab("workout");
        }}
        onStartFocus={() => setTab("pomodoro")}
      />

      {(firingAlarm || testAlarm) && (
        <AlarmOverlay
          alarm={firingAlarm || testAlarm}
          onDismiss={() => {
            if (firingAlarm) dismissAlarm();
            setTestAlarm(null);
          }}
        />
      )}

      <SearchModal
        open={showSearch}
        onClose={() => setShowSearch(false)}
        goals={activeGoals}
        tasks={store.tasks}
        journal={store.journal}
        countUps={store.countUps}
        actions={paletteActions}
        onNavigate={handleSearchNavigate}
      />
    </div>
  );
}
