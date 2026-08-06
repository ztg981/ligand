import { useEffect, useRef } from "react";
import { resolvedAccent } from "../lib/appIcon.js";
import { GOAL_TYPES, isActiveGoal } from "../lib/model.js";

/* useExtensionBridge — the Ligand side of the Chrome extension link.

   The extension deliberately does NOT write Ligand's storage itself. Its
   content script posts a request here and THIS page performs the write through
   the same store actions a click would use. One data model, one validation
   path, one sync path — the extension can never invent a malformed task or
   drift when a factory changes.

   Wire protocol (window.postMessage, same-origin only):
     page -> ext   { type: "ligand-ext-hello" }        "a listener is live"
     ext  -> page  { type: "ligand-ext-req", requestId, action, payload }
     page -> ext   { type: "ligand-ext-res", requestId, ok, result?, error? }
     page -> ext   { type: "ligand-ext-snapshot", snapshot }

   Inert when no extension is installed: nothing ever posts these messages, so
   the listener simply never fires. */

const REQ = "ligand-ext-req";
const RES = "ligand-ext-res";
const SNAPSHOT = "ligand-ext-snapshot";
const HELLO = "ligand-ext-hello";
const SESSION_KEY = "ligand.pomodoro.session";

// Tasks are the only content the extension can see, and only the fields it
// needs to render a picker. Nothing private is exposed: tasks the user marked
// assistantPrivate are withheld, exactly as they are from assistants.
function publicTasks(tasks = []) {
  return tasks
    .filter((t) => !t.assistantPrivate)
    .slice(-60)
    .map((t) => ({
      id: t.id,
      text: t.text,
      done: Boolean(t.done),
      tabGroup: t.tabGroup || null,
    }));
}

/* Goals, so the popup can file a new task under one — or make a new one —
   without switching to the app. Name and colour only; a goal's notes, targets
   and review history are none of the extension's business. */
/* Goals the popup may list, name and colour only.

   Two things are filtered out and both matter. Archived goals are ones the
   user believes they deleted, and they were reaching the popup because this
   tested a `goal.archived` field that nothing in the app has ever written —
   archiving sets status, so the filter passed everything. Recovery goals are
   private and have no business in a browser extension at all, the same rule
   the assistant connector applies. */
function publicGoals(goals = []) {
  return (goals || [])
    .filter((g) => g && isActiveGoal(g) && g.type !== GOAL_TYPES.RECOVERY)
    .slice(0, 40)
    .map((g) => ({ id: g.id, name: g.name, color: g.color || null }));
}

function readSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* The live accent, already flattened to sRGB by resolvedAccent (see
   lib/appIcon.js) so the extension's service worker can paint with it without
   needing to understand oklch. */
function readTheme() {
  try {
    return {
      accent: resolvedAccent(),
      mode: document.documentElement.dataset.theme || "light",
    };
  } catch {
    return { accent: null, mode: "light" };
  }
}

