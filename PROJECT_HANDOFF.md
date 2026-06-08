# Ligand Project Handoff

## App Name

Ligand

## Tech Stack

- React 19
- Vite
- Tailwind CSS
- Plain CSS design tokens in `src/index.css`
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

- Top tab/nav layout with main app tabs and goal tabs.
- Home dashboard with greeting, progress overview, urgent tasks, overdue goal display, gentle re-entry messaging, encouraging messages, and a count-up widget.
- Built-in Productivity goal.
- Custom user goal tabs.
- Add custom goals through the nav plus button.
- Rename custom goals inline from the goal tab.
- Archive custom goals from the nav hover X or goal tab.
- Restore or permanently delete archived goals from Settings.
- Tasks tab with create, edit, complete, delete, labels, filters, and optional goal linking.
- Goal-linked task progress summaries.
- Pomodoro tab with a working countdown timer, adjustable work/break durations, phase switching, session dots, and theme picker.
- Airplane Pomodoro scene is visually implemented.
- Other Pomodoro scenes are placeholder tiles.
- Journal tab with rotating prompts, mood labels, saved entries, and delete confirmation.
- Per-goal reflection widget with prompts and saved reflections.
- Forgiving habit checker inside goal tabs.
- Habit streaks pause instead of shattering when the user does not open the app.
- Count-up "What I'm proud of" widget seeded into the app.
- Settings tab with profile, appearance, focus timer, notifications preferences, wallpaper/sound preferences, assistant preferences, habit preferences, archived goals, and data behavior controls.
- Floating Tweaks panel for theme, accent, glow, radius, and density.
- localStorage persistence.
- Placeholder AI helpers for encouragement, summaries, re-entry text, and reflection prompts.
- Placeholder notification and wallpaper/sound modules.
- Inline confirm buttons for task delete, habit delete, journal entry delete, goal reflection delete, and permanent archived-goal delete.

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

Model basics are defined in `src/lib/model.js`:

- Goal:
  - `id`
  - `name`
  - `type`: `built-in` or `custom`
  - `color`
  - `smartFields`
  - `habits`
  - `reflections`
  - `deadline`
  - `status`: `active`, `done`, or `archived`
  - `createdAt`
- Task:
  - `id`
  - `text`
  - `label`: usually `Today`, `Urgent`, or `General`
  - `goalId`
  - `term`: `short` or `long`
  - `done`
  - `createdAt`
- Habit:
  - `id`
  - `name`
  - `cadence`
  - `checkIns`: completed dates only
  - `createdAt`
- Reflection / journal entry:
  - `id`
  - `text`
  - `prompt`
  - `mood`
  - `createdAt`
- Count-up:
  - `id`
  - `label`
  - `startDate`

Important data behavior:

- Habits are forgiving. The app records completed check-ins only and does not write missed days.
- Count-ups count elapsed days from a start date and do not require daily opening.
- Custom goal archive is a soft delete. Permanent goal deletion happens from Settings and also removes tasks linked to that goal.

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

## Known Gaps / Missing Features

- SMART goal creation flow is not built yet. Goal creation currently uses a simple prompt.
- Widget system is not built yet. There is no plus-button widget picker, drag, resize, remove, or per-goal layout persistence.
- Tasks cannot yet be created directly inside a goal tab.
- Short-term vs long-term task UI is not fully exposed, even though the model has a `term` field.
- Count-up widget is seeded but there is no full UI for adding, editing, removing, or having multiple count-ups.
- Overdue goals are displayed on Home but do not yet have a keep/revise/delete cleanup flow.
- Browser/desktop notifications are not implemented.
- Pomodoro completion chime is not implemented.
- Only the Airplane Pomodoro scene is visually implemented.
- NYC subway, airport, cafe, library, and other Pomodoro themes still need real visuals.
- Time-of-day theme changes are not implemented.
- Wallpaper choices save in Settings but do not yet paint the app background.
- Ambient sounds save in Settings but do not yet play audio.
- AI is templated placeholder logic only.
- Search and notification icon buttons in the top nav appear mostly decorative/placeheld.
- Mobile/responsive polish is still a later phase.
- There are some mojibake characters in copied text/comments, likely from encoding during earlier handoff work. Be careful when editing nearby text.

## Known Caveats

- `confirmBeforeDelete` is stored in Settings, but delete confirmations currently appear to always be on. The UI does not appear to read that preference yet.
- AI, notifications, and wallpaper/sound systems are placeholders.
- The app currently depends on localStorage shape. Preserve the shape or write careful migrations when changing persisted data.
- PowerShell may block `npm run build`; use `npm.cmd run build`.

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
