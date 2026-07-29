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

function renderTasks() {
  const select = $("taskSelect");
  const tasks = (state.snapshot?.tasks || []).filter((t) => !t.done).slice(0, 40);
  select.innerHTML = '<option value="">Nothing linked</option>';
  for (const t of tasks) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.text.length > 46 ? t.text.slice(0, 45) + "…" : t.text;
    select.appendChild(opt);
  }
  // Preselect whichever task already claims this group (matched by the group's
  // human identity — Chrome's numeric group ids do not survive a restart).
  if (group) {
    const linked = tasks.find(
      (t) => t.tabGroup && t.tabGroup.title === group.title && t.tabGroup.color === group.color
    );
    if (linked) select.value = linked.id;
  }
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
  const res = await send({
    type: "popup:submit",
    action: "linkTabGroup",
    payload: { taskId, tabGroup: { title: group.title, color: group.color } },
  });
  if (!res?.ok) return hint("Could not link.");
  hint(taskId ? `Linked to "${group.title}"` : "Link removed", true);
  refresh();
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
$("openLigand").addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({ url: ["http://localhost/*", "https://*.vercel.app/*"] });
  if (tabs.length) chrome.tabs.update(tabs[0].id, { active: true });
  else chrome.tabs.create({ url: "http://localhost:5173/" });
  window.close();
});

setKind("task");
loadGroup();
refresh().then(syncFromPage); // paint from cache, then correct from the page
// Keep the countdown ticking, and re-pull periodically so a timer started or
// stopped inside Ligand shows up here while the popup is open.
setInterval(renderPomodoro, 1000);
setInterval(syncFromPage, 3000);
