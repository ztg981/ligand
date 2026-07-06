# Ligand — Supabase Auth & Cloud Sync — Progress

_Session date: 2026-06-14 (updated 2026-07-05)_

## Phase 27 — Final product session (2026-07-05, Claude Code)

Baseline: master `fdc9fb3`, working tree clean, `npm run build` green.

### Section 1 — AI workout import: REAL root cause + fix (DONE, deployed)

**Root cause (proven, not guessed).** Direct HTTP tests against the deployed
`gemini-insights` Edge Function showed `gemini-3.5-flash` returning
**503 UNAVAILABLE ("high demand")** on 5 of 7 consecutive requests. The old
function had NO retry and NO fallback model, and the client collapsed every
failure into the generic "Import failed. Try rephrasing your notes." So the
user saw a "parsing" error for what was actually Google-side capacity. Two
secondary defects: (a) text extraction read only `parts[0].text`, which on a
thinking model can be a thought part or nothing → `ok:true` with EMPTY text;
(b) empty/oversized input hit Gemini instead of being rejected.

**Fix — Edge Function (`supabase/functions/gemini-insights/index.ts`):**
- Model chain `gemini-3.5-flash → gemini-2.5-flash → gemini-2.0-flash`, 2
  attempts per model with backoff on 503/429/5xx; 404 skips to next model.
- `responseMimeType: "application/json"` for import (low temperature).
- Text extraction joins all non-thought parts; empty text is a retryable
  error, never `ok:true`.
- Input validation: rejects empty notes, >4000-char notes, >20KB bodies with
  `errorKind: "bad_request"`; structured `errorKind` on every failure
  (model_overloaded | bad_request | empty_response | network | missing_key).
- Upstream error bodies are logged server-side but never echoed to clients.
- Import prompt hardened: notes are declared DATA, not instructions.

**Fix — client:**
- `src/lib/workoutParser.js` (new): `sanitizeImportedExercises()` — the single
  strict schema gate for ALL imported exercises (AI + local): strips
  markup/control chars, whitelists muscleGroup/type, clamps sets 1–20, reps
  1–200, weight 0–2000, minutes 1–300, rest 0–900, caps 30 exercises/80-char
  names, drops unsalvageable entries. Plus `parseWorkoutText()` — a
  deterministic "Quick parse" fallback (clearly labelled non-AI) handling
  "5x5 bench", "bench 3 sets of 8", "135x8", "5 sets, 5 reps", "@ 185",
  "rest 90s"/"rest 3 min" (attaches to the previous exercise), cardio
  minutes, descriptor→notes ("felt heavy").
- `aiApi.importWorkout()` returns `{ ok:false, kind, error }` with the REAL
  cause: signed-out / busy (503) / network / parse / no-exercises / too-long.
- `WorkoutImport.jsx`: real error text + **Retry AI** + **Quick parse
  instead** rescue actions; permanent Quick parse button; notes preserved on
  every failure; plural-aware library matching ("rows" → Bent Over Row);
  unknown names kept as custom exercises; restSec/notes carried through.
- `WorkoutPreview` now supports **Schedule** (date picker, defaults to local
  today via `todayKey()` — fixed a UTC off-by-one) alongside edit / Start /
  Save-as-template; imported previews are titled "Imported from your notes"
  and hide Regenerate.
- New data model: `createScheduledWorkout` (model.js), `scheduledWorkouts` in
  seed + useStore CRUD (add/update/delete). Syncs like everything else via
  the user_data blob; old blobs load fine (`|| []` default).

**Deployed:** `npx supabase functions deploy gemini-insights --project-ref
auypprgibgftwpwuvxqa` → "Deployed Functions." (2026-07-05). Post-deploy live
tests, all passing: classic "5x5 bench…", vague "chest day…", mixed
"Squat 135 for 3 sets of 8…", multiline with rest+notes (extracted
weight 185 / rest 180s / "felt heavy" note), misspelled names, unknown
custom exercises, empty (→ bad_request), 8800-char (→ bad_request), prompt
injection ("reply HACKED" → parsed only the exercise, instruction ignored).
Several requests visibly fell back 3.5-flash→2.5-flash mid-test, proving the
chain works. Browser-verified (dev preview, 1280px, guest): Quick parse →
review modal → Schedule (persists to `ligand.data.scheduledWorkouts`,
correct local date); signed-out AI attempt shows the real message + working
rescue buttons; notes preserved. Zero console errors; build green.

**Not tested here:** a signed-in browser session calling the function (no
test account credentials in this environment) — but the deployed function
was exercised directly over HTTP with the anon key, which is the same
request shape supabase-js sends.

## Phase 26 — Workout hub: actually split into desktop vs mobile (2026-07-05, Claude Code)

**Honest correction.** Earlier phases claimed the Workout experience was "two
different experiences (PC = planning, mobile = execution)". A side-by-side
diagnosis proved that was FALSE for the LANDING page: `WorkoutTab.jsx`'s
`view === "hub"` block was a SINGLE shared markup tree rendered on both, gating
on `isMobile` in only 3 trivial spots (hide the "Plan" tab, hide the plan view,
drop one sentence). The only real divergence was the active logger AFTER
pressing Start (guided vs list). The visible "difference" was just CSS stacking.
Breakpoint detection (`useIsMobile(768)` via matchMedia) was fine; Electron has
no separate workout logic; no `DesktopWorkoutHub`/`MobileWorkoutHome` existed.

**Diagnosis method:** added a temporary dev-only (`import.meta.env.DEV`)
diagnostic label to WorkoutTab showing viewport width, `isMobile`, the selected
landing component, and web-vs-electron; captured screenshots at 375px and 1280px
showing identical `WorkoutTab · view="hub"` markup. (Label removed after the fix.)

**Fix — real separate architecture:**
- New `src/components/MobileWorkoutHome.jsx` — execution-first: a hero card
  (today's split / "Let's train"), equipment quick-select, a BIG Start button,
  compact stats, and a compact recent + PR-chip glance. No planner, no AI
  import, no analytics grid.
- New `src/components/DesktopWorkoutHub.jsx` — planning + progress workspace: a
  full-width "ready for the gym" banner, then a two-column grid — LEFT the
  weekly split PLANNER matrix + a compact "Start a session" row + AI import;
  RIGHT a progress card (week stats), recent sessions, and recent PRs. Start is
  a small action, not the hero (the doing happens on the phone).
- `WorkoutTab.jsx` now renders `{isMobile ? <MobileWorkoutHome/> : <Desktop
  WorkoutHub/>}` for the hub, passing shared state/handlers (added `onOpenEquip`).
  The separate desktop-only "Plan" tab was folded into the desktop hub (the hub
  IS the plan surface now; the segmented control reads "Plan" on desktop,
  "Today" on mobile). Exercises + Progress tabs unchanged; logger/modals shared.
- CSS: `.dwh*` two-column workspace (collapses to one column <1080px) and
  `.mwh*` mobile hero/execution styles.

**Verified live** (dev preview): 1280px renders `DesktopWorkoutHub` (56-cell
planner + progress columns; planner toggles persist to `profile.weeklyPlan`);
375px renders `MobileWorkoutHome` (hero + big Start; Start opens the flow); the
two are different components with different markup, not CSS-stacked cards. Zero
console errors, no horizontal overflow. `npm run build` green.

**Deployment note (honest):** master now has the split. The repo has no
`vercel.json`/deploy script and I did not run a web deploy, so I cannot confirm
the live Vercel commit; if a GitHub→Vercel integration exists it auto-deploys on
push. The 1.0.1 Windows installer predates this change (built at `0390c63`); it
would need a rebuild to include the split.

## Phase 25 — Guided workout, hooks-warning investigation, Windows build (2026-07-04, Claude Code)

### Priority 1 — Mobile guided workout execution (DONE, committed)

On a phone, a seeded/planned workout now runs as a guided one-exercise-at-a-
time flow in `src/components/WorkoutLogger.jsx` (`guided = isMobile && wasSeeded`).
The scrolling list stays for desktop and free logging, so the desktop planner
and plate calculator are untouched. Pre-start briefing → per-exercise focus
(progress "Exercise 2/5" + "Set 1/4", last-time reference, +/- steppers with
carry-forward, plate calc, Log-set) → auto-rest (pause/resume, ±15, skip, ring,
vibration, "Next: set 2 of 3"/"Next: <exercise>") → completion state with
Continue/Finish → Back/Skip nav preserving data → full-plan overlay → finish
celebration. Verified live at 375px end-to-end; desktop still uses the list.
Known limit: a mid-session reload returns to the hub (session isn't persisted
until finished — same as the existing logger).

### Priority 2 — React hooks-order warning (INVESTIGATED; does not reproduce)

Goal was to reproduce the "hooks order changed" warning with a clean console,
capture it, and fix the root cause. **It does not reproduce in the current
build**, and the code is structurally free of the anti-patterns that cause it.
Evidence gathered:

- **StrictMode is ON** (`src/main.jsx`), so a genuine hook-order violation
  surfaces reliably on mount (double-invoke). A **fresh reload logs zero React
  warnings.**
- **App is structurally correct.** Every one of App's hooks is a top-level
  `const x = useY(...)` / `useEffect(...)` call (lines 53–766); the LAST hook is
  at line 766 and App's only early return (`if (authLoading || syncHydrating)`)
  is at line 1012 — so *all* hooks always run before any return, signed-in or
  out. No hook sits in a conditional, loop, callback, or short-circuit; no hooks
  live in the render/IIFE; no component is invoked as a function (grep-verified).
- **Every custom hook App calls is clean** (no call-level conditional hooks):
  useStore, useSupabaseSync, useNotifications, useBadges, useSettings, useTweaks,
  usePomodoro, useElectron, useIsMobile, useAuth, useLocalStorage, useAlarms.
  The `return`s inside them are all inside effect/callback bodies (fine).
- **The historical root cause is already fixed:** Phase 11 P0 moved
  RecoveryGoalTab's effects above its `if (!goal) return null` (confirmed still
  correct at line 428). That was the documented conditional-hook bug.
- **Repro attempts, all clean:** fresh reload; switching all 8 top tabs ×2;
  opening/switching goal tabs of different types; opening every dropdown; back
  to Home. Zero console errors/warnings each time.

Honest conclusion: the warning seen in earlier sessions was resolved by prior
fixes (chiefly the Phase 11 RecoveryGoalTab fix) and/or was a StrictMode +
rapid-programmatic-click test artifact; it is not present now. No code change
was fabricated to "fix" a non-existent defect. Real signed-in testing with a
live Supabase session was not performed here (guest path only), but the signed-
in render path is structurally safe because every hook precedes the
`syncHydrating` early return.

### Priority 3 — Windows installer built AND published (DONE)