export function useExtensionBridge({
  tasks = [],
  goals = [],
  addTask,
  addGoal,
  addNote,
  addActivity,
  updateTask,
  // The app-level Pomodoro engine, so the popup can drive the timer without
  // the Pomodoro tab being open (it usually isn't).
  pomo = null,
  enabled = true,
} = {}) {
  // Latest values, so the (once-registered) message listener never closes over
  // a stale store.
  const ref = useRef({});
  ref.current = { tasks, goals, addTask, addGoal, addNote, addActivity, updateTask, pomo };

  const post = (message) => {
    try {
      window.postMessage(message, window.location.origin);
    } catch {
      /* postMessage can throw on exotic origins — never break the app for it */
    }
  };

  const snapshot = () => ({
    tasks: publicTasks(ref.current.tasks),
    goals: publicGoals(ref.current.goals),
    pomodoro: readSession(),
    // Lets the toolbar icon wear the same accent as the app.
    theme: readTheme(),
  });

  // ---- serve requests -------------------------------------------------
  useEffect(() => {
    if (!enabled) return undefined;

    const onMessage = (event) => {
      if (event.source !== window) return; // ignore iframes / other windows
      if (event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object" || msg.type !== REQ) return;

      const { requestId, action, payload } = msg;
      const reply = (ok, extra = {}) => {
        if (!requestId) return; // "ping" carries no id; it only wants the hello
        post({ type: RES, requestId, ok, ...extra });
      };

      try {
        const store = ref.current;
        switch (action) {
          case "ping":
            post({ type: HELLO });
            post({ type: SNAPSHOT, snapshot: snapshot() });
            reply(true);
            break;

          case "snapshot": {
            // Return it in the REPLY as well as broadcasting it: the broadcast
            // reaches the worker on its own schedule, so a caller that awaited
            // this could still read a stale cache immediately afterwards.
            const snap = snapshot();
            post({ type: SNAPSHOT, snapshot: snap });
            reply(true, { result: snap });
            break;
          }

          case "addTask": {
            const text = String(payload?.text || "").trim().slice(0, 300);
            if (!text) return reply(false, { error: "Empty task." });
            const label = ["Today", "Urgent", "General"].includes(payload?.label)
              ? payload.label
              : "Today";
            const saved = store.addTask?.({
              text,
              label,
              ...(payload?.goalId ? { goalId: String(payload.goalId) } : {}),
              ...(payload?.tabGroup ? { tabGroup: payload.tabGroup } : {}),
            });
            reply(true, { result: { id: saved?.id } });
            break;
          }

          /* Make something to work on, and hand this tab group to it — in one
             round trip.

             The popup could do this as create-then-link, but two trips means a
             window where the group is linked to nothing and a refresh can
             render the "before" state, which is exactly the flicker the picker
             already suffered from. Doing it here means the reply is only sent
             once everything is true.

             `goalName` creates the goal too, so "new goal, new task under it,
             linked to this group" is one action rather than a trip to the app. */
          case "createFor": {
            const text = String(payload?.text || "").trim().slice(0, 300);
            if (!text) return reply(false, { error: "Needs a name." });
            const group = payload?.tabGroup?.title
              ? {
                  title: String(payload.tabGroup.title).slice(0, 120),
                  color: String(payload.tabGroup.color || "grey").slice(0, 20),
                }
              : null;

            let goalId = payload?.goalId ? String(payload.goalId) : null;
            const goalName = String(payload?.goalName || "").trim().slice(0, 80);
            if (!goalId && goalName) {
              const madeGoal = store.addGoal?.({ name: goalName });
              goalId = madeGoal?.id || null;
              if (!goalId) return reply(false, { error: "Could not create the goal." });
            }

            // Whatever held this group loses it — a group belongs to one thing.
            if (group) {
              for (const t of store.tasks || []) {
                const owns =
                  t.tabGroup && t.tabGroup.title === group.title && t.tabGroup.color === group.color;
                if (owns) store.updateTask?.(t.id, { tabGroup: null });
              }
            }
            const saved = store.addTask?.({
              text,
              label: ["Today", "Urgent", "General"].includes(payload?.label) ? payload.label : "Today",
              ...(goalId ? { goalId } : {}),
              ...(group ? { tabGroup: group } : {}),
            });
            if (!saved?.id) return reply(false, { error: "Could not create the task." });
            setTimeout(() => post({ type: SNAPSHOT, snapshot: snapshot() }), 40);
            reply(true, { result: { id: saved.id, goalId } });
            break;
          }

          case "addNote": {
            const text = String(payload?.text || "").trim().slice(0, 5000);
            if (!text) return reply(false, { error: "Empty note." });
            const saved = store.addNote?.({ text });
            reply(true, { result: { id: saved?.id } });
            break;
          }

          case "addActivity": {
            const title = String(payload?.title || "").trim().slice(0, 120);
            if (!title) return reply(false, { error: "Empty activity." });
            const minutes = Number(payload?.durationMin);
            const saved = store.addActivity?.({
              title,
              category: String(payload?.category || "other").slice(0, 30),
              durationMin: Number.isFinite(minutes) ? Math.min(1440, Math.max(1, minutes)) : 30,
            });
            reply(true, { result: { id: saved?.id } });
            break;
          }

          // Link (or unlink) a Chrome tab group to a task. A group belongs to
          // at most one task, so linking it elsewhere clears the old owner.
          case "linkTabGroup": {
            const { taskId, tabGroup } = payload || {};
            const group = tabGroup?.title
              ? {
                  title: String(tabGroup.title).slice(0, 120),
                  color: String(tabGroup.color || "grey").slice(0, 20),
                }
              : null;
            if (!group) return reply(false, { error: "No group given." });
            for (const t of store.tasks || []) {
              const owns =
                t.tabGroup && t.tabGroup.title === group.title && t.tabGroup.color === group.color;
              if (owns && t.id !== taskId) store.updateTask?.(t.id, { tabGroup: null });
            }
            if (taskId) store.updateTask?.(taskId, { tabGroup: group });
            // Push the new state straight back. Without this the popup's own
            // follow-up read hits a cache written BEFORE the link landed, and
            // the picker visibly snaps back to the previous owner until the
            // next poll corrects it.
            setTimeout(() => post({ type: SNAPSHOT, snapshot: snapshot() }), 40);
            reply(true);
            break;
          }

          // Drive the timer from the popup. The engine is app-level, so this
          // works on any tab — the Pomodoro tab does not need to be open.
          case "pomodoro": {
            const timer = store.pomo;
            if (!timer) return reply(false, { error: "Timer unavailable." });
            const command = String(payload?.command || "");
            if (command === "start") timer.start?.();
            else if (command === "pause") timer.pause?.();
            else if (command === "skip") timer.skip?.();
            else if (command === "reset") timer.reset?.();
            else return reply(false, { error: "Unknown timer command." });
            // Push the new state straight back so the popup updates at once
            // (the periodic poll would otherwise take up to five seconds).
            setTimeout(() => post({ type: SNAPSHOT, snapshot: snapshot() }), 60);
            reply(true);
            break;
          }

          default:
            reply(false, { error: "Unknown action." });
        }
      } catch (err) {
        reply(false, { error: err?.message || "Failed." });
      }
    };

    window.addEventListener("message", onMessage);
    // Announce immediately: the content script may have loaded first and be
    // waiting, or may load later and send its own "ping".
    post({ type: HELLO });
    post({ type: SNAPSHOT, snapshot: snapshot() });
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // ---- push state changes --------------------------------------------
  // Tasks come from React; the Pomodoro session is written to localStorage
  // outside React, so it is polled cheaply (a string compare every 5s).
  useEffect(() => {
    if (!enabled) return undefined;
    post({ type: SNAPSHOT, snapshot: snapshot() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let last = window.localStorage.getItem(SESSION_KEY);
    const id = window.setInterval(() => {
      const now = window.localStorage.getItem(SESSION_KEY);
      if (now === last) return;
      last = now;
      post({ type: SNAPSHOT, snapshot: snapshot() });
    }, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

export default useExtensionBridge;
