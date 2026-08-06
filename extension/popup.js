/* popup.js — the click-the-icon surface.

   Everything here is read-from-cache first so the popup paints instantly:
   the background worker keeps the last snapshot a Ligand page pushed. Writes
   go through the worker, which delivers them to an open Ligand tab or queues
   them until one appears. */

const $ = (id) => document.getElementById(id);

// Chrome's nine tab-group colors -> something we can actually paint.
const GROUP_COLORS = {
  grey: "#8a8f98", blue: "#4f7bd8", red: "#d85f57", yellow: "#d9a441",
  green: "#4fa06a", pink: "#d2609a", purple: "#8a6fd0", cyan: "#3fa3ad",
  orange: "#d98040",
};

let state = { snapshot: null, ligandOpen: false, queued: 0 };
let group = null; // { id, title, color, tabCount }
let activeTab = null;
let kind = "task";
/* The link the user just chose, held until the snapshot reports the same
   thing. null means "no pending choice — trust the data". */
let pendingLink = null;

const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);

// ---- Pomodoro ---------------------------------------------------------
const mmss = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

function renderPomodoro() {
  const p = state.snapshot?.pomodoro;
  // With no session at all there is nothing to show — but keep the strip
  // visible (with Start) whenever Ligand is open, so the popup can begin a
  // block without switching to the app.
  if (!p || (!p.running && p.remaining == null)) {
    $("pomo").hidden = !state.ligandOpen;
    if (state.ligandOpen) {
      $("pomoTime").textContent = "--:--";
      $("pomoPhase").textContent = "No block yet";
      $("pomoToggle").textContent = "Start";
    }
    return;
  }
  // A running block is stored as an absolute end time, so the countdown stays
  // correct here without the app being open. A paused one is a frozen number.
  const left = p.running && p.endTime
    ? Math.max(0, Math.round((p.endTime - Date.now()) / 1000))
    : Math.max(0, p.remaining || 0);
  if (p.running && left <= 0) {
    $("pomo").hidden = true;
    return;
  }
  $("pomo").hidden = false;
  $("pomoTime").textContent = mmss(left);
  const phase = p.phase === "short" ? "Short break" : p.phase === "long" ? "Long break" : "Focus";
  $("pomoPhase").textContent = p.running ? phase : `${phase} · paused`;
  $("pomoToggle").textContent = p.running ? "Pause" : "Resume";
}

/** Drive the timer through the bridge; Ligand's engine does the actual work. */
async function pomoCommand(command) {
  const res = await send({ type: "popup:submit", action: "pomodoro", payload: { command } });
  if (!res?.ok || res.queued) {
    hint("Open Ligand to use the timer.");
    return;
  }
  // The page pushes a fresh snapshot right after the command lands.
  setTimeout(refresh, 180);
}

// ---- tab group --------------------------------------------------------
async function loadGroup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  if (!tab || tab.groupId == null || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
    group = null;
  } else {
    try {
      const g = await chrome.tabGroups.get(tab.groupId);
      const tabs = await chrome.tabs.query({ groupId: tab.groupId });
      group = {
        id: g.id,
        title: g.title || "Untitled group",
        color: g.color,
        tabCount: tabs.length,
      };
    } catch {
      group = null;
    }
  }
  renderGroup();
}

function renderGroup() {
  const hint = $("groupHint");
  if (!group) {
    // Explain what to do rather than just showing a dead control: linking is
    // meaningless until the current tab actually belongs to a group.
    $("groupName").textContent = "No tab group";
    $("groupCount").textContent = "";
    $("groupSwatch").style.background = "var(--ink-4)";
    $("taskSelect").disabled = true;
    hint.hidden = false;
    hint.textContent =
      "Right-click this tab → “Add tab to group”, then reopen this popup to link it to a task.";
    return;
  }
  hint.hidden = true;
  $("taskSelect").disabled = false;
  $("groupName").textContent = group.title;
  $("groupCount").textContent = `${group.tabCount} tab${group.tabCount === 1 ? "" : "s"}`;
  $("groupSwatch").style.background = GROUP_COLORS[group.color] || "var(--ink-4)";
}

/* Which task the SNAPSHOT says owns this group. Matched on the group's human
   identity, because Chrome's numeric group ids don't survive a restart. */
function linkedTaskId(tasks) {
  if (!group) return "";
  const hit = (tasks || []).find(
    (t) => t.tabGroup && t.tabGroup.title === group.title && t.tabGroup.color === group.color
  );
  return hit ? hit.id : "";
}