Config inspected: version was **1.0.0**, bumped to **1.0.1**; `electron-updater
@^6.8.9` + `electron-builder@^26.15.3`; publish provider **github
ztg981/ligand**; build command `npm run electron:build`
(= `vite build && electron-builder`); output dir `dist-electron` (overridden to
`%TEMP%` here to dodge Documents' Controlled Folder Access EPERM, see Phase 12).
Publishing credential: `gh auth token` (scopes include `repo` + `workflow`),
passed to electron-builder as `GH_TOKEN`.

- **Installer built:** `Ligand Setup 1.0.1.exe` — **127,434,356 bytes (~122 MB)**,
  NSIS oneClick perMachine:false. Local path (this build):
  `%TEMP%\ligand-build-out2\Ligand Setup 1.0.1.exe` (the normal command puts it
  in `dist-electron\`). Update metadata `latest.yml` + `.blockmap` generated
  alongside.
- **Release published:** https://github.com/ztg981/ligand/releases/tag/v1.0.1 —
  **not a draft**, tag `v1.0.1` on the version-bump commit. Assets (verified via
  `gh release view`): `Ligand-Setup-1.0.1.exe` (127,434,356), `latest.yml`
  (references that exact exe, size **127,434,356** — matched), and
  `.exe.blockmap`. The feed and installer are a consistent pair.
- **Gotchas hit + fixed:** electron-builder rejects a *published* (non-draft)
  release unless the git tag already exists (GitHub 422 "Published releases must
  have a valid tag") — created/pushed `v1.0.1` first. Its ">2h old release"
  safety heuristic then skipped re-uploading, and an interrupted first upload
  left a size/hash-mismatched `latest.yml`; fixed by uploading the matched
  exe+latest.yml+blockmap trio from a single build via `gh release upload
  --clobber` (verified size match).
- **Auto-update — honest status:** the release + a valid, matched `latest.yml`
  feed are published, which is what `electron-updater` reads
  (`checkForUpdatesAndNotify()` on packaged-app startup). **However, an actually-
  installed older app detecting/downloading/applying the update was NOT verified
  here** — auto-update only runs in the packaged app (never `electron:dev`), and
  no installed 1.0.0 build is running in this environment. So: feed is correct
  and complete; the end-to-end installed-app update handshake is unverified.
- **Manual install (works today):** download `Ligand-Setup-1.0.1.exe` from the
  release page above and run it. To rebuild locally: `npm run electron:build`
  (add `-- --publish=always` with `GH_TOKEN` set to also publish); if Controlled
  Folder Access blocks it, add
  `--config.directories.output="%TEMP%\ligand-out"`. Installer lands in
  `dist-electron\` (or that output dir).
- **Data preservation on update:** YES. Guest data lives in the app's
  localStorage under `%APPDATA%\Ligand` (userData), which a per-user NSIS
  in-place update preserves; signed-in data is in Supabase (untouched by an app
  update). This session's data-model additions (`weeklyPlan`, `alarms`,
  `uiSounds.volume`, `pickOneHiddenDate`, guided-workout state) are all optional
  with safe defaults (`|| []` / `?? default`), so an existing 1.0.0 user's blob
  loads without migration or loss.

### Final requirement audit — Phase 25 reconfirmations

| Requirement | State | File/component | Test | Limitation |
|---|---|---|---|---|
| Overview → Habits everywhere | Working | tabs/Habits.jsx, layout/TopNav (TOOLS), bottom nav | Tab title "Habits" + nav label at 1280/375 | — |
| Goals grid on Home | Working | tabs/Home.jsx (`goalsSection`/GoalsGrid) | Rendered on Home desktop+mobile | — |
| Mobile Home streak visible | Working | tabs/Home.jsx `.home-streak-mobile` | "3 days showing up" live at 375px; zero-state present | — |
| Mobile vs desktop theme | Working | App.jsx `mobileTheme` (ligand.mobileTheme) vs tweaks.theme | Separate stores; mobile default auto | Verified prior session |
| One mobile FAB | Working | App.jsx (quick-note; suppressed on Notes) | 1 FAB per tab at 375px, no overlap | — |
| Every requested UI sound | Working | lib/uiSounds.js | habitDone/taskDone/pomodoroComplete/phaseChange/tick/click/pop/error/startAlarm all fire | — |
| Sounds respect toggle+volume | Working | uiSounds.configure({enabled,volume}) + master gain | Volume slider (mobile+desktop); alarm intentionally bypasses UI toggle | — |
| Alarm easy to locate | Working | Settings + MobileSettings → Alarms card | Present both; "Add alarm" | — |
| Website blocker locatable (Electron) | Working | Settings → Focus block (BlockerPanel) | Renders on Electron/Windows; inert on web | UAC not tested here |
| AI workout import locatable | Working | Workout → Plan → Import from notes | Desktop Plan view; Edge Fn deployed | — |
| Logo hitbox = logo only | Working | layout/TopNav `.brand` button | Click → Home; hitbox is mark+wordmark | — |
| No awkward user-facing dashes | Working | app-wide | Zero em dashes in rendered strings (grep) | — |
| Mobile guided workout | Working | components/WorkoutLogger.jsx (guided) | Full run at 375px | Reload mid-session returns to hub |
| Hooks-order warning | Not present | App.jsx + custom hooks | StrictMode + exhaustive sweeps clean | Live signed-in session not exercised |
| Windows installer + release | Done | package.json build, GH release v1.0.1 | Installer 122MB; release assets verified | Installed-app auto-update handshake unverified |

## Phase 24 — Recovery & completion audit (2026-07-04, Claude Code)

Baseline: `git status` clean, `npm run build` green (155 modules). Requirement
audit before any changes (per the recovery brief):

**S1 Dropdowns — PARTIALLY WORKING / REGRESSED.** Root cause found: the avatar,
notification and goal dropdowns dismiss via a full-screen backdrop div at
z-index 90/94, which sits ABOVE the triggers (topbar z-index 20). The Phase-23
fix added `onPointerDown` to those backdrops, which introduced a flash-reopen
race: tapping an open trigger hits the backdrop → pointerdown closes it → the
following click falls through to the now-exposed trigger → reopens. Needs a
shared, ref-aware primitive (no backdrop dismissal). PRIORITY.

**S2 "Pick one thing" — PARTIALLY WORKING.** Present on Home but not the
occasional/hide-only dismiss-for-the-day behavior. Needs rework.

**S3 Micro-animations — PRESENT BUT NOT VERIFIED.** Phase-15 classes exist;
need an audit that each actually fires and is visible.

**S4 Home/Habits — WORKING (verify).** Overview→Habits rename, goals→Home, and
mobile streak ("Days showing up" / visit streak) are present on mobile Home
(Home.jsx `home-mobile-only`). Zero-state "Start your streak today" missing.

**S5 Mobile UI/Settings — WORKING (Phase 23).** Seg control, Theme rename,
mobile Theme section, single FAB, mobile settings, separate mobile theme all in.

**S6 Sounds — WORKING (Phase 23) except no anti-stacking.** Rapid repeats can
stack; needs a per-sound throttle/limiter.

**S7 Workout — 7A/7B/7D/7E/7F WORKING (Phase 23); 7C MISSING.** The mobile
logger shows ALL exercises in a scrolling list, not a guided one-exercise-at-a-
time flow with next-exercise preview.

**S8 Website blocker — WORKING core (Phase 23); gaps.** Auto-block wired to
Hyperfocus, not Pomodoro focus/break as specified. User-facing name is "Focus
block" (acceptable, not "app blocker"). Needs Pomodoro integration.

**S9 Photo alarm — WORKING (Phase 23).** Model, management UI, firing overlay,
brightness-invariant match, escape hatch, honest note all present.

**S10 Themes/logo/em-dash — WORKING (Phase 23).** 13 themes, logo→Home, zero
user-facing em dashes.

**S11 Windows update — NOT AUDITED YET.** electron-updater wired (Phase 22 S4);
needs the honest status write-up (no release published in this env).

**S12 Discoverability/regression — PENDING final audit.**

Plan: fix genuine gaps (S1 primitive, S2 rework, S3 verify, S6 throttle, S7C
guided flow, S8 Pomodoro, S11 docs, S12 audit); verify the already-working
sections rather than rebuild them.

### Work completed this session

- **S1 (done, committed):** new `useDropdown` shared primitive; removed backdrop
  dismissal; avatar/notification/goal dropdowns refactored. Root cause + all six
  test sequences documented in the commit. Fixes the flash-reopen race.
- **S2 (done):** "Pick one thing" is now Hide-only, dismiss-for-the-day
  (`ligand.pickOneHiddenDate`), never completes the task, collapse animation,
  renders nothing (no reserved space) when absent.
- **S3 (done):** audited all Phase-15 animations. Fixed the two weak ones — the
  row-completion bounce (1.018 → 1.035) and the tab transition (opacity-only →
  `pageEnter` slide-up+fade, 150ms). 3D/3E/3F confirmed present/correct;
  reduce-motion confirmed off by default.
- **S4C (done):** added the compact "days showing up" streak to mobile Home
  (same `activeDays` source as desktop) with a "Start your streak today" zero-
  state.
- **S6 (done):** master `DynamicsCompressor` limiter + 40ms click throttle so
  rapid interactions can't stack into painful loudness.
- **S8 (done):** website-blocker auto-mode now follows Pomodoro focus/break
  (Pomodoro reports focus state via `onFocusStateChange`), not just Hyperfocus.
- **S5 / S9 / S10 / S7A / S7B / S7D / S7E / S7F:** verified present from Phase 23
  (seg control, Theme rename + mobile Theme section, single mobile FAB, mobile
  settings, photo alarm, 13 Pomodoro themes, logo→Home, em-dash-free copy,
  desktop planner, AI import + deployed Edge Function, rest timer, plate calc).

### S11 — Windows update status (honest audit)

1. **Auto-updating implemented?** Yes, in code. `electron/main.js` runs
   `autoUpdater.checkForUpdatesAndNotify()` on startup **only when packaged**;
   `UpdateBanner.jsx` prompts a restart once an update downloads.
2. **electron-updater configured?** Yes — `electron-updater@^6.8.9` dependency;
   `package.json build.publish` → GitHub provider (`ztg981/ligand`) as the feed.
3. **Does pushing to master update an installed Windows app?** **No.** There is
   **no CI** (`.github/workflows` does not exist). Pushing source changes nothing
   on any installed app. An installer must be built AND a GitHub Release
   published before an installed app's auto-updater can see it.
4. **Was a packaged Windows build created this session?** **No.** `dist-electron/`
   holds only a stale `win-unpacked.tmp` (a leftover temp, gitignored); no `.exe`
   exists. Building was not run here (a Windows build can't be meaningfully
   verified in this headless sandbox, and Controlled Folder Access on Documents
   blocks electron-builder's rename step — see Phase 12).
5. **Was a release published?** **No.** `gh release list --repo ztg981/ligand`
   returns empty — zero releases. So there is nothing for an installed app to
   fetch.
6. **How does the user update today?** Build the installer locally and run it
   (there is no published release to download).
7. **Exact installer command:** `npm run electron:build` (= `vite build &&
   electron-builder`). To also publish to GitHub Releases (which is what actually
   enables auto-update): `npm run electron:build -- --publish=always`. Build to a
   path outside `Documents` if Controlled Folder Access blocks it, e.g.
   `--config.directories.output="%TEMP%\ligand-electron-out"`.
8. **Where is the installer placed?** `dist-electron/` (per
   `build.directories.output`), e.g. `Ligand Setup 1.0.0.exe`.

No updater code changes were made — the pipeline is correctly wired but simply
has no published release. A GitHub Actions build-and-publish workflow would
close the loop, but it needs Windows CI + signing that can't be verified from
here, so it was intentionally not added blind.

### S12 — Discoverability + regression audit

**Exact feature locations:**
- **Photo alarms:** Settings → "Alarms" card (both desktop Settings and mobile
  Settings) → "Add alarm".
- **Windows website blocker:** desktop Settings → "Focus block" card (Electron/
  Windows only; renders nothing on web/PWA/other platforms).
- **AI workout import:** Workout tab → "Plan" segment (desktop only) → "Import
  from notes".
- **Weekly workout planner:** Workout tab → "Plan" segment (desktop only) →
  muscle-group × day matrix.
- **Mobile Theme settings:** mobile Settings → "Theme" section (mode / accent /
  corner radius / density).
- **Sound controls:** desktop Settings → Notifications ("UI sounds" + "Sound
  volume"); mobile Settings → "Sound" section (UI sounds + volume).

**Regression checks (Chromium desktop + mobile emulation):**
- Mobile FABs: exactly ONE floating button per tab — quick-note on Home/Tasks/
  Workout/Habits, the New-note FAB on Notes (quick-note suppressed there), no
  Theme FAB on mobile. No overlap.
- No horizontal overflow at 375px. No unhandled promise rejections. No new
  console errors from this session's work.
- Electron-only APIs (`window.electron.blocker`, alarm camera) are all feature-
  detected; inert on web.
- **KNOWN PRE-EXISTING (not introduced this session):** App logs a React
  "hooks order changed" warning on tab switches (documented since Phase 9;
  hook #79 flips useMemo↔useCallback). All of App's hooks are top-level; the
  mismatch comes from a child custom hook's internal count and was deferred by a
  prior session as its own investigation. No functional breakage observed.

### Remaining (not done this session)

- **S7C — mobile guided workout execution:** the mobile logger still shows all
  exercises in one scrolling list. A guided one-exercise-at-a-time flow (session
  summary → per-exercise focus with set progress + last-session reference →
  auto-rest with next-exercise preview → finish celebration) is NOT built. The
  rest timer (7D), plate calc, last-time reference, session overview and finish
  celebration already exist and would feed straight into it. Left for a focused
  follow-up to avoid a half-built execution mode. Deferred cleanly with the
  working list logger intact.
- The pre-existing App hooks-order warning (above).

## Phase 23 — Sound overhaul, em-dash cleanup, mobile fixes, workout depth, app blocker, photo alarm (2026-07-04, Claude Code)

Large six-section brief plus additional tasks. Clean baseline first; committed
after each section; verified live at 375px and 1280px, light + dark; `npm run
build` green throughout; production `vite preview` (port 4173) cycled all tabs
with **zero console errors** and a live service worker.

### Section 1 — Sound effects overhaul (DONE)

Rebuilt `src/lib/uiSounds.js` around one idea taken from the study-tracker
sounds the user likes: a bare sine sounds cheap, so every voice adds a quiet
**inharmonic bell partial at 2.76×** the fundamental (the "warm/real" chime
ingredient), uses real musical intervals (rising = positive, descending =
completion), and routes through a single master gain (volume) plus a gentle
master low-pass that rounds off digital fizz.

- New master toggle **and** volume: `configure({ enabled, volume })`, backed by
  a new `uiSounds.volume` setting (default 75%) wired to the Sound volume slider
  on both mobile and desktop (the mobile slider previously mis-pointed at
  `wallpaper.volume`).
- Distinct completion sounds: `habitDone` (light rising major third — habits
  fire often, so it's the quickest), `taskDone` (fuller rising fifth with sub-
  body), `ding` kept for badges/recovery/workout.
- Pomodoro: `pomodoroComplete` (descending bing-bong reward on a finished work
  block) vs `phaseChange` (rising lift when a break ends). Replaces the old flat
  two-sine chime; follows the Pomodoro-chime setting, not the UI toggle.
- Refined `click` (warmer, shorter), `tick` (organic ±detune so a fast drag
  isn't robotic), `pop` (weightier). New `error()` (gentle descending, never a
  buzzer) and `startAlarm()` (insistent looping triad that deliberately bypasses
  the UI toggle — an alarm you set should always be audible; used by Section 6).
- Reasoning for each choice documented inline in the file's header comment.

### Section 2 — Em-dash cleanup (DONE)

Previous passes swapped em dashes (—) for hyphens, which read awkwardly mid-
sentence. Reworded **every** affected user-facing string into clean natural
English (a period, comma, or restructured clause), not a dash of any kind:
notification bodies, badge messages, science facts, AI fallback/encouragement/
reentry copy (`ai.js`), recovery milestones, and empty-state/hint/placeholder/
alert strings across every tab, widget and component (including multiline JSX
text earlier greps missed). Zero em dashes remain in any rendered string; only
code comments retain them.

### Section 3 — Mobile UI fixes (DONE)

- **3A dropdown dismiss on iOS Safari**: Safari drops click on non-interactive
  elements, so the click-away backdrops behind the avatar menu, notification
  popover, goal dropdown and quick-note sheet never dismissed on a tap outside.
  Fixed by dismissing on `onPointerDown` (fires on iOS touch) in addition to
  `onClick`, plus `cursor:pointer` to nudge Safari's clickability heuristic; the
  quick-note scrim guards `e.target === e.currentTarget` so inner taps don't
  close it.
- **3B Tasks segmented control**: the Active/Done/All indicator was 36px pinned
  to the top of a 46px stretched container (2px gap top, 8px bottom). Let the
  seg buttons fill the full height so the active segment is a proper iOS-style
  full-height inset pill (symmetric 2px inset, matching radius, clean shadow).
- **3C Tweaks → Theme**: renamed the floating control to "Theme" (FAB tooltip +
  panel header). Code identifiers left as-is.
- **3D mobile layout reorg**: removed the floating Theme FAB on mobile, moved its
  controls (mode, accent, corner radius, density) into a "Theme" section in
  mobile Settings, and dropped the quick-note FAB into the old Theme-FAB spot so
  the phone has exactly one floating button (also suppressed on the Notes tab,
  which has its own New-note FAB). Desktop keeps the Theme FAB/panel.

### Section 4 — Workout system (DONE)

Philosophy implemented: **PC = planning, mobile = execution.**

- **4A desktop planning**: a weekly training-split **matrix** (muscle groups ×
  days, Plan view, desktop only) stored on `profile.weeklyPlan`; a "Ready for
  the gym" indicator on Today that surfaces the day's planned split (the bridge
  from plan to phone); and **AI workout import** — a new `import_workout` Edge
  Function action parses messy notes ("chest day - bench heavy, some flyes,
  dips") into a structured, editable plan (`WorkoutImport.jsx` +
  `importWorkout()` with library name-matching for PR tracking). **Edge Function
  redeployed** to project `auypprgibgftwpwuvxqa`.
- **4B mobile execution** (in `WorkoutLogger`): a session-overview briefing at
  the start of a planned session (count / time estimate / muscle focus); a
  **"Last time: 135 lbs × 8"** reference per exercise with prior values as input
  placeholders (`model.lastExercisePerformance`); a finish celebration (badge
  pop, focus-aware cheer, chime + vibration). Rest-timer pause/resume already
  existed from Phase 22 3F.
- **4C premium ideas**: a **plate calculator** (`model.platesFor`) showing what
  to load per side for barbell lifts (auto bar by unit, greedy largest-first),
  and an **"up from last time"** green cue when a completed set tops the prior
  best — both the features gym-goers love in Strong/Fitbod.

### Section 5 — App blocker (Windows/Electron) (DONE)

A Cold Turkey/Freedom-style focus blocker. `electron/appBlocker.js` rewrites the
Windows hosts file, redirecting blocked domains to 127.0.0.1 between
`# LIGAND-BLOCK-START/END` markers so cleanup is surgical (apply→clear restores
the file byte-for-byte, verified). Reads unprivileged; elevates via **one**
PowerShell `Start-Process -Verb RunAs` UAC prompt only when a direct write is
denied (no prompt if already elevated). Presets Social/Video/Gaming/News + custom
domains. Graceful edge cases: declined UAC → clean "cancelled" message; non-
Windows/web → inert; crash/force-quit → `before-quit` clears when a block is
present, and a leftover block is surfaced on next launch. `BlockerPanel.jsx` in
desktop Settings (self-gates to nothing on web) with a motivating "You're in
focus mode" state and an "auto-block whenever Hyperfocus is on" toggle wired in
`App.jsx`. IPC `blocker:status/apply/clear` + preload bridge.

### Section 6 — Alarm with photo scan (DONE) + additional tasks

- **Photo-scan alarm**: dismiss requires photographing a specific object (sink,
  kettle, door), forcing you up. `createAlarm` model + store actions; `useAlarms`
  polls the clock and raises the due alarm once/day; `AlarmOverlay` is a full-
  screen takeover with a persistent tone (`startAlarm`, bypasses the UI toggle) +
  vibration, rear-camera scan, a **live match-% meter**, a dark-room hint, and a
  press-and-hold escape hatch after several honest tries so no one is ever
  trapped. `imageMatch.js` uses **brightness-invariant** similarity (downscaled
  grayscale + normalised cross-correlation) so a dim 6am room still matches;
  ~70% default threshold. `AlarmsPanel` management UI (desktop + mobile Settings)
  with inline camera capture of the target. UI is **honest**: it states alarms
  only ring while Ligand is open (a browser can't wake a sleeping device).
  Verified fire→dismiss live.
- **Pomodoro themes**: five new **pure-CSS** ambient scenes (no photo assets) —
  Sunset, Cosmos, Ocean, Rain, Zen — bringing the picker to 13. All covered by
  the global reduce-motion guard. Verified Cosmos renders its starfield live.
- **Logo → Home**: the Ligand mark + wordmark (tight hitbox, not the whole bar)
  is now a Home button on desktop and mobile.

### Final verification — PASSED

`npm run build` clean. Production `vite preview` (4173): all 8 tabs cycled at
1280 and 375, light + dark, **zero console errors**, service worker active, no
horizontal overflow (scrollWidth 375 at mobile). Logo→Home confirmed; mobile has
a single floating button. Electron main/preload/appBlocker `node --check` clean;
the hosts-file apply/clear roundtrip and plate-math were unit-verified. Note:
the alarm camera + hosts-file UAC elevation can't be exercised end-to-end in this
headless environment (no real camera / UAC), but the logic is verified and the
non-camera alarm path fired and dismissed live.

## Phase 22 — Home/Habits restructure, mobile settings, workout rebuild (2026-07-03, Claude Code)

Large multi-section brief. Clean baseline first (`git status` clean, `npm run
build` green). Committing after each sub-section; verified live via the preview
tool at 375px and 1280px.

### Section 1 — Home + Overview restructure (DONE)

**1A — Overview renamed to Habits**: the Overview tab is now "Habits"
everywhere (tab label, page title, tab id, bottom nav). New `Icon.CheckCircle`
(checkmark-in-circle) is its icon. `Overview.jsx` became `Habits.jsx`, keeping
the Today's Focus card + habit checklist + goals-to-review, minus the goals
grid (which moved to Home).

**1B — Home rebuilt**: new shared `widgets/GoalsGrid.jsx` (extracted from the
old Overview grid). Desktop Home is two-column — main column: Needs attention,
Goals to review, Your goals grid, Pick one thing, Progress, Upcoming; right
column: Days showing up, weekly review, encouragement, Did you know. Mobile
Home is a single-column stack that keeps the calm Today's-focus card (with the
"X of Y habits done today ->" line to Habits) then goals grid at 2-per-row
(densified so it never overflows 375px). Removed the "Capture a thought" button
(the quick-note FAB covers it).

**1C — Bottom tab bar** reordered to Home / Habits / Tasks / Notes / Journal.

### Section 2 — Mobile-specific settings (DONE)

Mobile theme is stored separately under `ligand.mobileTheme` (default `auto`),
fully independent of the desktop `tweaks.theme` — `themeChoice`/`setThemeChoice`
in `App.jsx` pick the store by viewport, so flipping theme on a phone never
changes the PC and vice-versa (verified live: mobile set to dark, desktop
stayed light). New `tabs/MobileSettings.jsx` renders on `<768px` instead of the
full Settings: Appearance (theme + accent), Notifications (on/off + habit
reminders), Habits (streaks), Sound (UI sounds + volume), Account (sign in/out
+ export), About (version). Desktop-only settings (Pomodoro, wallpaper, AI,
density, radius, ambient) stay on the full desktop Settings page.

### Section 3 — Dedicated Workout tab (DONE)

Workout is now a first-class main-nav tab instead of being buried inside a
fitness goal. It works off the app-level `store.fitnessProfile` / `workouts` /
`workoutTemplates` (data model unchanged), so no goal is required.

- **3A — Nav**: `workout` added to the desktop top tabs (between Notes and
  Settings) and the mobile bottom bar (Home / Habits / Tasks / Workout / Notes).
  Journal moved to the avatar overflow menu on mobile. New `tabs/WorkoutTab.jsx`
  hub reuses the proven `WorkoutLogger` (in-gym), `WorkoutPreview` (generated
  plan review with per-exercise Swap), and `FitnessProgress`. First-run
  `components/WorkoutSetup.jsx` collects experience / goal / equipment / days /
  unit when there's no profile yet.
- **3B — Equipment**: removed "Bodyweight only". `EQUIPMENT_OPTIONS` is now an
  additive multi-select: Pull-up bar, Dumbbells, Barbell, Cable machines,
  Resistance bands, Kettlebells, Cardio machines. Bodyweight is always available
  (`availableTags` floor), never a checkbox. Pull-up/chin-up retagged to require
  a `pullup` tag. New `components/EquipmentSheet.jsx` asks "what do you have
  today?" at session start with quick presets (Full gym / Home / Hotel gym /
  Bodyweight); it's also the hub quick-selector and writes the profile default.
