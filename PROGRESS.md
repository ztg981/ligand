# Ligand — Supabase Auth & Cloud Sync — Progress

_Session date: 2026-06-14 (updated 2026-06-30)_

## Phase 5 — Responsive layout + fixes (2026-06-30, Claude Code)

Overnight responsive-design + bug-fix session. Worked section by section,
committing + verifying each (dev + production preview, guest mode, 375 / 1280,
light + dark) with **zero console errors** and a clean `npm run build`
throughout. Core design rule honored: mobile and desktop layouts are
independent — every change is gated behind a width media query so desktop work
never alters mobile and vice-versa (verified at 375 and 1280 for each).

### DONE this session (committed + pushed)

**Section 1 — Time greeting + visit counter + sweep** (`162e7e3`)
- Time-aware greeting in `src/tabs/Home.jsx`: morning (5–11:59) / afternoon
  (12–4:59) / evening (5–8:59) / "Winding down" (9–11:59) / rotating night-owl
  line (12am–4:59am). Uses local time.
- **"Days showing up" accuracy.** Root cause: the headline number came from a
  seeded "What I'm proud of" *count-up* = `daysSince(startDate)` = ELAPSED
  calendar days since install, counted whether or not the app was opened (so it
  read 17 for far fewer real visits). The genuine distinct-opened-days record
  already existed in `ligand.visitDates` (deduped, one per calendar day). Fix:
  new all-time `ligand.activeDays` counter — increments at most once per
  genuinely-new opened day, idempotent against same-day reloads
  (`ligand.activeDaysDay` marker) and React StrictMode double-invoke (ref
  guard), migrated from real `visitDates` history (honest, never elapsed). Home
  shows this; the misleading seed count-up is retired (removed from `seedData`;
  one-time cleanup for existing users matched by its untouched label, flagged in
  `ligand.daysShowingUpMigrated`). NOTE: for logged-in users the cleanup is
  best-effort (runs before cloud hydration); the guest path is exact.
- Sweep: audited ProgressTracker / ai.js helpers / weekly-visit card — all
  already derive from live data. No other static-output bugs found.

**Section 2 — Desktop vertical goal sidebar (≥768px)** (`a86e573`)
- New `src/components/GoalSidebar.jsx`: vertical goal list on the left (icon +
  name + health dot), whole-row vertical drag-to-reorder (dnd-kit), selected
  highlight, hover-archive, independent scroll, "+ New goal" pinned at bottom,
  collapsible to a 60px icons rail (`ligand.goalSidebarCollapsed`).
- New `src/lib/goalHealth.js`: extracted `goalHealth`/`lastActivityKey` from
  Overview so the sidebar dot and Overview cards stay consistent.
- TopNav goal pills wrapped in `.topbar-goals`; main nav tabs stay at top.
- App shell wraps the screen in a `.body` flex row (sidebar + `.content`).
- Desktop-only (all under `@media (min-width:768px)`); mobile untouched.

**Section 3A — Mobile goal dropdown (<768px)** (`0a83681`)
- New `src/components/GoalDropdown.jsx`: button showing the current goal opens a
  full-width sheet of all goals (≥44px rows, selected check) + "+ New goal".
  Completes the goal-nav split: sidebar ≥768, dropdown <768. The old horizontal
  pills (`.topbar-goals`) are now hidden at every width (kept in DOM).

**Section 5 — Desktop two-column Overview (≥980px)** (`333a0a6`)
- Overview's Daily Focus + goals grid wrapped in an `.ov-layout` grid (340px
  focus column + flexible goals column) so the goals overview is visible
  without scrolling past a tall habits list; habit/task rows densified in the
  narrow column. Collapses to single stacked column <980px (mobile unchanged).

### Final sweep (this session) — PASSED
- `npm run build` clean (only the pre-existing >500 KB bundle warning).
- **Production preview** (`npm run preview`): all 7 tabs + a goal tab at 1280
  (sidebar) and 375 (bottom nav + goal dropdown) — **zero horizontal overflow,
  zero console errors**. Light + dark verified during section work.

### NOT done — picked up next session (in priority order)
Stopped cleanly here to keep a clean partial rather than a broken whole; the
two biggest items (rest of Section 3, and Section 4) were left untouched so
they aren't half-built.
- **Section 3B — mobile bottom tab bar reconsider.** Pick 4–5 most-used mobile
  tabs; move Pomodoro behind a menu, Settings into the avatar menu, and surface
  Workout prominently. NOTE: this is coupled to Section 4 — the Workout tab
  doesn't exist yet, so 3B should be done *after* (or with) Section 4. The
  current bottom bar (6 tabs) still works and is untouched.
- **Section 3C — combined mobile Home/Overview** (greeting, what-needs-attention
  with inline check-in, compact goals summary, quick-capture button).
- **Section 3D — mobile polish** (44px targets sweep, Notes FAB + full-screen
  flow, Journal writing area, keyboard-safe layouts).