function renderTasks() {
  const select = $("taskSelect");
  const tasks = (state.snapshot?.tasks || []).filter((t) => !t.done).slice(0, 40);

  /* Rebuild the options only when they actually changed.

     This re-runs every three seconds from the poll, and replacing innerHTML
     mid-interaction closes an open dropdown and drops the highlighted row —
     half of why picking a task felt like fighting the thing. */
  const signature = tasks.map((t) => t.id).join(",");
  if (select.dataset.sig !== signature) {
    select.dataset.sig = signature;
    select.innerHTML = '<option value="">Nothing linked</option>';
    for (const t of tasks) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.text.length > 46 ? t.text.slice(0, 45) + "…" : t.text;
      select.appendChild(opt);
    }
  }

  /* What to show.

     `pendingLink` is what the user just chose. It wins until the snapshot
     agrees, because the snapshot is written by another process and arrives a
     beat later — rendering it blindly is what made a fresh choice snap back to
     the previous owner and then flip forward again seconds later. Once the
     data catches up, the pending value has served its purpose and is dropped. */
  const fromData = linkedTaskId(tasks);
  if (pendingLink !== null && fromData === pendingLink) pendingLink = null;
  const show = pendingLink !== null ? pendingLink : fromData;
  // Never yank the value out from under an open dropdown.
  if (document.activeElement !== select && select.value !== show) select.value = show;
}

/* Goals for the "file it under" picker, rebuilt only when they change. */
function renderGoals() {
  const select = $("newGoal");
  const goals = state.snapshot?.goals || [];
  const signature = goals.map((g) => g.id).join(",");
  if (select.dataset.sig === signature) return;
  select.dataset.sig = signature;
  const keep = select.value;
  select.innerHTML = '<option value="">No goal</option>';
  for (const g of goals) {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.name.length > 34 ? g.name.slice(0, 33) + "…" : g.name;
    select.appendChild(opt);
  }
  const nu = document.createElement("option");
  nu.value = "__new";
  nu.textContent = "+ New goal…";
  select.appendChild(nu);
  if (keep) select.value = keep;
}

// ---- status / footer --------------------------------------------------
function renderStatus() {
  const el = $("status");
  if (state.ligandOpen) {
    el.textContent = "connected";
    el.classList.add("on");
  } else {
    el.textContent = state.queued ? `${state.queued} queued` : "Ligand closed";
    el.classList.remove("on");
  }
}

function hint(text, ok = false) {
  const el = $("hint");
  el.textContent = text;
  el.classList.toggle("ok", ok);
}

// ---- capture ----------------------------------------------------------
function setKind(next) {
  kind = next;
  document.querySelectorAll(".seg button").forEach((b) => {
    b.classList.toggle("active", b.dataset.kind === next);
  });
  // Each kind shows only its own fields — the category/duration pair belongs to
  // an activity log and made no sense sitting under Task.
  $("logRow").hidden = next !== "log";
  $("taskRow").hidden = next !== "task";
  $("text").placeholder =
    next === "task" ? "Add a task…" : next === "note" ? "Jot a note…" : "What did you just do?";
  $("text").focus();
}

async function submitCapture() {
  const text = $("text").value.trim();
  if (!text) return;
  $("submit").disabled = true;

  let action = "addTask";
  let payload = { text };
  if (kind === "note") {
    action = "addNote";
  } else if (kind === "log") {
    action = "addActivity";
    payload = {
      title: text,
      category: $("logCategory").value,
      durationMin: Number($("logMinutes").value),
    };
  } else {
    payload.label = $("taskLabel").value;
    // A task captured while inside a group starts life linked to it.
    if (group) payload.tabGroup = { title: group.title, color: group.color };
  }

  const res = await send({ type: "popup:submit", action, payload });
  $("submit").disabled = false;
  if (!res?.ok) {
    hint("Could not save. Is Ligand installed?");
    return;
  }
  $("text").value = "";
  hint(res.queued ? "Saved — syncs when Ligand opens" : "Saved to Ligand", true);
  refresh();
}

async function linkGroupToTask(taskId) {
  if (!group) return;
  // Hold the choice on screen from this instant. The write is a round trip
  // through the page and back; without this the next render (which can happen
  // in between) paints the OLD owner and the picker appears to undo itself.
  pendingLink = taskId || "";
  const res = await send({
    type: "popup:submit",
    action: "linkTabGroup",
    payload: { taskId, tabGroup: { title: group.title, color: group.color } },
  });
  if (!res?.ok) {
    pendingLink = null; // the write failed — go back to whatever is true
    return hint("Could not link.");
  }
  if (res.queued) {
    hint("Saved — links when Ligand opens", true);
    return;
  }
  hint(taskId ? `Linked to "${group.title}"` : "Link removed", true);
  // Pull from the PAGE, not the worker's cache: the cache is written by the
  // page's own broadcast and may not have arrived yet.
  syncFromPage();
}

