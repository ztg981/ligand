# Ligand Project Handoff

## App Name

Ligand

## Tech Stack

- React 19
- Vite
- Tailwind CSS directives plus custom CSS design tokens in `src/index.css`
- Local-first persistence with `localStorage`
- No backend
- No paid API dependency

Useful commands:

```powershell
npm.cmd run dev
npm.cmd run build
npm.cmd run lint
```

On this Windows/PowerShell setup, `npm run build` may be blocked by script execution policy because it tries to load `npm.ps1`. Use `npm.cmd run build` instead.

## App Purpose

Ligand is a productivity + journaling + goal-tracking app designed for people with mild ADHD-style focus struggles.

It should help users build habits, reach goals, track progress, journal, use Pomodoro, and get encouraging feedback. The product should feel encouraging, forgiving, customizable, and not overwhelming. Quiet days should not be framed as failure.

## Current Implemented Features

- Top tab/nav layout with Home, goal tabs, Tasks, Pomodoro, Journal, and Settings.
- Home dashboard with greeting, progress overview, urgent tasks, overdue goal display, gentle re-entry messaging, encouraging messages, and a count-up widget.
- Built-in Productivity goal.
- Custom user goal tabs.
- SMART goal creation flow with guided fields and optional starter habits.
- Goal details section showing saved SMART metadata.
- Rename custom goals inline from the goal tab.
- Archive custom goals from the nav hover X or goal tab.
- Restore or permanently delete archived goals from Settings.
- Tasks tab with create, edit, complete, delete, labels, filters, and optional goal linking.
- Tasks can be created inside a goal tab and are automatically linked to that goal.
- Goal-linked tasks support short-term and long-term terms.
- Goal-linked task progress summaries.
- Overdue goal detection for SMART target dates.
- Gentle overdue cleanup flow with keep/snooze, revise target date, or archive goal.
- Pomodoro tab with a working countdown timer, adjustable work/break durations, phase switching, session dots, and theme picker.
- Airplane Pomodoro scene is visually implemented.
- Other Pomodoro scenes are placeholder tiles.
- Journal tab with rotating prompts, mood labels, saved entries, and delete confirmation.
- Per-goal reflection widget with prompts and saved reflections.
- Forgiving habit checker inside goal tabs.
- Habit streaks pause instead of shattering when the user does not open the app.
- Count-up "What I'm proud of" widget seeded into the app.
- Goal Widget System V2:
  - Goal tabs render through one main widget grid.
  - Preset widgets include overdue review, goal details, habits, goal tasks, progress, count-up, reflections, encouragement, and Pomodoro quick-start.
  - Existing v1 `goal.widgetLayout` custom widgets are migrated/fallback-appended into the v2 grid and are not deleted.
  - Per-goal `widgetLayoutV2` persists widget order, size, hidden state, lock state, source, and settings.
  - Edit layout mode supports resizing, hiding core widgets, restoring hidden widgets, removing user-added widgets, native drag-handle reordering, and move up/down fallback controls.
  - Real size variants: compact, medium, wide, tall, and large. The desktop grid uses six columns so width/height changes are visible.
  - Add Widget picker supports core widgets and safe extra widgets, scrolls internally, closes with Escape/outside click, and locks background scrolling while open.
  - Existing visible widget types cannot be duplicated from the picker. Hidden widgets are restored instead.
  - Edit layout recovery controls include reset to default, restore hidden defaults, and Default / Focus / Journal / Minimal / Dashboard presets.
- Extra low-risk widgets currently implemented:
  - Next tiny step
  - Goal deadline
  - Habit streak summary
  - Recent wins
  - AI summary placeholder
- Settings tab with profile, appearance, focus timer, notifications preferences, wallpaper/sound preferences, assistant preferences, habit preferences, archived goals, and data behavior controls.
- Floating Tweaks panel for theme, accent, glow, radius, and density.
- `confirmBeforeDelete` setting is wired into normal delete/archive flows.
- localStorage persistence.
- Placeholder AI helpers for encouragement, summaries, re-entry text, and reflection prompts.
- Placeholder notification and wallpaper/sound modules.