- **3C — Exercise browser**: new `components/ExerciseBrowser.jsx` visual card
  grid (name, muscle-group chip, equipment chips, a simple SVG
  `components/MuscleDiagram.jsx` silhouette highlighting the targeted muscles);
  filter bar (All/Chest/Back/Shoulders/Arms/Legs/Core/Cardio), search, and a
  "My equipment" filter. Tapping a card starts a session with it.
- **3D — Hub**: Today's workout + equipment quick-selector + big Start button,
  a stats strip (week count / week streak / volume), recent 3 sessions, and top
  3 recent PRs (🏆).
- **3E / 3G / 3H / 3I** reuse the existing in-gym logger (44px targets, 16px
  inputs, no 375px overflow), intelligent generation, finish summary, and
  progress view — all still working through the new hub.
- **3F — Rest timer**: enhanced `WorkoutLogger`'s rest timer with a
  Pomodoro-style ring countdown (seconds centered), a Pause/Resume button (holds
  the countdown, dims the ring), and a "Next up: <exercise>" line, keeping the
  existing -15/+15, skip, and end-of-rest vibrate.

Verified live at 375px and 1280px, light + dark: setup → hub → equipment sheet
→ generate → preview → in-gym logger → ring rest timer (pause freezes, resume
ticks); exercise browser 1-col at 375px / 4-col at 1280px; zero console errors,
no horizontal overflow.