- **Section 4 — sophisticated workout system** (NOT STARTED). Build in the
  staged order from the brief: (1) data model + ~50–80 exercise library,
  (2) fitness profile + manual logging, (3) progress tracking + PRs + badges,
  (4) intelligent generation, (5) in-gym mobile flow with auto rest timer.
  Each stage is a clean checkpoint. New data should live under `ligand.*` /
  `data.*` so it syncs with no sync-layer changes (see the keyspace note below).

### Notes for next session
- Breakpoints in this codebase: bottom-nav switches at **≤640px**; the new
  goal-nav split uses **768px** (sidebar ≥768 / dropdown <768); Overview
  two-column uses **980px**. Between 640–768 the main tabs are still in the top
  bar (no bottom nav) and the goal dropdown shows — acceptable tablet band.
- The desktop goal sidebar takes 222px, so the desktop content column is
  narrower than before; existing responsive grids reflow fine.
- Recovery goals keep their leaf distinction in both the sidebar and dropdown.

## Phase 4 — Six-feature session (2026-06-29, Claude Code)

Built six features in order, each committed separately. Every section was
verified live in the browser (guest mode) at 375 / 768 / 1280 in light / dark /
auto, with **zero console errors**, and `npm run build` clean throughout.
All new data lives under the existing `ligand.*` keyspace, so it syncs to the
cloud for logged-in users with no sync-layer changes (the blob includes
`data.notes`, `ligand.badges`, `ligand.badgesKnown`, `ligand.journalSort`).

### Section 1 — Notes tab (commit 1)
A calm, iPhone-Notes-style scratchpad in the main nav between Journal and
Settings. `src/tabs/Notes.jsx` + `data.notes` array + store `addNote /
updateNote / removeNote` + `createNote` factory.
- List newest-first (by `updatedAt`); first line = title, rest = preview,
  relative timestamp ("just now" / "2 hours ago" / "yesterday" / "Jun 14").
- Inline editor, **debounced 500ms auto-save**, no save button.
- Large "New note" button creates a blank note and focuses it.
- Search bar filters by content; trash icon (hover on desktop, always on
  touch); blank notes are discarded on leave so the list never clutters.
- Mobile: full-width list ↔ editor with a back button. Empty state copy.

### Section 2 — Overview tab replaces Productivity (commit 2)
Removed the redundant built-in **Productivity** main-nav tab; the Productivity
goal still lives in the goal pills. New `src/tabs/Overview.jsx`:
- **Daily Focus** card: habits not checked in today (with inline quick
  check-in), Today/Urgent tasks not done, overdue goals — or "You're all
  caught up. Great work today."
- **Goals grid**: one compact card per goal — weekly habit progress, task
  progress, recovery days-free, "Go to goal →", health color-coded green
  (on track) / amber (behind) / red (overdue or quiet 7+ days).
- Added shared `store.updateHabit`; new Grid/Note/Pencil/Map/Pin2 icons.

### Section 3 — Habit editing (commit 3)
Inline habit-name editing via `store.updateHabit`. Pencil icon on hover
(always shown on touch); Enter / blur saves; Escape cancels (guarded so the
unmount blur can't override the cancel). Works in the goal-tab HabitChecker
**and** the Overview quick check-in; renames propagate everywhere.

### Section 4 — Journal sort order (commit 4)
- Newest-first default (robust sort by `createdAt`, not insertion order).
- "Newest / Oldest" toggle near the journal & reflection headers.
- Main Journal persists sort app-wide (`ligand.journalSort`); goal-tab
  reflections persist **per goal** (`goal.reflectionSort`).
- Entries show full date + time ("Jun 14, 2026 · 9:42 AM") via shared
  `formatEntryDateTime`.

### Section 5 — Location + time on journal entries (commit 5)
- Timestamps already full-precision; now clearly displayed (Section 4).
- "Add location" button in journal & reflection compose areas
  (`src/components/LocationPicker.jsx`, `src/lib/geolocate.js`).
- Browser geolocation → reverse-geocode via OpenStreetMap Nominatim →
  store **only** the resolved city/neighbourhood name. Coordinates never
  leave the helper and are never persisted (verified no leak in storage).
- Privacy note: "Only the city name is saved, never your exact location."
- Denied / unavailable / offline all fail silently with a gentle hint.
- Saved entries show a "📍 City" chip. New `createReflection.location`.

### Section 6 — Badges overhaul (commit 6)
- **Celebration modal** (`src/components/BadgeCelebration.jsx`) replaces the
  toast: dark overlay, large glowing/pulsing badge, name + description, a warm
  personal message, a pure-CSS particle burst, "Nice" button. Plays the chime
  per badge; queues multiple ("Nice · N more"); never celebrates twice;
  respects reduced-motion. (Removed the old `BadgeToast.jsx`.)
- **23 badges** total (was 11), grouped Consistency / Milestones / Recovery /
  Focus / Writing. New: Night Owl, Early Bird, Streak Saver, Clean Slate, The
  Long Game, Depth Charge, Overachiever, Reset & Rise, Five Goals, Polymath,
  Daily Ritual, Marathon. New stats derived in `App.jsx`; recovery resets now
  record a counter (`recoveryData.resets`) for Reset & Rise.
- Badges view shows **locked** badges greyed with their requirement text,
  earned ones with unlock date, per-category counts, and "X / 23 earned".
- **Upgrade safety**: when the badge set grows, already-satisfied new badges
  are granted silently (tracked via `ligand.badgesKnown`) so existing users
  don't get a storm of celebrations — verified.

### Final verification
- `npm run build` clean (only the pre-existing >500 KB bundle warning).
- Production `npm run preview` served; guest flow exercised end-to-end.
- 375 / 768 / 1280 — no real horizontal overflow (the 15px seen at 768 was the
  vertical scrollbar, confirmed). Light / dark / auto all correct (auto follows
  the OS scheme). **Zero console errors / warnings.**

## Phase 3 — Recovery/Sobriety Tracker (2026-06-16, Claude Code)

Completed a mid-session feature that had hit a context limit. All code was
verified against the previous session's partial work (SmartGoalModal, model.js,
recovery.js were confirmed correct), then the remaining UI was built.