## Consistency & Re-engagement Systems (added 2026-07-14)

Built for the "the app doesn't push me enough" problem. All local-first.

- **Tray residency (Electron)**: closing the window hides to tray (renderer
  keeps running, so reminders/alarms still fire). `settings.desktop`
  { closeToTray, launchAtLogin } syncs to main via `desktop:configure` IPC;
  login launch passes `--hidden`. Quit for real from the tray menu.
- **Daily reminder**: fires AT `settings.notifications.reminderTime` via a
  30s tick in App.jsx whenever the app runs (not just on open). Optional
  `notifications.anchor` ("after I ___") personalizes the wording
  (implementation intentions).
- **ShowUpWeek widget** (`ligand.showUpWeek`): flexible N-of-7 weekly
  showing-up target; lib `src/lib/showingUp.js` (tested). Weeks that fall
  short are skipped, never punished; kept weeks bank forever.
- **NextBadge widget**: progress bars toward the 1-2 nearest badges
  (goal-gradient); lib `src/lib/badgeProgress.js` (tested).
- **Fresh-start review**: detection in `src/lib/goalTriage.js` (tested) —
  never-started >= 14d, target date passed, quiet >= 14d, window mostly
  elapsed. Wizard `src/components/FreshStartReview.jsx`: one goal per step,
  timeline viz, four moves (shrink / move date / shelve / keep) + "decide
  later"; decisions batch-apply on Finish; summary picks up to 3 focus
  goals (sets `goal.pinned`, spotlighted in GoalsGrid). Offer state in
  `ligand.freshStart` (3-day snooze, 7-day cooldown) — auto-opens on
  return-from-gap or goal pile-up; manual entry card on Home.
- **ResumeThread widget**: after 2+ days away, "pick up the thread" cues
  (open Today tasks, last focus, last journal) with one-tap jumps.
- **GoalLoad widget**: "your plate" capacity bar (comfortable up to 5).
- **Tomorrow's first thing**: WindDown asks "Tomorrow, I'll start with…"
  (`ligand.tomorrowFirst`); next morning the Pick-one card shows it as
  "Your first thing · chosen last night".
- **Fresh-start re-entry copy**: Monday/1st-of-month returns get
  fresh-start framing in `reentryMessage`.

Tone rule for all of it: reshaping/quitting is information, never failure;
a property test asserts triage copy contains no shame words.

### Sleep diary (added 2026-07-14, same session)

- Self-contained: `ligand.sleep` (one entry per wake-date, upsert) via
  `src/hooks/useSleepLog.js`; pure math in `src/lib/sleep.js` (tested —
  cross-midnight durations, circular wake-time consistency, kind copy).
  Deliberately NOT in ligand.data, so it can't tangle with cloud sync.
- **Morning check-in gate** (`MorningCheckIn.jsx`): on the first open
  before noon, a calm full-screen "how did you sleep?" shows BEFORE the
  dashboard — the sleep log is the daily anchor habit, and the gate also
  solves "I don't open the app because I'll have to face everything".
  Skip is one tap (stamps `ligand.sleepSkipped`); disable in Settings →
  Sleep. After saving, the dashboard is revealed by the user's own tap.
- **SleepCard** Home widget: 14-night bars (height = duration, opacity =
  quality 1-5), dashed avg line, last-night line, wake-consistency line
  (CBT-I: steady wake time is the anchor). "Edit"/"Log last night" opens
  the gate manually at any hour.
- **Bedtime wind-down nudge**: optional, 30 min before target lights-out
  (`settings.sleep.bedtime`), 30s tick + oncePerDay, works in the tray.
- Anti-orthosomnia rule: no scores, no verdicts, short nights described
  never judged (property test in test/sleep.test.mjs).