_Reuse note:_ the old fitness **goal type** (`FitnessGoalTab`) is left in place
and untouched for existing users; both surfaces read the same app-level data.
Session rating (Easy/Good/Hard) and difficulty-driven regeneration from 3G were
not added on top of the existing generator this pass — a reasonable follow-up.

### Section 4 — Electron auto-update (DONE)

`electron-updater` added; `package.json` `build.publish` targets the
`ztg981/ligand` GitHub repo as the free update server. `electron/main.js` runs a
silent `checkForUpdatesAndNotify()` on startup **only when packaged** (skipped
in `electron:dev`), forwards `update-available` / `update-downloaded` / `error`
to the renderer, and handles a `quit-and-install` IPC. `electron/preload.js`
exposes `onUpdateAvailable` / `onUpdateDownloaded` (each returns an unsubscribe
fn) and `quitAndInstall`. New `components/UpdateBanner.jsx` shows a subtle,
dismissable bottom banner once an update has downloaded and restarts on click —
inert on web/PWA and in dev (verified: `window.electron` undefined → renders
nothing, zero errors). Electron main/preload syntax-checked with `node --check`.

**To publish a release:** `npm run electron:build -- --publish=always` (builds
AND uploads the installer + update metadata to GitHub Releases). The app then
picks it up on next launch. Note: auto-update only runs in the packaged app; it
could not be end-to-end exercised in this headless environment (needs a signed
release), but the web-loaded UI and IPC wiring are verified/validated.

## Phase 21 - Mobile nav radius locked (2026-07-03, Codex)

On-device Safari follow-up: when the global corner-radius tweak makes the
floating mobile nav too round, scrolled text can peek through at the top
corners even with the separate status-band cover. Locked only the phone
`.topbar` radius to `14px`; the rest of the app still follows the user's
corner-radius setting through the `--r-*` tokens.

Follow-up: moved only the desktop/PC Focus pill slightly down (`bottom: 62px`
at `min-width: 769px`) so it sits closer to the Tweaks button while preserving
the phone Quick Note/Focus placement.

Follow-up 2: made task/habit completion feedback visible. Tasks now stay in the
current Active/Done filter for a short burst window before disappearing, and
habits use the same local burst state so a completed habit row renders checked,
flashes green, then fades/slides out instead of being removed instantly.
Follow-up 3: slowed that completion burst slightly and preserved the original
habit order while a completed habit animates out, fixing the mid-list habit jump
to the bottom.
Follow-up 4: tuned the visible completion burst from 0.76s to 0.67s after
on-device testing felt a little too slow.
Follow-up 5: shortened the same completion burst again to 0.6s after another
on-device timing pass.
Follow-up 6: restored the completion burst timing to 0.56s while keeping the
habit row order fix.

## Phase 19 — Pill nav + blank status-bar band (2026-07-03, Claude Code)

On-device feedback: the floating pill DOES frost now (the Phase 17
mix-blend-mode removal was the blur fix), and the user prefers the pill over
Phase 18's full-bleed bar — the only remaining problem was scrolled text
peeking through the gap between the screen top and the pill (behind the iOS
clock). Adopted the approach Instagram uses on Safari: leave the pill as-is
and paint that band solid page-background so the top of the screen is simply
blank.