/* Make something new and hand this group to it, in one action. */
async function createAndLink() {
  const text = $("newText").value.trim();
  if (!text) {
    $("newText").focus();
    return;
  }
  const goalChoice = $("newGoal").value;
  const goalName = goalChoice === "__new" ? $("newGoalName").value.trim() : "";
  if (goalChoice === "__new" && !goalName) {
    $("newGoalName").focus();
    return;
  }
  $("newCreate").disabled = true;
  const res = await send({
    type: "popup:submit",
    action: "createFor",
    payload: {
      text,
      label: $("taskLabel").value,
      goalId: goalChoice && goalChoice !== "__new" ? goalChoice : null,
      goalName,
      ...(group ? { tabGroup: { title: group.title, color: group.color } } : {}),
    },
  });
  $("newCreate").disabled = false;

  if (!res?.ok) return hint(res?.error || "Could not create it.");
  if (res.queued) {
    // createFor needs the page (it makes a goal AND a task and links them), so
    // say plainly that it's waiting rather than pretending it worked.
    hint("Open Ligand to create this.");
    return;
  }
  // Show it as selected straight away — the snapshot is a beat behind.
  if (res.result?.id) pendingLink = res.result.id;
  closeNewRow();
  hint(group ? `Created and linked to "${group.title}"` : "Created", true);
  syncFromPage();
}

function openNewRow() {
  $("newRow").hidden = false;
  $("newToggle").hidden = true;
  // Seed it with the page title — usually what you're working on.
  if (!$("newText").value && activeTab?.title) {
    $("newText").value = activeTab.title.slice(0, 80);
  }
  $("newText").focus();
  $("newText").select();
}

function closeNewRow() {
  $("newRow").hidden = true;
  $("newToggle").hidden = false;
  $("newText").value = "";
  $("newGoalName").value = "";
  $("newGoal").value = "";
  $("newGoalName").hidden = true;
}

// ---- boot -------------------------------------------------------------
function applyTheme() {
  const mode = state.snapshot?.theme?.mode;
  if (mode === "dark" || mode === "light") {
    document.documentElement.dataset.theme = mode;
  }
}

async function refresh() {
  const res = await send({ type: "popup:state" });
  if (res?.ok) {
    state = { snapshot: res.snapshot, ligandOpen: res.ligandOpen, queued: res.queued };
  }
  applyTheme();
  renderStatus();
  renderPomodoro();
  renderTasks();
  renderGoals();
}

/* Pull a genuinely fresh snapshot from the page, then re-render.
   The cached one can be up to a few seconds stale, which is why a Pomodoro
   started in the app didn't show here until the poll caught up. */
async function syncFromPage() {
  await send({ type: "popup:refresh" });
  await refresh();
}

document.querySelectorAll(".seg button").forEach((b) => {
  b.addEventListener("click", () => setKind(b.dataset.kind));
});
$("submit").addEventListener("click", submitCapture);
$("text").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitCapture();
});
$("taskSelect").addEventListener("change", (e) => linkGroupToTask(e.target.value));
$("newToggle").addEventListener("click", openNewRow);
$("newCancel").addEventListener("click", closeNewRow);
$("newCreate").addEventListener("click", createAndLink);
$("newGoal").addEventListener("change", (e) => {
  const isNew = e.target.value === "__new";
  $("newGoalName").hidden = !isNew;
  if (isNew) $("newGoalName").focus();
});
for (const id of ["newText", "newGoalName"]) {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") createAndLink();
    if (e.key === "Escape") closeNewRow();
  });
}
$("pomoToggle").addEventListener("click", () => {
  const running = state.snapshot?.pomodoro?.running;
  pomoCommand(running ? "pause" : "start");
});
$("pomoSkip").addEventListener("click", () => pomoCommand("skip"));
$("usePage").addEventListener("click", () => {
  if (activeTab?.title) {
    $("text").value = activeTab.title;
    $("text").focus();
  }
});
// Where Ligand actually lives. An already-open tab always wins — including a
// dev server — but opening a NEW one goes to the deployed app, which is what
// "Open Ligand" means to anyone who isn't running Vite at the time.
const LIGAND_URL = "https://ligand-eta.vercel.app/";

$("openLigand").addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({ url: ["http://localhost/*", "https://*.vercel.app/*"] });
  if (tabs.length) chrome.tabs.update(tabs[0].id, { active: true });
  else chrome.tabs.create({ url: LIGAND_URL });
  window.close();
});

setKind("task");
loadGroup();
refresh().then(syncFromPage); // paint from cache, then correct from the page
// Keep the countdown ticking, and re-pull periodically so a timer started or
// stopped inside Ligand shows up here while the popup is open.
setInterval(renderPomodoro, 1000);
setInterval(syncFromPage, 3000);