### What landed (committed `911e3eb`, pushed, edge function redeployed)

**New goal type: `recovery`**
- `src/lib/recovery.js` — pure helpers: `recoveryDays()`, `nextMilestone()`,
  `newlyReachedMilestones()`, `encouragingLine()`, `recoveryFallback()`,
  `RECOVERY_MILESTONES` (11 real milestones: 1d → 5y), `RECOVERY_PROMPTS`.
- `src/lib/model.js` — added `GOAL_TYPES.RECOVERY`, `recoveryData` field
  on `createGoal()`.

**SmartGoalModal** — two-card goal-type chooser ("A goal" | "A recovery tracker")
as the first screen before the SMART wizard or the 3-step recovery flow.
The recovery creation asks: what, since when, why.

**RecoveryGoalTab** (`src/components/RecoveryGoalTab.jsx`) — full tab UI:
- Large hero counter (80px mono font): "X days free from [label]"
- Milestone progress bar: prev → next milestone with days-away label
- Milestone celebration: soft chime + in-hero toast on first reach;
  milestones persist in `recoveryData.milestonesReached` (never repeat)
- "Why this matters" card: inline editable, shown as styled quote
- AI insight card: `recovery_insight` action, compassionate 1-2 sentence
  encouragement grounded in days / why / recent journal
- Journal section: recovery-specific rotating prompts, full entry history,
  rotate-prompt button
- Milestones earned log in sidebar
- Reset-streak: bottom of sidebar, not prominent. Clicking opens a
  full-screen overlay with large compassionate text and two buttons:
  "Start fresh from today" / "Go back" (never "Cancel"). Reset keeps
  all journal entries + reached milestones, auto-adds a gentle entry.

**Nav pill** — recovery goal pills show `Icon.Leaf` (9px) instead of the
color dot; subtle to a glancing eye. CSS: `.tab .recovery-leaf`.