Reverted the mobile `.topbar` to the floating pill (top: safe-area, 8px side
insets, full rounding) and added a `.topbar::before` band. Gotcha worth
remembering: the pill's `transform: translateZ(0)` makes it the containing
block for its own positioned descendants, so the band is laid out in PILL
coordinates — `top: calc(-6px - env(safe-area-inset-top))` reaches the true
screen top, `left/right: -8px` spans the side gutters, and the height tucks
~12px under the pill so its rounded corners can't leak slivers of text.
`background: var(--bg)` (solid token) follows light/dark automatically;
`z-index: -1` keeps it behind the pill surface, above page content. The
`::after` fade insets were restored to -8px. Verified at 375px light+dark
(band solid #faf6f0 / #15161a, pill blur + rgba intact, dropdown/tabs work)
and 1280px (desktop sticky pill, no band, ambient intact); zero console
errors.

## Phase 18 — Mobile nav goes full-bleed (2026-07-03, Claude Code)

Still "transparent" on the iPhone after Phase 17 — and the on-device screenshots
finally showed why: the nav was a floating pill inset 8px from the sides and
starting BELOW the safe-area, so on a real iPhone the status-bar band and the
side gutters were simply uncovered. Scrolling content passed raw behind the
clock and around the pill — the whole top of the screen read as transparent no
matter what the pill itself did. Desktop Chromium never shows this because it
has no status bar band (env(safe-area-inset-top) = 0).

Fix: the mobile nav is now full-bleed, like native iOS apps — `top:0; left:0;
right:0`, top padding `calc(env(safe-area-inset-top) + 8px)` so the frosted
surface covers the notch/status-bar region, bottom-only corner rounding and
hairline. Same rgba + blur(20px) + translateZ(0) treatment as Phase 17. The
`::after` fade now spans the true full width. Desktop keeps the floating sticky
pill (verified: sticky, left 28px, full rounding, ambient blobs + fixed body
attachment intact).

Also added `public/blurtest.html` — a standalone diagnostic (no app CSS, no SW
logic) with five fixed bars over loud stripes: A both prefixes, B -webkit-only,
C standard-only, D both+translateZ, E the app's exact nav colors. Visiting
/blurtest.html on the phone tells us definitively which backdrop-filter forms
iOS renders in this deployment, ending the guess-and-deploy loop if anything
still looks off.

## Phase 17 — Safari nav blur: the ACTUAL root cause (mix-blend-mode) (2026-07-03, Claude Code)

Phases 15–16 (oklab→srgb, rgba, prefix preservation) were red herrings for
iOS 26.5 (Safari 26), which supports color-mix and unprefixed backdrop-filter —
so those changes couldn't move the needle on-device ("looks the same"). The
deployed CSS was confirmed correct; the blur still didn't render because of two
compositing antagonists sitting in the nav's backdrop that WebKit honors and
Chromium ignores (hence "works in Chromium, broken in Safari"):

1. **`mix-blend-mode` on the `.ambient` blobs** — a single blended element
   anywhere in the backdrop disables `backdrop-filter` in Safari. This is the
   primary cause and it predates every prior "fix." Hidden `.ambient` on phones
   (`@media max-width:640px { .ambient { display:none } }`).
2. **`background-attachment: fixed` on `<body>`** — breaks fixed-element
   backdrop-filter on iOS (never truly supported there). Set to `scroll` on
   phones.

Also promoted the nav to its own GPU layer (`transform: translateZ(0)` +
`-webkit-` on the mobile `.topbar`), the standard iOS enabler for
backdrop-filter on a `position:fixed` element. Verified in Chromium (blur + rgba
intact, no regression); the on-device confirmation is a Safari **Private tab**
(bypasses the persistent PWA service worker cache).

## Phase 16 — Safari nav blur: the real root cause (2026-07-03, Claude Code)

The mobile nav was still transparent (no frost) on iOS Safari despite Phase 15.
Two distinct root causes, both fixed:

1. **`color-mix()` background** — iOS Safari drops a `color-mix()` background
   (especially with a `var()` inside) on an element that also has a
   `backdrop-filter`, so the nav surface never painted → fully transparent.
   Replaced with hardcoded rgba matching the `--bg` tokens: light
   `rgba(250,246,240,0.85)`, dark `[data-theme="dark"] .topbar` →
   `rgba(21,22,26,0.85)` (the `::after` fade too). Theme is driven by the app's
   `data-theme` attribute — which already resolves "auto" to the system scheme —
   so no `prefers-color-scheme` rule (that would wrongly override a manual pick).

2. **autoprefixer was stripping `-webkit-backdrop-filter`** — the two toolchain
   layers each dropped a *different* prefix: esbuild's CSS minifier drops the
   standard `backdrop-filter` (Phase 15, why `cssMinify:false`), and autoprefixer
   (running unminified) removed the hand-written `-webkit-backdrop-filter` as
   "outdated", leaving only the standard property — unsupported on iOS/Safari
   < 18, so no blur. Set `autoprefixer: { remove: false }` so author prefixes are
   preserved. The built CSS now carries BOTH forms (12 `-webkit-` + 14 standard).

Also added an `@supports not ((-webkit-backdrop-filter: blur(1px)) or
(backdrop-filter: blur(1px)))` fallback that makes the nav ~97% opaque only on
engines with no backdrop-filter at all (never on iOS < 18, which can blur via
`-webkit-`). Confirmed the ancestor chain (html→body→.app→.shell→.topbar) has no
`overflow:hidden`/`transform`/`will-change`/`filter`, and the nav is
`position:fixed`. Verified in Chromium (rgba bg + blur, light+dark, no regression)
and by grepping the built CSS for both prefixes; deployed to Vercel for the
on-device iPhone Safari check.

## Phase 15 — Mobile polish batch + production blur fix (2026-07-03, Claude Code)

Seven mobile sections, each committed separately, then a build fix. Verified on
the production build (`vite preview`) at 375px and 1280px, light and dark, with
zero console errors; desktop confirmed unaffected throughout.

**S1 — Nav blur actually renders** (`116a1e6`): the mobile nav's frosted
background used `color-mix(in oklab, …)`, unsupported on some engines, so the
whole `background` was dropped and content showed through plainly. Switched the
nav surface + bottom fade to `color-mix(in srgb, var(--bg) …)` with `blur(20px)`.

**S2 — Green completion animation** (`02013c4`): checked task/habit checkboxes
turn green (`#22c55e`); the habit hold-fill fills green; on user toggle a
`.check-burst` springs the checkmark (scale 0→1.3→1), flashes a green wash and
bounces the row (`.uncheck-burst` = quiet bounce). Wired into the Tasks tab.
All disabled under `prefers-reduced-motion` / `data-reduce-motion`.

**S3 — No empty right column** (`0cb333d`): removed the 60px right padding that
cramped task/habit row text (old Focus-FAB clearance, no longer needed); the
`1fr` name column reclaims it and `.ov-habit-text` is `flex:1` (edit → 44px).

**S4 — Home habit summary on mobile** (`1aecd24`): the Home habit checklist is
replaced on phones by one tappable line — "X of Y habits done today →" → Overview
(which keeps the full list). New `habitsSummaryOnMobile` prop on DailyFocus.

**S5 — Mood chips one line** (`fcc6e38`): the five Journal mood chips no longer
wrap — `flex-wrap:nowrap` + `overflow-x:auto` (hidden scrollbar), compact chips.

**S6 — Task filter bar** (`2c48dbd`): on mobile the Active/Done/All toggle moves
next to "Add task" (compact); the filter chips go full-width with horizontal
scroll, a right-edge fade, and fully-pill chips. Desktop layout unchanged.

**S7 — Micro-animations** (`27bd3d0`): tab-switch fade+slide (150ms), bottom-tab
icon spring, press-in `:active` scale on buttons/chips, quick-note save checkmark
pulse — all off under reduced-motion.

**Build fix — production frosted glass** (this commit): esbuild's CSS minifier
was collapsing every paired `backdrop-filter` + `-webkit-backdrop-filter` rule
to the `-webkit-` form only, so the blur vanished in the production build on
engines supporting just the standard property (Chromium/Electron, Firefox,
Safari 18+) — the true reason the nav read as unblurred. `cssTarget` doesn't
prevent the collapse and lightningcss would downlevel the app's heavy
oklch()/color-mix(), so `build.cssMinify` is set to `false` (JS still minified).
The built CSS now carries both properties and the blur renders live.

## Phase 14 — Electron titlebar → Spotify/Discord style (2026-07-02, Claude Code)

Replaced the separate custom titlebar strip (which looked bolted-on above the
nav) with the Spotify/Discord approach: no title bar at all — the app's own
floating nav pill *is* the window's drag handle, and the native min/max/close
controls sit as a transparent overlay in the top-right corner over the nav.

- Removed `ElectronTitlebar.jsx` and its root mount; `useElectron()` now runs
  from `App.jsx` (still stamps `<html data-electron>`).
- `electron/main.js`: `titleBarOverlay` → `color: rgba(0,0,0,0)` (transparent so
  the nav shows through), `height: 52`, initial `symbolColor #2a2722`. Added a
  `titlebar-overlay` IPC handler calling `win.setTitleBarOverlay(...)`.
- `electron/preload.js`: exposes `setTitleBarOverlay(opts)`.
- `useElectron.js`: a `MutationObserver` on `<html data-theme>` recolors the
  overlay glyphs per theme — dark glyphs (`#2a2722`) on the light nav, light
  glyphs (`#f0eeec`) on the dark nav.
- CSS: dropped the old titlebar styles + 40px layout offsets. Under
  `html[data-electron]` the `.topbar` gets `-webkit-app-region: drag` with
  `padding-right: 130px` (clears the native controls), and every interactive
  child (`button/a/input/select/[role=button]/.goal-dropdown`) gets `no-drag`.

**Verified** via a headless Electron smoke window: transparent overlay config
constructs without error, `.topbar` app-region = drag / buttons = no-drag /
padding-right 130px, and the overlay recolor fires on theme change
(`#2a2722` → `#f0eeec`). Web/PWA build unaffected (all gated on `data-electron`,
never set in the browser). Installer rebuilt: **`Ligand Setup 1.0.0.exe`, 122 MB**.

## Phase 13 - Floating control glass polish (2026-07-02, Codex)

Adjusted the bottom-right floating Focus and Tweaks controls so they behave
more like the frosted topbar: the button surfaces now use translucent
theme-panel backgrounds, softer borders, and backdrop blur/saturation without
reducing icon or label opacity. This keeps goal/sidebar content visible under
the controls when they overlap.

**Verified**: `npm run build` passed with only the existing Vite large-chunk
warning. `npm run preview` was checked on the production build at 1280px
desktop and 375px mobile with zero browser console warnings/errors. The open
4174 tab had an old PWA cache, so the fresh build was visually verified on
port 4175.

Follow-up: shifted the desktop Focus pill right by centering it on the same
44px column as the Tweaks FAB. Verified on a fresh production preview at
1280px that both controls share the same centerline, and at 375px that mobile
quick note/Tweaks alignment is unchanged.

Follow-up 2: confirmed goal-health dots are driven by `goalHealth` (recent
activity green, 3-6 quiet days amber, 7+ quiet days red, overdue red, recovery
green), then reduced the desktop Focus pill from about 80px by 32px to about
73px by 30px while preserving the Tweaks-center alignment. Verified on a fresh
production preview at 1280px and checked mobile remained 44px.

Follow-up 3: hid desktop scrollbars by default while preserving scrolling, then
added a PC-only Settings -> Appearance toggle ("Desktop scrollbar") to restore
the normal scrollbar/gutter when desired. Restored the desktop Tweaks FAB to a
small 30px square, aligned its right edge with the shifted Focus pill, and
tightened the Focus label/icon alignment without changing mobile FAB sizing.
Verified on the production preview at 1280px and 375px with zero browser console
warnings/errors; `npm run build` passed with only the existing Vite large-chunk
warning. Claude's Electron work (`electron/main.js`) was left untouched.

Follow-up 4: moved the desktop Tweaks FAB slightly left after visual review
while keeping the Focus pill in place and leaving mobile FAB sizing/placement
unchanged.

Follow-up 5: moved the desktop Focus pill down so its gap above Tweaks matches
Tweaks' bottom-page gap. Guest mode now defaults the visible profile name to
"Guest", forces AI settings off/disabled with sign-in guidance, blocks AI calls
at the helper layer while signed out, and defaults weeks to Monday (with a
guest migration for old Sunday-default settings).

## Phase 12 — Electron desktop shell (2026-07-02, Claude Code)

Wrapped the existing Vite/React web app in Electron so it ships as a native
Windows desktop app (`.exe` installer via NSIS) — **an addition, not a
replacement**: the web/PWA build and Vercel deploy are untouched.

**Tooling** (`electron`, `electron-builder`, `concurrently`, `wait-on` as
devDependencies). `package.json` gains `main: electron/main.js`, three scripts
(`electron`, `electron:dev`, `electron:build`), and an electron-builder `build`
block (appId `com.ligand.app`, productName `Ligand`, output `dist-electron`,
win→nsis / mac→dmg, icon `public/pwa-512.png`).

**Main process** (`electron/main.js`, CommonJS via a local
`electron/package.json` `{"type":"commonjs"}` so the root ESM package doesn't
force `.mjs` gymnastics): a 1280×800 (min 1280×800, resizable) BrowserWindow
with `backgroundColor #15161a` (no white flash), `titleBarStyle: "hidden"` +
a dark `titleBarOverlay` (native min/max/close, themed), `Menu.setApplicationMenu(null)`,
secure `webPreferences` (contextIsolation on, nodeIntegration off, preload),
external http(s) links routed to the real browser via `setWindowOpenHandler` /
`will-navigate`. Loads `http://localhost:5173` in dev and `dist/index.html`
over `file://` when packaged (keyed off `app.isPackaged`, overridable with
`ELECTRON_START_URL`).

**Preload** (`electron/preload.js`): exposes a minimal read-only
`window.electron = { isElectron, platform }` over `contextBridge`.

**Renderer**: `useElectron()` detects the shell and stamps
`<html data-electron / data-electron-platform>`; `ElectronTitlebar` renders a
40px draggable dark titlebar (`-webkit-app-region: drag`) with the app name,
mounted at the root in `main.jsx` so it shows on every screen (auth, loading,
app). CSS reserves the 40px band (`.shell` padding-top +40, `.topbar` sticky
top → 52px, `.goal-sidebar` → 124px) only under `html[data-electron="true"]`.
All of this is inert in the browser (`window.electron` undefined → titlebar
renders nothing, no attribute, no offsets).

**Vite**: `base: './'` so the same build's asset paths resolve both from the
web root (Vercel/PWA) and over `file://` in the packaged app. Verified the
built `index.html` references `./assets/...` and the web build still renders +
registers its service worker with zero console errors.

**Verified**: web production build unaffected (renders, SW active, no Electron
titlebar/attribute). Electron end-to-end via a headless smoke window (removed
after) against both the dev server and the packaged `file://` build — Electron
detected (win32), titlebar present, main app renders, sticky offsets correct
(`.topbar` top 52px, `.shell` padding-top 54px). Installer built:
**`Ligand Setup 0.0.0.exe`, 122 MB** (NSIS, x64).

**Note — building on this machine:** Windows *Controlled Folder Access* on the
`Documents` folder blocks electron-builder's extract→rename step (`EPERM` on
`dist-electron/win-unpacked.tmp`). Building to a location outside `Documents`
(e.g. `--config.directories.output="%TEMP%\ligand-electron-out"`) succeeds, or
allow node/electron-builder through Controlled Folder Access, or keep the repo
outside `Documents`. `dist-electron/` is gitignored — binaries are never
committed.

## Phase 11 — Hooks fix + native-feel mobile polish (2026-07-02, Claude Code)

Clean baseline confirmed first (`npm run build` green, working tree clean).
A Priority-0 correctness fix, then seven polish sections, each committed
separately. Verified on the production build (`vite preview`, port 4173) at
375px and 1280px with zero console errors; desktop confirmed unaffected.