## Current Data / Persistence Structure

Persistence is local-first through `src/hooks/useLocalStorage.js`.

Known localStorage keys:

- `ligand.data`: main app data from `src/hooks/useStore.js`
- `ligand.settings`: app preferences from `src/hooks/useSettings.js`
- `ligand.tweaks`: visual personalization from `src/theme/useTweaks.js`
- `ligand.pomodoro`: Pomodoro settings from `src/hooks/usePomodoro.js`
- `ligand.lastVisit`: Home re-entry detection from `src/tabs/Home.jsx`

Main data lives in `ligand.data`:

```js
{
  version: 1,
  goals: [],
  tasks: [],
  countUps: [],
  journal: []
}
```

Model basics are defined in `src/lib/model.js`.

Goal basics:

- `id`
- `name`
- `type`: `built-in` or `custom`
- `color`
- `smartFields`
- `deadline`
- `overdueSnoozedUntil`
- `habits`
- `reflections`
- `widgetLayout`: legacy v1 widget data, preserved for fallback
- `widgetLayoutV2`: current per-goal widget layout data
- `status`: `active`, `done`, or `archived`
- `createdAt`

`widgetLayoutV2` shape:

```js
{
  version: 2,
  widgets: [
    {
      id: "core-goal-details",
      type: "goalDetails",
      size: "wide",
      order: 10,
      hidden: false,
      locked: true,
      source: "preset",
      settings: {}
    }
  ]
}
```

Task basics:

- `id`
- `text`
- `label`: usually `Today`, `Urgent`, `General`, or a goal name
- `goalId`
- `term`: `short` or `long`
- `done`
- `createdAt`

Habit basics:

- `id`
- `name`
- `cadence`
- `checkIns`: completed dates only
- `createdAt`

Reflection / journal entry basics:

- `id`
- `text`
- `prompt`
- `mood`
- `createdAt`

Count-up basics:

- `id`
- `label`
- `startDate`

Important data behavior:

- Habits are forgiving. The app records completed check-ins only and does not write missed days.
- Count-ups count elapsed days from a start date and do not require daily opening.
- Custom goal archive is a soft delete. Permanent goal deletion happens from Settings and also removes tasks linked to that goal.
- Erase all data should stay always-confirmed even when `confirmBeforeDelete` is off.

## Original Full Feature Vision

- Home dashboard.
- Smart goal tabs.
- Built-in Productivity goal.
- Custom user goals such as Side Hustles, College Planning, Get Fit, and other personal goals.
- Tasks / to-do list with labels such as Today, Urgent, General, and goal-linked labels.
- Goal-linked short-term and long-term tasks.
- Tasks creatable from inside goal tabs.
- Pomodoro timer with a simple, non-overwhelming interface.
- Pomodoro themes including NYC subway, airport, airplane, cafe, library, and more.
- Theme-specific wallpapers and sound effects.
- Theme changes based on time of day, such as airport day/night modes.
- Habit checkers connected to goals.
- Count-up "What I'm proud of" widget for streaks or refraining-from counters.
- Widgets added by a plus button.
- Widgets draggable, resizable, and removable.
- Per-goal widget layouts.
- Journal and reflection prompts.
- Encouraging messages.
- Gentle re-entry flow when the user has been away.
- Overdue goal detection and cleanup prompts.
- Notifications / desktop notifications for overdue goals, urgent tasks, Pomodoro completion, habit reminders, and re-entry.
- Settings for notifications, wallpaper/sound, preferences, desktop notifications, app behavior, habit preferences, and AI placeholders.
- Wallpaper/sound catalog and eventual wallpaper folder/picker system.
- AI summaries, advice, progress review, next steps, journal help, and encouraging messages later.
- Prefer no paid API dependency for now. Placeholder or local/fake AI is acceptable until the user chooses an API path.
- Desktop/web app first.
- Mobile layout later.

## Widget Ideas

Implemented safe extras:

- Next tiny step
- Goal deadline / timeline
- Habit streak summary
- Recent wins
- AI summary placeholder

Future ideas:

- This week's focus
- Brain dump
- Blockers / friction log
- Weekly review
- Milestone checklist
- Reward tracker
- Goal energy meter
- Calendar/deadline widget
- Time estimate / effort widget
- Progress narrative / "what changed since last time"
- Custom note card
- Resource links
- Focus playlist or ambient sound shortcut
- Habit reminder schedule
- Goal cleanup assistant

## Known Gaps / Missing Features

- Widget V2 uses native HTML5 drag-handle reordering plus move up/down fallback controls. `dnd-kit` has not been added.
- Drag is intentionally simple and handle-based. It is not yet a full physics-style drag system with animated insertion previews.
- User-added widget-specific storage/settings are minimal. Add this carefully if widgets like Brain dump or Milestone checklist need their own data.
- Count-up widget is seeded but there is no full UI for adding, editing, removing, or having multiple count-ups.
- Browser/desktop notifications are not implemented.
- Pomodoro completion chime is not implemented.
- Only the Airplane Pomodoro scene is visually implemented.
- NYC subway, airport, cafe, library, and other Pomodoro themes still need real visuals.
- Time-of-day theme changes are not implemented.
- Wallpaper choices save in Settings but do not yet paint the app background.
- Ambient sounds save in Settings but do not yet play audio.
- AI is templated placeholder logic only. No paid API is connected.
- Search and notification icon buttons in the top nav appear mostly decorative/placeheld.
- Mobile/responsive polish is still a later phase.
- There are some mojibake characters in copied text/comments, likely from encoding during earlier handoff work. Be careful when editing nearby text.

## Known Caveats

- AI, notifications, and wallpaper/sound systems are placeholders.
- `goal.widgetLayout` is legacy v1 widget layout data. Do not delete it until there is a deliberate migration/cleanup step.
- `goal.widgetLayoutV2` is generated as a fallback if missing and persisted once the user edits the layout.
- Reset/preset layout controls change only layout metadata. They do not delete tasks, habits, reflections, count-up data, or journal content.
- `npm.cmd run lint` currently fails on pre-existing repo-wide React lint rules in `src/components/Icons.jsx`, `src/hooks/useLocalStorage.js`, and `src/hooks/usePomodoro.js`. Widget build verification still passes.
- The app currently depends on localStorage shape. Preserve the shape or write careful migrations when changing persisted data.
- PowerShell may block `npm run build`; use `npm.cmd run build`.

## Widget Manual Test Checklist

- Open a goal tab.
- Enter Edit layout.
- Reorder widgets using the drag handle.
- Reorder widgets using Up/Down fallback controls.
- Resize widgets to compact, medium, wide, tall, and large.
- Open Add Widget and confirm the modal scrolls internally without the page behind it scrolling.
- Add a widget.
- Hide a default widget.
- Restore a hidden widget.
- Remove a user-added widget.
- Reset the layout to default.
- Try Default, Focus, Journal, Minimal, and Dashboard presets.
- Refresh and confirm the layout persists.
- Switch to another goal and confirm it has a separate layout.
- Confirm SMART details, tasks, habits, reflections, count-up, and overdue review still work.
- Confirm Home, Tasks, Pomodoro, Journal, and Settings still open normally.

## Development Rules

- Never rewrite the app from scratch.
- Prefer small incremental changes.
- Preserve localStorage data shape or migrate carefully.
- Run `npm.cmd run build` on PowerShell if `npm run build` is blocked by policy.
- Commit after each stable feature.
- Ask before adding paid APIs.
- Keep the UI calm, friendly, forgiving, and ADHD-friendly.
- Avoid shaming language around missed days, overdue goals, or inactivity.
- Keep new features local-first unless the user explicitly asks for backend or cloud sync.
- Use existing patterns before introducing new libraries or architecture.