**Home privacy**
- Recovery goals explicitly filtered from the overdue goals list
  (they can't have deadlines, but the filter makes intent permanent)
- Notification bodies are already generic (no goal names); confirmed safe

**AI: gemini-insights edge function** — new `recovery_insight` action with
a distinct `recoveryPhilosophy` system instruction (compassionate, grounded,
never hollow). `aiApi.js` wired with the rotating `recoveryFallback()` lines.
Edge function redeployed to project `auypprgibgftwpwuvxqa`.

**CSS** — `goal-kind-grid/card` chooser styles + full recovery tab design
system: `.recovery-hero`, `.recovery-hero-days`, `.recovery-milestone-track`,
`.recovery-milestone-toast`, `.recovery-reset-overlay`, `.recovery-reset-card`.

### Build status
- `npm run build` clean (only pre-existing >500 KB bundle warning).
- Edge function deployed; recovery_insight action live.
- All changes pushed to `master`.

### Guest mode
Recovery goals work fully in guest mode (local-only). AI insight falls back
to rotating compassionate lines when not logged in.

### To test the full feature
1. Click `+` in the goal nav → "A recovery tracker"
2. Fill in: what you're working on, when the streak started, why it matters
3. The recovery tab opens with the hero counter, milestone bar, AI insight
4. Navigate away and back — milestone celebrations fire only once per streak
5. Try "Start a new streak" at the bottom of the right column



This document is the source of truth for what landed, what's verified, what's
**not** verified, and the **two manual Supabase dashboard steps** you must do to
finish the job.

> The Supabase auth/sync content below is from the original session. Newer work
> (mobile, forgot-password, and three feature tasks) is logged in
> **"Later sessions"** immediately below.

## Phase 2 — Stability audit + new features (2026-06-15, Claude Code)

Picked the project back up after the Antigravity session. **Did an
evidence-based stability audit first**, then built all seven Phase 2 features.
Everything below is committed and pushed to `master`.

### Stability audit — result: stable (no blocking problems)
- `npm run build` clean; PWA `sw.js` generates; manifest icons present.
- **Goal tabs no longer white-screen** (Productivity/Side Hustles/College all
  render; no `Icon.Sparkles` anywhere). AI Insight card is compact (14px icon),
  honest labels.
- **AI backend verified by direct call**: deployed `gemini-insights` returns
  HTTP 200 + a real grounded sentence; `geminiStatus:200` confirms
  `gemini-3.5-flash` is valid. No key / no raw Gemini response in the payload.
- `aiApi.js` logic sound (refresh bypasses cache; only valid AI text cached;
  fallback never overwrites a good cache; dev-gated logs). Guest mode graceful,
  zero console errors across all tabs. Phase 1 features (PWA, bg-music, focus
  mode, goal reorder) all wired and rendering.
- **Edge Function thinking config (P2.7 note):** the function sends **no**
  `thinkingBudget` and **no** `thinking_level` — just `temperature` +
  `maxOutputTokens: 4000`. So there's no stale-parameter conflict. Default
  thinking (medium for 3.x) + the 4000 budget produces full output (verified).
  Trimmed the success debug payload to `{hasGeminiKey, geminiStatus,
  extractedTextLength}`.
- **Transient Gemini 503s** ("model experiencing high demand") were observed
  intermittently during testing. These are Google-side, not our code — the app
  degrades correctly to "Using fallback" / "Last AI insight" when they happen.

### Phase 2 features — all 7 DONE, verified, committed & pushed
1. **Weekly AI review** — `weekly_review` action on the Edge Function
   (redeployed) + a "Your week" card on Home. Per-ISO-week cache, manual
   refresh, honest labels. Backend returns a grounded review (spotted a real
   weekday pattern); logged-in UI shows AI-generated text; guest shows
   fallback; transient Gemini 503 → fallback. Fixed a self-introduced
   StrictMode double-invoke bug in the widget's fetch effect.
2. **Habit heatmap** — goal-tab widget: 12-week GitHub-style grid per habit,
   missed days neutral (never red). Cells match check-ins; persists.
3. **Saved Pomodoro presets** — quick-select chips (apply/save/rename/delete),
   3 seeded defaults, in `ligand.pomodoroPresets` (syncs / local).
4. **Recurring tasks** — Daily / Weekly(weekday) repeat picker; completing
   records `completedOn`; resets to not-done on the next occurrence (on load +
   window focus). Repeat chip on rows. Verified daily/weekly reset + controls
   (one-off & same-day never reset); filters unaffected.
5. **Achievement badges** — 11 milestones in `ligand.badges`, a Badges view in
   the avatar menu, gentle unlock toast + chime. First run silently grants
   already-earned badges (no toast spam for returning users).
6. **Time tracking per goal** — Pomodoro "Focusing on" task selector; a
   completed focus block logs `{date, minutes, goalId}` to `ligand.focusLog`;
   GoalProgress shows "Focused <this week> · <all-time>" (calendar-week, own
   goal only). "Deep focus" badge (10 sessions) added.

7. **Gemini thinking-level tuning** — DONE (redeployed). Added
   `generationConfig.thinkingConfig.thinkingLevel: "low"` (maxOutputTokens
   4000 kept as a safety margin). Confirmed empirically against the live
   function: the param is valid/honored and cut latency from **~5.7s → ~3.7s**
   (~35%) with **no quality regression** — goal-summary, journal-prompt, and
   the multi-sentence weekly_review all still return complete, on-tone text
   (weekly_review still correctly spotted the weekday pattern).

### Final sweep — PASSED
- `npm run build` clean (only the pre-existing >500 KB bundle warning).
- Dev: every tab at 1280/768/375 in light/dark/auto — no overflow, **zero
  console errors**.
- Prod preview (4173): every tab at 1280 light + 375 dark — all six new
  features present and rendering, **zero console errors**.
- Reminder for the live site: because of the PWA service worker, hard-refresh
  (Ctrl/Cmd+Shift+R) to pick up the new build.

## Phase 2 — Gemini AI Integration Session (2026-06-15)

### Files Touched
- `supabase/functions/gemini-insights/index.ts` (Edge Function using Gemini API)
- `src/lib/aiApi.js` (Frontend AI api handler, caching layer, silent fallbacks)
- `src/widgets/GoalProgress.jsx` (Goal Summary AI Widget integration)
- `src/tabs/GoalTab.jsx` (Overdue Goal Review Advice integration)
- `src/widgets/Reflections.jsx` (Journal/Reflection prompt generation)
- `PROGRESS.md` (Updated logs)

### Features Added
1. **At-a-glance goal summary widget**: Brief summary plus one gentle next-step suggestion using the goal's context (tasks, habits, progress).
2. **Overdue goal review advice**: Gentle 1-2 sentence recommendation on whether to revise, archive, or keep going for overdue goals.
3. **Journal prompt**: One contextual reflection prompt based on current goal context (recent tasks and activities).

### Build & Verification Results
- **Build Status**: Built successfully (`npm run build`) in 977ms with zero errors.
- **Preview Server**: Verified working locally on `http://localhost:4175/` with `npm run preview`.
- **Function Naming**: Verified that the frontend invokes the exact Edge Function name: `gemini-insights`.
- **Git Cleanliness**: Run `git status` confirmed no temporary planning files (`implementation_plan.md`, `task.md`, `walkthrough.md`) or local environment variables (`.env.local`) are committed.
- **AI Fallback Behavior**:
  - The app remains completely functional when the Edge Function is not deployed or when the Gemini API key is missing.
  - Guest mode degrades gracefully without breaking.
  - Silent fallbacks are rendered instead of scary errors.
  - The browser console is kept clean of spammy expected errors when logged out or when Supabase is not configured.
- **Cache Behavior**:
  - AI results are cached for 24 hours using `window.localStorage` (keys: `ligand.aiCache.[goalId].[action]`).
  - Cache key names are stable and unique.
  - Caching works seamlessly in localStorage for guest and logged-in mode without database schema or RLS policy changes.
- **Security**:
  - The Gemini API key is never exposed in the frontend code or committed to Git.
  - The Edge Function reads the API key strictly from the Supabase environment secrets variable (`GEMINI_API_KEY`).

### Hotfix (2026-06-15)
- **Fix Goal Tab React Crash (Error #130)**: Resolved an issue where navigating to a goal tab caused a white-screen crash due to an undefined component (`<Icon.Sparkles />` instead of `<Icon.Spark />`) being rendered in `GoalProgress.jsx`.
- Added defensive null guards and optional chaining across AI API calls in `GoalProgress.jsx`, `GoalTab.jsx`, and `Reflections.jsx` to prevent runtime crashes if goal or task payloads are incomplete.

### AI Insight Caching & Refresh Improvements (2026-06-15)
- **Edge Function Response Schema**: Upgraded `gemini-insights` to return `{ text, ok, debug }` schema, providing non-secret diagnostics (`typeReceived`, `hasGeminiKey`, `geminiStatus`, `extractedTextLength`, `extractedTextPreview`) on success and failure without exposing API keys.
- **Deterministic Refresh**: Configured "Refresh" button to bypass cache with `forceRefresh = true` parameter, update timestamp on every attempt (success or failure), and never get stuck.
- **Improved Caching**:
  - Excluded invalid/fallback text from overwriting valid cached AI text.
  - Page-load network failures do not destroy old valid cached AI responses.
  - Automatically deletes invalid, outdated, or generic ADHD-shaming text from localStorage.
- **Quality Filters**: Enforced strict validation checking that AI insights are complete sentences (at least 35 characters, 8 words, ending in punctuation) and not generic ADHD-shaming phrases ("It's okay", "Keep going", "You got this", etc.).
- **UI Labels**: Added honest status badges in `GoalProgress.jsx`: `(AI-generated)`, `(Last AI insight)` when utilizing cached AI text on fresh invoke failures, and `(Using fallback)` on actual fallbacks.

### Final Production Cleanup & Stability Audit (2026-06-15)
- **Edge Function Response Sanitization**: Removed `rawGeminiResponse` payload from the success debug metadata response to completely hide internal Gemini API details, thoughts, and structure in production.
- **Verification of Caching & Refresh**: Audited and confirmed that Refresh correctly bypasses cache, does not overwrite valid old caches on failure, and updates timestamps dynamically.
- **Security Check**: Verified that `GEMINI_API_KEY` remains strictly in Supabase secrets, and is never leaked to git history, frontend code, or log files.
- **App Integrity**: Verified guest/logged-out fallback flows work seamlessly, preventing any PWA, layout, or navigation crashes.

---

## Phase 1 Feature Session (2026-06-14)

### PWA and Offline Support
- Added `vite-plugin-pwa` configured for `autoUpdate` to prevent stale caches
- Generated missing PWA icons (`pwa-192x192.png`, `pwa-512x512.png`, etc.)
- Injected strict PWA metadata (`manifest.webmanifest`, theme-color, apple-touch-icon) into `index.html`
- Wired `virtual:pwa-register` into `App.jsx`
- Re-purposed the red `<OfflineBanner />` to only show on explicit connection loss

### Background Music
- Implemented app-wide background music singleton (`bgMusicPlayer.js`) distinct from Pomodoro ambient sound
- Reuses existing CC0 ambient sounds (rain, stream, waves, birds, wind)
- Global volume/track controls added to `Settings.jsx`
- Starts only on explicit user interaction, persists across tabs

### Pomodoro Focus Mode
- Added fullscreen "Focus Mode" overlay to Pomodoro timer
- Hides all tabs and widgets, showing only the background photo and the timer ring
- Small frosted-glass "Exit focus" button and Escape key support
- Auto-exits cleanly when the timer is paused or stopped
- Uses an accessible fade-in transition and respects `prefers-reduced-motion`

### Goal Tab Reordering
- Added `goalOrder` property to data store without migrating old user data
- Compute `orderedActiveGoals` in `App.jsx` with fallback to natural order
- Swapped rigid Goal Tab mapping to use `@dnd-kit/sortable`
- Persists user drag-and-drop tab order to `store.data.goalOrder`

---

## Later sessions (post-Supabase)

### Mobile / responsive layout (verified 375 / 768 / 1280, light + dark)
- Phone (≤640px): the 6 main tabs move to a fixed **bottom tab bar**; the top
  bar slims to brand-dot + scrollable goal pills + tools. Tablet/desktop keep
  the original pill nav.
- Single-column collapse for Home, goal widgets, Journal; Tasks add-bar and rows
  reflow; Pomodoro window switches to 4/3 so the timer ring has room; touch
  sizing for inputs/buttons; goal-widget drag grip is touch-draggable.

### Forgot-password flow
- "Forgot password?" on sign-in → `resetPasswordForEmail` (verified the call
  succeeds). A `SetNewPassword` screen shows on the `PASSWORD_RECOVERY` event
  (verified render + validation via a temporary forced flag, reverted).
- Note: for the reset email to deliver in production, add the app origin to
  Supabase → Authentication → URL Configuration (Site URL / redirect allowlist).

### Feature tasks (verified dev + prod preview, light/dark/auto, mobile)
1. **Auto theme** — Light/Dark/**Auto** in Tweaks + Settings. Auto follows
   `prefers-color-scheme` live (matchMedia listener, updates without reload). A
   wallpaper's tone still overrides; Auto only applies with no wallpaper.
   Presets stay explicit Light/Dark; reset keeps the Light default.
2. **Wallpaper gallery** — up to 5 custom photos in `ligand.customWallpapers`
   (migrated from the old single key), selected via `wallpaper.customId`.
   Settings shows built-ins + customs in one grid with thumbnails + remove (×)
   and an upload tile. Kept the ~1.5 MB per-image warning; added a hard ~4 MB
   combined cap (blocks the add) since wallpapers sync to the cloud.
3. **Upcoming dates widget** — cross-goal list of goal target dates, soonest
   first, overdue floated up with a gentle "Review" chip (no harsh red). Added
   to the goal-tab widget picker (threads all goals + onOpenGoal via context)
   and as a card on Home. Goals with no target date are omitted.

---

## TL;DR

- **Phases 1–4: built and committed.** Auth, schema SQL, the localStorage↔cloud
  sync layer, and the first-login import prompt are all implemented.
- **The app still works exactly as before for guests** — verified in both the
  dev server and the production preview, zero console errors. Cloud features are
  100% dormant unless a user signs in, so nothing that worked before is at risk.
- **Phase 5 security check: PASSED (2026-06-14).** The table was created, email
  confirmation turned off, and the full two-account isolation harness ran with
  the anon key — **all six checks PASS**. Cross-user data isolation is proven
  (see Phase 5 below).
- **End-to-end UI walkthrough: PASSED (2026-06-14).** Drove the full logged-in
  flow in the browser — sign up, migration import & start-fresh, add-task sync,
  reload-from-cloud, second-device, offline pill + recovery, and logout. All
  green, zero console errors. Found and fixed one real bug along the way (the
  migration prompt fired for brand-new users — see below). Details in the
  "End-to-end UI walkthrough" section.

---

## What you need to do (manual, ~5 min)

These need the dashboard because the app ships only the **publishable/anon key**,
which by design cannot create tables or change auth settings.

1. **Create the table + RLS policies.**
   Dashboard → **SQL Editor** → New query → paste all of
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**. Expect "Success."

2. **Allow a sign-in path for testing** (pick one):
   - **Recommended for now:** Dashboard → **Authentication → Sign In / Providers
     → Email** → turn **OFF "Confirm email"** → Save. This lets accounts sign in
     immediately. (Re-enable later if you want email confirmation in production.)
   - Or keep confirmation on and manually confirm two users under
     **Authentication → Users**.

Then run the security check in [`supabase/verify-rls.md`](supabase/verify-rls.md)
(copy-paste console harness). **All six checks must say PASS before you rely on
this in production.**

---

## Status by phase

### Phase 1 — Setup + Auth ✅ built & verified
- Installed `@supabase/supabase-js`.
- `.env.local` holds `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`; it is
  **gitignored** (verified not staged) so the key is never committed.
- `src/lib/supabaseClient.js` — shared client, `isSupabaseConfigured` guard so a
  clone without env vars silently runs local-only instead of crashing.
- `src/hooks/useAuth.jsx` — `AuthProvider` context: session/user/loading,
  `signUp` / `signInWithPassword` / `signOut`, `onAuthStateChange` listener.
- `src/components/AuthScreen.jsx` — email + password, Sign in / Create account
  toggle, **prominent "Continue without an account"**, inline error + email-
  confirmation notice.
- `App.jsx` gates: loading veil while session resolves → auth screen when no
  session and not a guest → app. `ligand.guestMode` flag remembers the guest
  choice across reloads.
- Avatar menu shows account email + **Sign out** when logged in, or **"Sign in
  or create account"** (re-opens the auth screen) when a guest.

**Verified (browser):** auth screen gates the app; signup round-trips to
Supabase and **creates a user** (confirmed a real `user_id` came back);
"Continue without an account" enters the app and **persists across reload**;
avatar menu shows the correct guest state and re-opens auth.

### Phase 2 — DB schema + RLS ✅ written, ⚠️ must be run manually
- [`supabase/schema.sql`](supabase/schema.sql): `public.user_data` (`user_id`
  uuid PK → `auth.users`, `data` jsonb, `updated_at`), **RLS enabled**, and four
  policies (SELECT/INSERT/UPDATE/DELETE) all gated on `auth.uid() = user_id`,
  plus an `updated_at` trigger. Idempotent (safe to re-run).
- **Not executed** — the anon key can't run DDL. Confirmed via the client the
  table does not exist yet (`PGRST205`). **This is manual step #1 above.**

### Phase 3 — Data sync layer ✅ built, ⚠️ logged-in path unverified
- `src/lib/syncManager.js` — pure helpers: `collectLocalBlob`,
  `applyBlobToLocal`, `clearLocalBlob`, `hasMeaningfulLocalData`,
  `fetchUserData`, `pushUserData`. The device-local `ligand.guestMode` flag is
  excluded from sync.
- `src/hooks/useSupabaseSync.js` — orchestration:
  - On login: fetch the user's row. **Cloud is source of truth** → hydrate
    localStorage and React state (via a `ligand:hydrate` event).
  - On local writes: **debounced ~1.5s** push of the whole blob. No-op pushes
    are skipped (byte-identical guard), which also prevents an echo right after
    hydration.
  - Fetch failure (table missing / network down) → status **"offline"**, keeps
    using localStorage. No data loss, no crash.
  - Exposes `needsMigration` + `runMigration` (the Phase 4 seam).
- `src/hooks/useLocalStorage.js` — now dispatches `ligand:localwrite` after each
  write and re-reads on `ligand:hydrate`. **Both are inert in guest mode** (no
  listeners / never fired), so local-only behavior is byte-for-byte unchanged.
- `App.jsx` — calls the sync hook, extends the loading veil to cover the initial
  cloud fetch, shows a small **Sync/Offline pill** in the top bar (nothing in
  guest mode or when synced).

**Verified:** guest mode unaffected (dev + prod, all tabs, localStorage
persists, zero console errors). **Not verified:** the fetch/hydrate/push cycle
with a real session (blocked — see below).

### Phase 4 — First-login migration ✅ built, ⚠️ flow unverified
- `src/components/MigrationModal.jsx` — on a brand-new account's first sign-in
  **with meaningful local data**, asks "Bring your data along?" → **Import my
  data** (push current local blob as the first row) or **Start fresh** (wipe
  local + empty row). If there's nothing meaningful, it silently creates an
  empty row (no prompt).
- `hasMeaningfulLocalData()` only counts real content (tasks/journal/count-ups
  or non-seed goals/habits/reflections), so the fresh seed alone doesn't trigger
  the prompt.

**Verified:** the modal renders correctly (title, both actions, icon, note) when
forced; guest mode never shows it. **Not verified:** the actual import vs
start-fresh outcome against a live row (blocked).

### Phase 5 — Security verification ✅ PASSED (2026-06-14)
**The full isolation harness was run against the real table and all six checks
PASSED.** The two earlier blockers were cleared: the `user_data` table was
created via `schema.sql`, and email confirmation was turned OFF so real sessions
could be obtained.

Run with the **publishable/anon key** (the exact key the shipped app uses, so
this reflects real production enforcement — not a privileged bypass):

```
✅ A can read its own row
✅ B can read its own row
✅ B CANNOT read A's row (RLS isolation)      — rows returned: 0
✅ B CANNOT overwrite A's row                 — rows updated: 0
✅ A's data still intact after B's attempts   — still ACCOUNT_A, not HIJACKED
✅ Anonymous (signed-out) read returns nothing — rows: 0
```

Cross-user isolation is **proven**: SELECT and UPDATE are both locked to
`auth.uid()`, A's data survived B's tamper attempts unchanged, and the anon key
alone exposes no data. The reusable harness lives in
[`supabase/verify-rls.md`](supabase/verify-rls.md) if you want to re-run it.

---

## End-to-end UI walkthrough ✅ PASSED (2026-06-14)

Drove the entire logged-in experience through the running app in the browser
(not just the data layer). Every step verified against both localStorage and an
independent cloud read. **Zero console errors** the whole way.

| # | Scenario | Result |
|---|----------|--------|
| 1 | Pristine seed → sign up | **No** migration prompt; silent cloud row created with the seed blob (`ligand.guestMode` correctly excluded) |
| 2 | Add a task while logged in | Debounced ~1.5s push; task appears in cloud, `updated_at` advances |
| 3 | Delete task locally, then reload | Task **reappears** — proves load hydrates from cloud, not localStorage |
| 4 | "Second device" (clear all local, sign in fresh) | Task arrives from cloud; no prompt (row exists); data follows the account |
| 5 | New account + guest data → **Import** | Migration modal shows; both guest tasks pushed into the new account's row |
| 6 | New account + guest data → **Start fresh** | Local resets to seed; **no guest tasks leak** into the new account's cloud row |
| 7 | Sync pill | "Offline" shown on forced push failure (local write **not** lost); clears to synced on recovery and the queued write flushes up. "Synced" state is intentionally pill-less. |
| 8 | Logout | Returns to auth screen (→ guest), session cleared, **guest local data preserved** |

### Bug found & fixed during the walkthrough

**The first-login migration prompt fired for every brand-new user**, even ones
who'd created nothing. `hasMeaningfulLocalData()` was meant to suppress the
prompt on a bare seed, but its checks didn't match the real seed:

- `createGoal` defaults `type: "custom"`, so the seed's two starter goals
  ("Side Hustles", "College Planning") tripped the "any custom goal" check.
- The seed also ships **one** count-up, which tripped the "any count-up" check.

Fix: the goal check now ignores the known seed goal ids (`SEED_GOAL_IDS`,
exported from `model.js`) unless the user fleshed them out with habits or
reflections, and only **extra** count-ups (beyond the seeded one) count. Tasks
and journal entries still count as before. Result: a pristine install signs up
silently (verified in scenario 1), while real user data still triggers the
prompt (scenarios 5 & 6). Files: `src/lib/model.js`, `src/lib/syncManager.js`.

### Notes / minor observations (not bugs)

- **"Start fresh" cloud row holds the fresh seed, not a literal `{}`.** After
  `runMigration(false)` clears local and pushes an empty blob, the
  `useLocalStorage` hooks immediately re-seed defaults, and the next debounced
  push sends that seed. Net effect matches what the user sees (a clean app), and
  no prior guest data carries over — confirmed in scenario 6.
- **"Multiple GoTrueClient instances" console warning during testing** comes
  only from the verification harness spinning up a *second* Supabase client in
  the same tab. The shipped app has a single client, so users never see it.

---

## How the sync works (architecture)

```
guest (no session):   useLocalStorage  ⇄  localStorage      (cloud code dormant)

logged in:            useLocalStorage  ⇄  localStorage
                              │  ligand:localwrite (debounced 1.5s)
                              ▼
                       useSupabaseSync  ──upsert──▶  user_data.data (jsonb)
                              ▲
                              │  on login: fetch → applyBlobToLocal → ligand:hydrate
```

The entire `ligand.*` keyspace is stored as one JSON blob per user, mirroring
the existing local model. Cloud wins on login; local writes flow up debounced.

---

## Notes / housekeeping

- **Test accounts created during verification** (all harmless — delete from
  Authentication → Users, and their rows from the `user_data` table, if you like):
  - Phase 1 probing: `ligand.qa.alpha@gmail.com`, a couple
    `ligand.qa.<timestamp>@gmail.com`.
  - Phase 5 RLS harness: `ligand.rls.a@gmail.com`, `ligand.rls.b@gmail.com`.
  - UI walkthrough: `ligand.e2e.a.<ts>@gmail.com`, `ligand.e2e.b.<ts>@gmail.com`,
    `ligand.e2e.c.<ts>@gmail.com` (all with password `TestPass123!`).
  `test1@example.com` was **rejected** by Supabase (it blocks `example.com`) —
  use real-domain emails (e.g. gmail) for test accounts.
- **Bundle size:** adding supabase-js pushed the JS bundle to ~590 KB (gzip
  ~168 KB) and Vite prints a >500 KB warning. It's only a warning. If you want
  it gone later, code-split the Supabase client behind a dynamic import — not
  done now to avoid churn.
- **Minor:** there's a very brief "Loading…" veil on every startup while the
  initial session check resolves (it reads localStorage, no network). Negligible
  for guests; left as-is.
- **Sign-out behavior:** signing out returns you to the auth screen unless you'd
  previously chosen guest mode on this device.

---

## Files added / changed

**Added**
- `src/lib/supabaseClient.js`
- `src/hooks/useAuth.jsx`
- `src/hooks/useSupabaseSync.js`
- `src/lib/syncManager.js`
- `src/components/AuthScreen.jsx`
- `src/components/MigrationModal.jsx`
- `supabase/schema.sql`  ← run this in the dashboard
- `supabase/verify-rls.md`  ← run this after the table exists
- `.env.local` (gitignored, not committed)

**Changed**
- `src/main.jsx` (wrap in `AuthProvider`)
- `src/App.jsx` (auth gate, sync hook, migration modal, sync status)
- `src/layout/TopNav.jsx` (avatar account state, sync pill)
- `src/hooks/useLocalStorage.js` (localwrite/hydrate events — inert for guests)
- `.gitignore` (explicit `.env*` entries)
- `package.json` / `package-lock.json` (`@supabase/supabase-js`)

---

## Recommended next session

1. Do the two manual dashboard steps above.
2. Run `supabase/verify-rls.md` — confirm all six checks PASS (the critical
   security gate).
3. Exercise the real logged-in flow in the UI: sign up → migration prompt →
   add a goal → reload (persists from cloud) → sign out/in on a second "device"
   (different browser) → confirm data follows the account and never leaks across
   accounts.
4. Optional polish: code-split supabase-js to clear the bundle-size warning;
   consider a "last synced" timestamp in the UI.
