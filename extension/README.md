# Ligand browser extension

A small Chrome/Edge extension: quick capture into Ligand, the tab group you're
working in linked to a task, and your running Pomodoro on the toolbar.

## Install (unpacked, no store account needed)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this `extension/` folder
4. Open Ligand in a tab (`http://localhost:5173` in dev, or your deployed URL)

Pin the extension so the icon — and the Pomodoro badge — stay visible.

## What it does

- **Quick task / note / log.** Type once, hit Enter. A task captured while
  you're inside a tab group is automatically linked to that group.
- **Link a tab group to a task.** "Working on" picks which task the current
  group belongs to. A group belongs to at most one task, so choosing a new
  one releases the old.
- **Pomodoro.** The popup shows the live countdown and the toolbar badge shows
  minutes left. Both read the session's absolute end time, so they stay
  correct even when Ligand isn't the focused tab.
- **Captures survive Ligand being closed.** They queue and flush the moment a
  Ligand tab loads.

## How it talks to Ligand — no backend, no account

The extension never writes Ligand's storage itself. `bridge.js` (a content
script on Ligand pages) relays requests to the page, and the page performs
every write through the app's real store actions
(`src/hooks/useExtensionBridge.js`).

```
popup ──chrome.runtime──▶ background ──chrome.tabs──▶ bridge ──postMessage──▶ Ligand page
                              │                                                    │
                              └──────────── snapshot / reply ──────────────────────┘
```

That means:

- **One data model.** No duplicated task/note/activity shapes to drift.
- **Works in guest mode.** No sign-in, no server, no OAuth. If you are signed
  in, writes ride your existing Supabase sync exactly like a normal click.
- **Nothing new is exposed.** Snapshots carry only open tasks (id, text, done,
  linked group) and the Pomodoro session. Tasks marked *private from
  assistants* are withheld, same as they are from assistants.

Messages are rejected unless they come from the page's own window and origin,
so another tab or an embedded iframe cannot drive it.

## Permissions, and why

| Permission | Why |
| --- | --- |
| `tabs` | Read the active tab's title (for "use this page's title") and find an open Ligand tab |
| `tabGroups` | Read the current group's name and color |
| `storage` | Cache the snapshot and hold the offline capture queue |
| host permissions | Only `localhost`, `127.0.0.1`, and `*.vercel.app` — where Ligand runs |

No browsing history is collected and no URLs are sent to Ligand.

## Configuring your own domain

If Ligand is deployed somewhere other than `*.vercel.app`, add that origin in
two places in `manifest.json` — `host_permissions` and `content_scripts.matches`
— then reload the extension.

## Status

v0.1 — quick capture, tab-group→task linking, Pomodoro display. Not published
to the Chrome Web Store; load it unpacked. Firefox is not supported yet (its
tab-group extension API is newer and differs).