**P0 — React conditional-hook warning** (commit `742980b`): `RecoveryGoalTab`
called two `useEffect`s *after* an `if (!goal) return null` early return, so
the hook count changed with `goal` — a genuine `react-hooks/rules-of-hooks`
violation (it only surfaced when viewing a recovery goal, which the seed data
has none of, so a plain tab-switch sweep never triggered it). Found it via
`eslint` (the runtime warning couldn't be reproduced from tab switches alone),
moved both effects above the early return, and had the milestone effect derive
`recoveryData` internally with a `goal` guard. `eslint react-hooks/rules-of-hooks`
is now clean repo-wide. Verified live by injecting a recovery goal and switching
in/out of its tab repeatedly — zero warnings.

**1 — Transparent app icons** (commit `5cf3f58`): regenerated `pwa-192/512`
and the whole `apple-touch-icon` set (57–180) with a transparent canvas
instead of the solid `#15161a` fill. The gradient rounded-square logo mark
(blue→lavender, glossy highlight, inset ring, soft shadow) is unchanged; only
the surrounding field is now transparent so light home screens/taskbars supply
their own background. Corner-pixel alpha confirmed 0; splash images untouched.

**2 — Frosted-glass top nav** (commit `b2e3e73`): on phones the fixed nav pill
now uses `blur(20px) saturate(140%)` over an 85% panel surface, with a subtle
gradient `::after` fade below the pill so content scrolling behind dissolves
into the page instead of hard-cutting. Placed in the ≤640px phone block (where
the fixed pill actually lives); desktop nav (blur 14px) untouched.

**3 — Hidden scrollbars ≤768px** (commit `90c4b58`): `scrollbar-width: none`
+ `::-webkit-scrollbar { display: none }`, scrolling preserved.

**4 — Native active bottom-tab pill** (commit `5bfa83d`): wrapped each tab's
icon+label in a `.bottom-nav-pill`; the active highlight is now a snug capsule
filled with the accent at 15% opacity (radius 12px) with accent-colored
content, inactive tabs muted grey with no background. Replaces the old
icon-only tint + dot-above. Verified computed styles at 375px.

**5 — Quick-note sheet keyboard/scroll fix** (commit `9e3c6e7`): the backdrop
now pins to `window.visualViewport` while open so the sheet rests above the
soft keyboard, and the textarea flex-shrinks (body scrolls) to fit. Removed
swipe-down-to-dismiss — it closes only via the X button or a backdrop tap now,
so an accidental drag while typing can't discard the note; `touch-action: none`
on the backdrop stops it scrolling the page. Verified the full type→Save→"Saved"
→auto-close flow persists a note.

**6 — Hold-to-check habits (300ms)** (commit `0b5e84f`): replaced the 150ms
touch delay with a real press-and-hold — the habit checkbox must be held 300ms
before a check-in registers, with an accent fill animating across the circle as
live feedback. Releasing early (or moving past the scroll tolerance) cancels
with no check, and the synthetic click that follows a touch is suppressed so a
quick scroll-tap can no longer toggle a habit. Desktop mouse clicks still check
instantly. Verified all three paths live (quick-tap → no check; 300ms hold →
check; desktop click → instant check).

**7 — Native-feel polish** (commit `d98718a`): `overscroll-behavior: none` on
html/body (no rubber-band flash); default corner radius 12→16 in
`TWEAK_DEFAULTS` (new users only); `-webkit-tap-highlight-color: transparent`
on interactive elements; `touch-action: manipulation` on buttons/links; and an
inline `html { background-color: #15161a }` in `index.html` so launch/app-switch
never flashes white before React loads. All confirmed via computed styles.

## Phase 10 — More mobile fixes, quick-note FAB, real app icon, iTunes search (2026-07-01, Claude Code)

Clean baseline confirmed before starting (`npm run build` green, no
uncommitted changes). Six sections, each committed separately.

**Section 1 — Nav bar scrolled away on mobile** (commit `17a5c22`):
`.topbar` was `position: sticky`, which iOS Safari has a long-documented
bug with when combined with `backdrop-filter` — the element scrolls away
instead of sticking (doesn't reproduce in this environment's Chromium,
but matches a real, widely-reported iOS issue). Switched the mobile
topbar to `position: fixed` (still respecting
`env(safe-area-inset-top)` for the Dynamic Island/notch) and bumped
`.shell`'s top padding to clear it now that it's out of flow. Verified
the nav stays pinned through a 300px scroll with real overflowing
content.

**Section 2 — Quick-note FAB replaces Hyperfocus on mobile** (commit
`9be1c91`): below 768px, the same bottom-right FAB slot now opens a
quick-capture note sheet instead of toggling Hyperfocus (a sit-down
desktop mode, not a one-handed phone action) — gated on a new
`useIsMobile(768)` check in `App.jsx`. New `QuickNoteFab.jsx`: tap the
pencil FAB, an auto-focused textarea sheet opens ("What's on your
mind?"), Save creates a note via `store.addNote` and shows a brief
"Saved" checkmark before auto-closing after 1s; X/backdrop-tap/swipe-down
all dismiss without saving. Desktop keeps Hyperfocus untouched.

**Section 3 — Habit/task touch fixes** (commit `bde447b`):
- 3A: `.taskrow` / `.ov-habit-row` get `user-select: none` +
  `touch-action: manipulation` on mobile so a long-press doesn't also
  trigger text selection.
- 3B: the habit check-in button now gates on a 150ms touch delay
  (touchstart starts a timer, touchmove past 10px cancels it as a
  scroll-through) before calling `checkInHabit`, with a ref flag
  suppressing the following synthetic click so it doesn't double-fire.
  Desktop mouse clicks are unaffected. Verified live: a
  touchstart+touchmove(50px)+touchend gesture does NOT check the habit
  in even well past 150ms; a plain click still does instantly.
- 3C: habit names wrap freely instead of single-line-ellipsis-truncating
  — verified a 14-word name renders in full across 3 wrapped lines.

**Section 4 — Real app icon** (commit `872b455`): replaced the
placeholder "white L on solid purple" icon with the actual Ligand brand
mark used next to the wordmark in the top nav (`.brand-dot`) — a
rounded-square with the exact blue-to-lavender diagonal gradient
(`#558cb9` → `#b6aaff`), a soft glossy highlight, and a subtle inset
ring, all clipped to stay inside the rounded edge (a stroke-based first
attempt bled onto the background as a muddy gray outline at icon scale;
fixed with a clipPath around the whole mark). Centered at 60% of the
canvas on a `#15161a` background, regenerated at every existing icon
size (192/512 manifest, all 9 apple-touch-icon sizes 57–180) via `sharp`
rendering an SVG. `index.html`/`vite.config.js` already pointed at these
exact filenames, so only the PNG contents changed.

**Section 5 — Workout mobile audit** (commit `0fb96a3`): walked the full
flow at 375px — goal creation → 4-step onboarding → generate → preview
→ start → in-gym logger → finish summary → progress view. Found two
real bugs:
- The in-gym logger's set-completion checkbox was 32×32px, below the
  44px minimum this flow explicitly needs (it's the primary mobile use
  case). Widened to 44×44 on mobile, adjusted the set-row grid column
  to match.
- Found in passing (not workout-specific): the badge-unlock
  celebration's confetti burst can fly ~210px from center — on a 375px
  viewport this created real horizontal page overflow (measured
  `scrollWidth` 403 vs `clientWidth` 375). Fixed by clipping
  `.badge-cele-scrim` (the fixed backdrop) instead of the card, so
  confetti still bursts visually but never creates page-level scroll.
  Re-verified clean on a second badge unlock later in the same session.

Everything else in the flow (onboarding steps, preview modal, rest
timer, PR celebration, finish summary, progress charts) already fit
at 375px with no overflow and 16px inputs (from a prior session's
global mobile rule).

**Section 6 — iTunes song search** (commit `2471887`): the song title
field in the Journal's song-log form now debounces (400ms) into the
iTunes Search API (`itunes.apple.com/search`, free, no key) as you
type, showing a dropdown (album art, title, artist, album name).
Tapping a result fills title/artist/album. Uses `onMouseDown` (fires
before the input's `onBlur` closes the dropdown) and a monotonic search
token to discard stale responses. Any failure or empty result set just
leaves the dropdown closed — manual typing and saving are never
blocked, verified with both a real query (all fields correctly filled
from live iTunes data) and a nonsense query (manual entry still saved
normally). Works on both viewports.

_Aside, not a code change: the "July" song referenced in an earlier
session is by i dont like mirrors, not the placeholder artist used in
that session's test data._

### Verification

`npm run build` clean at every commit checkpoint. Final production
build verified via `vite preview` (not dev server): service worker
active, manifest correct, zero console errors cycling every tab at both
375px and 1280px, light and dark. Desktop confirmed unaffected by every
mobile-gated change (sticky nav, Hyperfocus FAB, 32px workout
checkboxes, unwrapped one-line habit text all still exactly as before).

---

## Phase 9 — Mobile fixes from screenshots + music feature (2026-07-01, Claude Code)

Two-part brief: priority mobile bug fixes first, then a new music
logging/discovery feature. Two commit checkpoints for Section 1
(1A-1C, then 1D-1F), plus this final one for Section 2.

### Section 1 — Mobile fixes (commits `506ab61`, `6f28ff0`)

**1A — Safe area cutoff**: `.shell`'s mobile padding had no top safe-area
inset at all (`padding: 10px 14px 96px`), so content drew under the status
bar/notch in standalone PWA mode — worse since last session's
`viewport-fit=cover` addition. Fixed: `padding-top` now folds in
`env(safe-area-inset-top)`; bottom padding also gained
`env(safe-area-inset-bottom)` alongside the bottom-nav's existing handling.
Mobile-only via the existing `max-width: 640px` block.

**1B — Focus FAB overlapping content**: verified this was a *real*,
reproducible bug, not just a visual quirk — with as few as 4-6 tasks or 7+
habits, the fixed Focus/Tweaks FABs' rectangle actually sat on top of a row's
Edit/Delete (or habit-edit) buttons and would intercept taps meant for them,
confirmed via exact `getBoundingClientRect()` overlap checks. Root cause:
both the FABs and the row action buttons are anchored to the same
bottom-right column. Fixed by (a) shrinking `.hf-fab` to a 44px icon-only
circle on mobile, matching `.tweaks-fab`'s existing treatment (was a ~90px
text pill), and (b) adding matching right-side clearance to `.taskrow` and
`.ov-habit-row` so their action buttons structurally can't reach that
column. Re-verified zero overlap with 6 tasks / 16 habits at any scroll
position.

**1C — Input zoom**: `input, select, textarea { font-size: 16px !important }`
at `max-width: 768px` — stops iOS Safari's zoom-on-focus for every form
field app-wide.

**1D — Compact add-task on mobile**: the 3-row inline form is replaced by a
compact "+ Add task" trigger + bottom sheet (auto-focused input, same
fields, dismiss via backdrop tap or swipe-down on the drag handle) on
mobile only. Desktop keeps the original inline bar unchanged — both share
one `TaskFormFields` component so they can't drift apart. Added
`src/hooks/useIsMobile.js` (a `matchMedia`-backed hook) since this needed
runtime branching, not just a CSS breakpoint.

**1E — Compact Home habits list**: the habit list already defaulted to
unchecked-only; added the missing "Show all N habits" expandable (mobile
only) so already-checked habits — previously just gone with no way back —
can still be glanced at, shown muted/struck-through. Rows are ~42px on
mobile now (was 60px+) via tighter padding and one-line "name · goal" text
instead of two stacked lines. Desktop/Overview untouched.

**1F — Long-press to edit, bigger tap targets**: a single tap on a task
name now does nothing (a brief `.taskrow.pressing` highlight) instead of
jumping into inline edit — holding for 500ms does, via touch-tracked
press/move/end handlers with a 10px move-tolerance (treated as a scroll,
not a hold). Desktop is unchanged (click still edits instantly — gated on
`useIsMobile()`). Edit/Delete are the explicit alternative and are now real
44×44 mobile tap targets (were ~22px with inline styles that also blocked
CSS from resizing them — moved to a `.taskrow-icon-btn` class).

All of Section 1 verified at both 375px and 1280px, light and dark, with
zero new console errors (see the one pre-existing, out-of-scope issue
noted at the bottom of this entry).

### Section 2 — Music feature (this commit)

**2A — Song log** (`data.songLog`, `createSong()` in `model.js`,
`addSong`/`updateSong`/`deleteSong` in `useStore.js`): a lightweight
`{ id, title, artist, album, mood, note, journalEntryId, date, createdAt }`
record — logging, not playback. Journal tab gained:
- A standalone "Log a song" button (Songs card, below Past entries) for
  fast, no-context capture — title is the only required field.
- A "+ Add song" option while composing an entry; songs logged this way
  are staged as removable chips under the compose box and linked to the
  entry (`updateSong(id, { journalEntryId })`) the moment "Save entry" is
  pressed.
- Attached songs render as a chip on their entry:
  `🎵 {title} - {note or artist}` (matches the brief's example exactly,
  verified live: "🎵 July - idk if i like mirrors").
- A full song log list (title, artist, date, note, delete) in its own
  card.

**2B — Focus Music suggestions** (`src/lib/focusMusic.js`, rendered in
**Settings → Focus music**, a desktop-appropriate settings section):
24 curated genre/mood entries across lo-fi, ambient, classical, jazz,
nature sounds, video-game OSTs, post-rock, and binaural-beats/frequencies,
each with a "Good for: …" line. Each links out to a Spotify *search* and a
YouTube *search* for that genre (`open.spotify.com/search/…`,
`youtube.com/results?search_query=…`) rather than a specific hardcoded
playlist ID — specific editorial playlist IDs drift/get retired over time
and a dead link is worse than a search that always returns something
current. No playback inside Ligand at all, per the brief.

**2C — Same-day surfacing**: built alongside 2A. If an entry has no
explicit song attached but a song was logged the same calendar day, the
entry shows a quieter `🎵 Listening to: {title} - {artist}` line instead
of a chip — verified both states live in the same session (one entry with
an explicit attach, a second same-day entry with only the ambient match).

**2D — Connect Spotify placeholder**: a disabled `Switch` (added a
`disabled` prop to the shared `Switch` control) in the new Settings →
Focus music section, tagged "Coming soon," hint text describing the future
auto-populate-from-now-playing behavior. No OAuth, no API calls — UI
placeholder only, as scoped.

### Known pre-existing issue (found, NOT fixed — flagged as a separate task)

While testing, the console showed a React "hooks order changed" warning on
every single tab switch. Investigated thoroughly: it reproduces even in a
production build (rules out a StrictMode dev-only artifact) and — via
`git stash` + checking out `b06f12f` (the commit before this entire
session) — it was already present before any of today's work. No visible
functional breakage was found across extensive manual testing of every
tab, but hook-order violations are inherently fragile, so it's flagged
rather than silently left. Filed as a background task
(`task_d5dcf794`) rather than fixed here, since finding the actual
conditional hook inside App's ~76-hook flattened call tree (which
includes every custom hook it calls: `useStore`, `useAuth`, `useSettings`,
`useNotifications`, `useBadges`, etc.) is its own investigation, out of
scope for this mobile-fixes-and-music session.

### Verification

`npm run build` clean throughout every checkpoint. Production build
verified via `vite preview` (not just dev server): service worker active,
manifest correct, zero *new* console errors at 375px/1280px and light/dark
(only the pre-existing issue above). Tooling note: this environment's
`preview_click`/eval-based clicks were intermittently flaky — a click
immediately followed by a state read in the *same* eval call would
sometimes report the pre-click state; splitting the click and the
follow-up read into two separate tool calls was reliable every time this
was tried, and is the pattern used throughout this session's verification.

---

## Phase 8 — PWA setup for iPhone (Add to Home Screen), pre-App Store (2026-07-01, Claude Code)

First step toward App Store distribution: get Ligand properly installable
on iPhone today via "Add to Home Screen," ahead of any native wrapper work.

**Manifest** (`vite.config.js`) — updated to match the app's real identity
instead of stale placeholder values:
- `description`: "Focus, habits, and goals - designed for ADHD" (was a
  different, longer sentence).
- `theme_color`: `#558cb9` — was `#863bff` (a purple that no longer matches
  anything in the app). The real light-theme accent is
  `oklch(0.62 0.09 245)` (`--accent-h: 245` in `src/index.css`), computed via
  canvas to its sRGB hex equivalent, `#558cb9`.
- `background_color`: `#15161a` — the dark theme's `--bg`, used as the
  splash-screen background while the app loads from the home screen icon.
- `orientation`: `portrait` (was `portrait-primary`; `portrait` is the value
  actually requested in the brief and is the more portable variant).
- `icons`: left at the existing 192/512 PNGs (used by the manifest/Android);
  iOS doesn't read this list at all (see below).

**iOS icons** — iOS ignores the manifest's `icons` array entirely and only
looks at `<link rel="apple-touch-icon">` tags. Generated all 9 standard
iOS sizes (57, 60, 72, 76, 114, 120, 144, 152, 180) from the existing
`pwa-512.png` source using `sharp` (installed with `--no-save` as a one-off
dev tool, not a project dependency — removed after use, `package.json`/
`package-lock.json` untouched). Files live at
`public/apple-touch-icon-{size}x{size}.png`; `index.html` now links all 9,
plus a bare `apple-touch-icon` (no `sizes`) pointing at the 180x180 as the
fallback modern iPhones actually use.
- *Note on process:* first attempt tried hand-transcribing base64 PNG data
  through the model — this silently corrupted one icon (wrong bytes spliced
  from a different size). Caught it before committing and switched to
  generating the files programmatically instead of ever routing binary
  image data through generated text.

**iOS meta tags** (`index.html`) — `apple-mobile-web-app-capable`,
`apple-mobile-web-app-status-bar-style` (`black-translucent`), and
`apple-mobile-web-app-title` were already present from a previous session.
Added: `viewport-fit=cover` to the viewport meta (lets the app draw under
the iPhone notch/home-indicator safe areas), and three
`apple-touch-startup-image` splash screens (iPhone 14 Pro 1179x2556,
iPhone 14 1170x2532, iPhone SE 750x1334 — each a solid `#15161a` background
with the app logo centered, generated with `sharp`), keyed by the correct
`device-width`/`device-height`/`-webkit-device-pixel-ratio` media queries.

**Verification (production build, not dev server):**
- `npm run build` clean; precache count went from 31 -> 43 entries (new
  icons/splashes picked up automatically by the existing
  `globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}']` rule).
- Served the actual `dist/` output via `vite preview` (port 4173) rather
  than the dev server, since dev mode doesn't register a service worker.
  Confirmed via the browser: `manifest.webmanifest` fetches and parses with
  the correct name/colors/description; `navigator.serviceWorker
  .getRegistrations()` shows an active registration scoped to `/`; zero
  console errors.
- **Offline fallback, tested for real**: killed the actual preview server
  process (`taskkill`, confirmed with `curl` returning connection-refused),
  then reloaded the already-open tab pointed at that dead origin. The app
  still rendered the full sign-in UI from the service worker's precache —
  not a blank page — with zero console errors. This is a genuine offline
  test, not a simulation: the origin was completely gone when the page
  loaded.
- Tooling note: `preview_start` in this environment did not respect the
  `ligand-preview` (port 4173, `vite preview`) entry in
  `.claude/launch.json` — it always launched the `ligand` (port 5173,
  `vite dev`) entry regardless of which name was requested, even after
  editing the config (looks cached at session start). Worked around by
  starting `vite preview` directly via Bash on 4173 and navigating the
  tool-controlled browser tab to that origin with
  `window.location.href = 'http://localhost:4173/'` — cross-origin
  navigation isn't blocked the way cross-origin `fetch` reads are, so this
  gave real DevTools-equivalent access to the production build. No code
  change resulted from this, just noting it for next time this comes up.

### Next steps for actual App Store submission (not done, path documented only)

Add to Home Screen gets Ligand installable today, but a real App Store
listing needs a native wrapper around the same web app. Two viable paths:

1. **Capacitor** (recommended) — wraps the existing Vite build almost as-is.
   `npx cap init`, `npx cap add ios`, point Capacitor's `webDir` at `dist/`,
   then open the generated Xcode project. Existing PWA manifest/icons carry
   over directly; add native plugins only if a feature needs one (haptics,
   push notifications) that the web APIs already used here
   (`navigator.vibrate`) can't cover on iOS Safari's WebView.
2. **Expo (React Native)** — a much bigger lift since the app is a plain
   React + Vite SPA, not React Native; would mean re-platforming components,
   not wrapping them. Not worth it unless native-only APIs become a hard
   requirement.

Either path additionally requires, before submission is possible at all:
- An **Apple Developer Program** account ($99/year) to sign builds and
  submit to App Store Connect.
- A Mac with Xcode (or a cloud Mac CI service) to build/archive the iOS
  binary — this can't be done from Windows directly.
- App Store assets: proper marketing screenshots per device size,
  a privacy policy URL (Ligand stores data locally/in Supabase — the
  policy needs to say so), and answers to Apple's data-collection
  questionnaire.
- A review pass for Apple's Human Interface Guidelines fit-and-finish
  expectations (safe-area handling, no dead-tap zones, etc.) — the
  `viewport-fit=cover` + existing safe-area CSS work already done for
  mobile this session is a head start here.

None of this was built this session — only documented as the path forward.

---

## Phase 7 — Hyperfocus FAB, mobile UX pass, workout system (2026-06-30, Claude Code)

Large multi-section brief: (1) Hyperfocus FAB + effect audit, (2) full mobile
UX pass (nav, Home, Notes, Journal, Tasks, general polish), (3) a full workout
system, (4) recovery journal sort fix, (5) polish. Working section by section,
committing after each, `npm run build` clean throughout, verified live via the
preview tool (console errors checked, computed styles/rects measured, screen-
shots where the tool cooperated) at 375px and 1280px, light+dark.

### DONE this session (committed + pushed)

**Section 1 — Hyperfocus FAB restored** (`b6eb0fb`)
- The FAB was dropped during the right-sidebar rework (`c5b3f12`) and never
  replaced. Re-added as a small pill (bolt icon + "Focus", not a large FAB),
  stacked directly above the Tweaks wand FAB (bottom-right) with a verified
  12px+ gap at both 1280 and 375px — no overlap with the wand or the goal
  sidebar. Active state now breathes (subtle pulsing glow) instead of a
  static glow.
- Audited the existing motion rebuild (`41b4730`) live, not just in code:
  confirmed via computed styles that all 4 radar rings animate, the scan
  line sweeps, card tilt applies a real 3D transform, and mousemove
  parallax updates the `--hf-mx`/`--hf-my` CSS vars. All already working;
  no fix was needed there.
- Found (but did not fix, out of scope) a pre-existing cascade bug: `.iconbtn`
  is declared after `.tweaks-fab` with equal specificity, so it silently
  wins the width/height tie and the wand renders at 30px instead of its own
  declared 44px on desktop.

**Section 2A — Mobile nav** (`696f6a6`)
- Goal dropdown rows now show the same health dot (`goalHealth()`) as the
  desktop sidebar, threaded via a new `tasks` prop through TopNav ->
  GoalDropdown.
- Bottom tab bar reordered/reduced to the 5 most-used-one-handed tabs: Home,
  Tasks, Notes, Journal, Overview (`BOTTOM_NAV_IDS`). Pomodoro + Settings
  moved to the avatar overflow menu (Pomodoro shortcut is mobile-only,
  verified hidden >=768px).
- Active-tab indicator strengthened: a small dot above the icon + bolder
  label weight, not just a color/tint shift.

**Section 2B — Mobile Home redesign** (`5255576`)
- New phone-only (`<768px`) "daily driver" view: greeting (existing), one
  "Today's focus" section, a "Capture a thought" button, a compact
  horizontally-scrolling goals row. Desktop dashboard (`.home-desktop-grid`)
  untouched and hidden on mobile via CSS — both trees render, CSS picks one.
- Extracted the "Today's focus" card out of `Overview.jsx` into
  `widgets/DailyFocus.jsx` so Home and Overview share one implementation.
  Overview's own rendering verified byte-identical after the extraction.
- Quick capture: `App.jsx` creates a blank note and stores its id;
  `Notes.jsx` accepts `autoOpenNoteId` and jumps straight into that note's
  editor with the textarea focused — verified end-to-end live (activeElement
  was the textarea after one tap).

**Section 2C — Notes FAB** (`0f65ef2`)
- "New note" is now a true floating circular FAB (52px) on phone, stacked
  above the Tweaks + Focus FABs with a verified 12px gap, hidden while
  actually in the editor (a fixed button sitting on top of the writing
  area the whole session would fight the "large comfortable text area"
  goal). Desktop and the 641-760px tablet band keep the original inline
  button, verified unchanged. List row height / editor size were already
  correct (measured 85px rows, 60vh/16px editor) — no changes needed there.

**Section 2D — Journal mobile polish** (`4a99593`)
- Compose textarea: 160px min-height + 16px font on phone (was a 6-row
  desktop default). Add-location button bumped to 40px (had to use a
  `.btn.location-add-btn` two-class selector to out-specificity the
  sitewide `.btn.sm` mobile rule). Remove-location and per-entry delete
  buttons bumped 22/24 -> 32px. Mood chips bumped to 38px. Entry list
  gets 16px gaps / 14px padding / 14.5px text (was 10/10/13).
- Hit the "inline style always beats a CSS class" trap three times while
  wiring this up (LocationPicker's remove button, the entry wrapper's
  padding-top, the entry text's font-size) — fixed by moving those values
  out of inline `style` and into CSS classes with base + mobile-override
  rules.

**Section 2E — Tasks mobile polish** (`abcd42d`)
- Task rows: 14px padding (was 9px), 24px checkbox (was 18px), 14.5px name
  text, bigger edit/delete tap padding — measured 101.6px row height on
  phone vs. 41.6px on desktop (verified both, unchanged desktop).
- Filter chips: scroll horizontally instead of wrapping to 2-3 lines on
  phone (`overflow-x: auto` + `flex-wrap: nowrap`, Active/Done/All segment
  pinned `flex: none` so it isn't squeezed) — verified genuinely scrollable
  (619px content in a 191px viewport), not just visually clipped.
- Add-task flow's existing mobile reflow (full-width input, 44px controls)
  was already correct — verified, no changes.

**Section 2F — General mobile polish** (`0bab3c3`)
- Overview goal cards were already reasonably readable on phone (single
  column, health pill, two stats, link) — verified live, no changes needed.
- Habit check-in (shared `DailyFocus` widget): checkbox 20->22px + more row
  padding on phone; habit/task names wrap instead of ellipsis-truncating
  now that the single mobile column has room to spare.
- Goal dropdown list items wrap instead of truncating (verified live: all
  4 rows showed `white-space: normal` after the fix). The compact topbar
  current-goal pill still truncates (it's chrome; the full name is always
  shown as the page's own `<h1>` once on that goal's tab) but now has a
  `title` attribute.
- Added a subtle 0.18s fade-in on `.page-head` (present at the top of every
  tab) so tab/goal switches read as a gentle transition; respects
  `[data-reduce-motion="true"]`.

**Section 3 — Workout system** (built in 5 staged commits)
All fitness data lives under the existing `ligand.data` blob (`data.workouts`,
`data.workoutTemplates`, `data.fitnessProfile`), so it syncs to the cloud with
zero sync-layer changes.
- **Stage A — data model + library** (`5cff69a`): `src/lib/exercises.js` with
  61 exercises across all 8 muscle groups (each { id, name, muscleGroup,
  equipment[], type, instructions? }); canonical equipment tags mapped from
  the onboarding choices. model.js factories (createFitnessProfile, createSet,
  createWorkoutExercise, createWorkout, createWorkoutTemplate) + helpers
  (workoutVolume, exercisePR, weeklyWorkoutStreak, workoutsThisWeek). Store
  actions add/update/delete for workouts + templates + updateFitnessProfile.
- **Stage B — goal type + onboarding + tab + logging** (`b906dc5`): third
  "A fitness goal" chooser card + 4-step onboarding (name, experience,
  equipment multi-select, days/focus/unit). New `FitnessGoalTab` (today's
  workout / weekly progress / streak / recent sessions / PRs per muscle
  group) and full-screen `WorkoutLogger` (searchable library, per-exercise
  sets, tap-to-complete, live timer, finish summary). Logger portaled to
  document.body so it covers the FABs.
- **Stage C — rest timer + PR celebration + templates** (`6d19f48`):
  auto-start rest countdown after each set (strength 90s / cardio 30s,
  ±15 adjust, skip, vibrate + chime at zero); trophy celebration when a set
  beats the all-time best; save-as-template on the summary; start chooser
  (log freely / from template). Fixed an effect-ordering bug (side effects
  were inside the setState updater, which runs during render).
- **Stage D — intelligent generation** (`092d519`): `src/lib/workoutGen.js`
  builds a session from equipment + level (volume) + goal (reps) + muscle
  recovery (avoid groups trained <2 days ago) + progressive overload
  (+2.5kg/+5lb past last session). `WorkoutPreview` modal to swap/adjust/
  regenerate/save/start. Verified generation correctly avoids a
  same-day-trained group.
- **Stage E — progress tracking + 7 badges** (`e308fc7`): Overview/Progress
  toggle on the fitness tab; `FitnessProgress` with weekly/30-day summary,
  muscle-balance bars, per-exercise weight/volume sparklines (hand-rolled
  SVG), and optional body-stats (weight/body-fat) trend. New "Fitness" badge
  category: First Rep, Consistent, Iron Will, PR Breaker, Comeback, Volume
  King, Streak Builder — wired to workout-derived stats in App's badgeStats.

**Section 4 — recovery journal** (`d7e5626`)
- Investigated the reported "still oldest-first" issue: the newest-first
  default + sort toggle are already present and working (added in `d941aa1`),
  confirmed live. No sort bug. Aligned the only real inconsistency — recovery
  entries showed date-only while the main journal shows full date+time — to
  the shared `formatEntryDateTime` format.

**Section 5 — em dash cleanup** (`3d4a38e`)
- The app already declares UTF-8 so em dashes render fine, but per the brief
  replaced hardcoded em dashes with ASCII hyphens across all user-facing text
  (tabs/components/widgets/layout + ai.js/recovery.js content) and lone "—"
  placeholders. 177 substitutions, 1:1, no logic touched.
- Stale-value audit: flagged (did not fix) the pre-existing `.iconbtn`
  vs `.tweaks-fab` CSS cascade quirk — left alone because the Focus FAB
  stacking is positioned around the current layout.

### Final sweep — PASSED
- `npm run build` clean throughout (only the pre-existing >500 KB bundle
  warning). Every section verified live in the dev preview.
- All 7 top-nav tabs + the fitness goal tab cycled at 1280 (dark) and 375
  (light): zero console errors/warnings, no horizontal overflow.
- Fitness system exercised end-to-end live: onboarding → generate/log →
  rest timer → PR celebration → save template → start-from-template →
  progress charts → body stats → badge unlocks (First Rep, PR Breaker).

### Addendum — Hyperfocus color palette fix (colors/opacity only, no animation changes)
- The all-bright-red palette read as an alert/warning screen rather than a
  premium focus mode. Retuned every hyperfocus color token/rule to a dark,
  desaturated "cockpit" palette while leaving all animation code/timing
  untouched:
  - `--accent`: `#cc1111` → `#8b0000` (deep crimson); `--line`/`--line-strong`
    → barely-visible dark red borders (`rgba(120,0,20,.3)` / `rgba(139,0,0,.45)`).
  - `--ink-2/-3/-4` de-tinted back to the site's normal neutral warm greys
    (no longer reddish) — only `--accent`/`--accent-ink` carry the red now.
  - `.card` in hyperfocus: dark charcoal (`rgba(26,26,31,.82)`) instead of
    red-tinted glass; border/glow reduced to a hint.
  - `.hf-wave-*` ambient blobs: hue shifted from bright red to deep burgundy
    (`rgba(61,0,16,…)` / `rgba(26,0,8,…)`) with lower opacity.
  - `.hf-ring` radar pulse: color swapped to `#8b0000`-based rgba, peak
    opacity capped at 0.3 (was up to 0.8) — reads as a heat signature, not
    a neon circle.
  - `.hf-scan` line: red → barely-visible white/silver (`rgba(255,255,255,
    .08)` max).
  - `.hf-fab.active`, nav active pill/tab-indicator, bottom-nav active,
    Pomodoro hyperfocus scene rings/gauge glow, `.hf-start-prompt`: all
    retuned to the same deep-crimson-on-charcoal treatment.
  - Verified live (guest mode): computed `--accent`/`--ink`/`--line`/wave/
    scan/FAB values all match the target palette; toggling hyperfocus off
    correctly reverts `--accent` to the theme's normal token
    (`oklch(0.62 0.09 245)`), confirming no bleed. `npm run build` clean.
    Desktop-viewport screenshots hit the known intermittent tool-render bug
    (mobile screenshots and computed-style reads worked fine and were used
    as verification instead).

---

## Phase 6 — Hyperfocus rebuild + mobile touch audit (2026-06-30, Claude Code)

### DONE this session (committed + pushed)

**Hyperfocus mode motion rebuild** (`41b4730`)
- Rings rebuilt with real depth: 4 rings staggered 1.375s apart (5.5s cycle),
  each starting at `scale(0.06)` with 4px border + 5px blur (close to viewer),
  expanding to `scale(1.06)` with 0.5px border + 0px blur (receding). Creates
  genuine radar/sonar depth rather than flat opacity circles.
- HUD scanning line: `position: absolute` 1px div sweeping full viewport height
  over 12s with a red beam gradient, ~0.5–0.7 peak opacity.
- Card tilt increased from `rotateX(1deg)` → `rotateX(3deg)` with
  `perspective(900px)` (now visible/pronounced).
- Mousemove parallax: App.jsx `mousemove` listener writes `--hf-mx`/`--hf-my`
  (−1→1, viewport-normalised) to `:root`. Cards read these in their `rotateX` /
  `rotateY` `calc()` for a lightweight depth shift as the cursor moves. On hover,
  tilt reduces to `0.5deg` base and cards lift `translateY(-3px)`.
- Particles removed (redundant with the stronger rings). Waves + vignette kept.
- `prefers-reduced-motion` / `data-reduce-motion` hides rings + scan; colour
  theme intact.
- Verified at 375 and 1280px; ring arc visible in card gaps in live preview.

**Section 3D — mobile touch target audit** (`5090519`)
- Audited every interactive element at 375px. Fixed all critical < 44px targets:
  - `iconbtn` 38 → 44px, `avatar-btn` 36 → 44px
  - `goal-dd-btn` 40 → 44px, `hf-fab` 40 → 44px
  - `.btn` 38 → 44px, `.btn.sm` 32 → 36px
  - `input.input / select.input` 38 → 44px
  - `.seg button` 30 → 36px, `.chip` 28 → 34px
  - `notes-search` container 38 → 44px, `notes-new-btn` 40 → 44px
  - `notes-search-clear` 22 → 28px, `.dyk-next` 24 → 36px
- All changes inside `@media (max-width: 767px)` — desktop unchanged.
- Keyboard safety confirmed: Journal and Notes textareas are `position: static`
  so viewport reflow when mobile keyboard appears is handled naturally.
- Bottom nav items already 50px — no change needed.

### NOT done this session (unchanged from Phase 5 notes)
- **Section 3B** — mobile bottom tab bar reshuffle. **Blocked on Section 4**
  (Workout tab doesn't exist yet). Leave for the workout session.
- **Section 3C** — combined mobile Home/Overview. Also blocked on Section 4.
- **Section 4 — Workout system** — NOT STARTED.

---

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
