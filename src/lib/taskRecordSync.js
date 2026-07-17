export const TASK_DATA_KEY = "ligand.data";
export const TASK_RECORD_SYNC_KEY = "ligand.taskRecordSync";

const TASK_RECORD_COLUMNS = [
  "id",
  "text",
  "label",
  "goal_id",
  "term",
  "repeat",
  "scheduled_for",
  "done",
  "completed_on",
  "assistant_hidden",
  "version",
  "created_at",
  "updated_at",
  "deleted_at",
].join(",");

function defaultStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

function readJson(storage, key, fallback) {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function cleanState(value) {
  return {
    ownerUserId: typeof value?.ownerUserId === "string" ? value.ownerUserId : null,
    entries: value?.entries && typeof value.entries === "object" ? value.entries : {},
    pending: value?.pending && typeof value.pending === "object" ? value.pending : {},
  };
}

export function readTaskRecordSyncState(storage = defaultStorage()) {
  return cleanState(readJson(storage, TASK_RECORD_SYNC_KEY, null));
}

export function resetTaskRecordSyncState(
  storage = defaultStorage(),
  ownerUserId = null
) {
  const next = { ownerUserId, entries: {}, pending: {} };
  writeJson(storage, TASK_RECORD_SYNC_KEY, next);
  return next;
}

// Guest changes are allowed to follow the user into their first account. A
// state already bound to a different account is never reused.
export function prepareTaskRecordSyncForUser(userId, storage = defaultStorage()) {
  const current = readTaskRecordSyncState(storage);
  if (current.ownerUserId === userId) return current;
  const next =
    current.ownerUserId === null && userId
      ? { ownerUserId: userId, entries: {}, pending: current.pending }
      : { ownerUserId: userId || null, entries: {}, pending: {} };
  writeJson(storage, TASK_RECORD_SYNC_KEY, next);
  return next;
}

function expectedVersionFor(state, taskId, suppliedVersion) {
  if (Number.isInteger(suppliedVersion) && suppliedVersion >= 0) return suppliedVersion;
  const known = state.entries?.[taskId]?.version;
  return Number.isInteger(known) && known >= 0 ? known : 0;
}

function queueTaskMutation(taskId, kind, suppliedVersion, storage = defaultStorage()) {
  if (!taskId || !storage) return;
  const state = readTaskRecordSyncState(storage);
  state.pending = {
    ...state.pending,
    [taskId]: {
      kind,
      expectedVersion: expectedVersionFor(state, taskId, suppliedVersion),
    },
  };
  writeJson(storage, TASK_RECORD_SYNC_KEY, state);
}

export function queueTaskUpsert(taskId, expectedVersion, storage = defaultStorage()) {
  queueTaskMutation(taskId, "upsert", expectedVersion, storage);
}

export function queueTaskDelete(taskId, expectedVersion, storage = defaultStorage()) {
  queueTaskMutation(taskId, "delete", expectedVersion, storage);
}

function nullableText(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeTask(task) {
  return {
    id: String(task?.id || ""),
    text: typeof task?.text === "string" ? task.text : "",
    label: nullableText(task?.label),
    goalId: nullableText(task?.goalId),
    term: nullableText(task?.term),
    repeat: task?.repeat && typeof task.repeat === "object" ? task.repeat : null,
    scheduledFor: nullableText(task?.scheduledFor),
    done: Boolean(task?.done),
    completedOn: nullableText(task?.completedOn),
    assistantPrivate: task?.assistantPrivate === true,
    version: Number.isInteger(task?.version) && task.version >= 0 ? task.version : 0,
    createdAt: nullableText(task?.createdAt),
    updatedAt: nullableText(task?.updatedAt),
  };
}

function rowToTask(row) {
  return {
    id: String(row?.id || ""),
    text: typeof row?.text === "string" ? row.text : "",
    label: nullableText(row?.label),
    goalId: nullableText(row?.goal_id),
    term: nullableText(row?.term),
    repeat: row?.repeat && typeof row.repeat === "object" ? row.repeat : null,
    scheduledFor: nullableText(row?.scheduled_for),
    done: Boolean(row?.done),
    completedOn: nullableText(row?.completed_on),
    assistantPrivate: row?.assistant_hidden === true,
    version: Number(row?.version) || 0,
    createdAt: nullableText(row?.created_at),
    updatedAt: nullableText(row?.updated_at),
    deleted: Boolean(row?.deleted_at),
  };
}

function rpcTaskToTask(task) {
  const normalized = normalizeTask(task);
  return { ...normalized, deleted: Boolean(task?.deleted) };
}

export function taskRecordFingerprint(task) {
  const value = normalizeTask(task);
  return JSON.stringify([
    value.text,
    value.label,
    value.goalId,
    value.term,
    value.repeat,
    value.scheduledFor,
    value.done,
    value.completedOn,
    value.assistantPrivate,
  ]);
}

function entryFor(task) {
  return {
    version: task.version,
    fingerprint: task.deleted ? null : taskRecordFingerprint(task),
    deleted: Boolean(task.deleted),
  };
}

function taskForRpc(task) {
  const value = normalizeTask(task);
  return {
    id: value.id,
    text: value.text,
    label: value.label,
    goalId: value.goalId,
    term: value.term,
    repeat: value.repeat,
    scheduledFor: value.scheduledFor,
    done: value.done,
    completedOn: value.completedOn,
    assistantPrivate: value.assistantPrivate,
    createdAt: value.createdAt,
  };
}

function defaultNotify(conflicts) {
  if (!conflicts.length || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ligand:tasksyncconflict", {
      detail: { taskIds: conflicts.map((item) => item.taskId) },
    })
  );
}

async function applyRecord(client, task, expectedVersion, remove) {
  const { data, error } = await client.rpc("task_record_apply", {
    p_task: taskForRpc(task),
    p_expected_version: expectedVersion,
    p_delete: remove,
  });
  if (error) return { ok: false, error };
  if (!data || typeof data.status !== "string") {
    return { ok: false, error: new Error("invalid task record response") };
  }
  return { ok: true, result: data };
}

/**
 * Reconcile the local task cache with versioned records. Only mutations queued
 * by Ligand actions are written. Everything else is treated as a cache and is
 * repaired from the authoritative records, which prevents stale blob hydration
 * from becoming an accidental edit or deletion.
 */
export async function reconcileTaskRecords({
  client = null,
  storage = defaultStorage(),
  notify = defaultNotify,
} = {}) {
  if (!client || !storage) return { ok: false, reason: "not-configured", conflicts: [] };

  const core = readJson(storage, TASK_DATA_KEY, null);
  if (!core || !Array.isArray(core.tasks)) {
    return { ok: false, reason: "missing-local-data", conflicts: [] };
  }

  const { data: rows, error } = await client.from("task_records").select(TASK_RECORD_COLUMNS);
  if (error || !Array.isArray(rows)) {
    return { ok: false, reason: "fetch-error", error, conflicts: [] };
  }

  const state = readTaskRecordSyncState(storage);
  const nextEntries = { ...state.entries };
  const nextPending = { ...state.pending };
  const localOrder = core.tasks.map((task) => task?.id).filter(Boolean);
  const localTasks = new Map(
    core.tasks.filter((task) => task?.id).map((task) => [task.id, normalizeTask(task)])
  );
  const remoteTasks = new Map(
    rows.map(rowToTask).filter((task) => task.id).map((task) => [task.id, task])
  );
  const conflicts = [];
  let syncError = null;

  const adopt = (task) => {
    if (!task?.id) return;
    if (task.deleted) localTasks.delete(task.id);
    else localTasks.set(task.id, normalizeTask(task));
    nextEntries[task.id] = entryFor(task);
  };

  for (const [taskId, pending] of Object.entries(state.pending)) {
    const local = localTasks.get(taskId);
    const remote = remoteTasks.get(taskId);
    const expectedVersion = Number(pending?.expectedVersion) || 0;

    if (pending?.kind === "delete") {
      if (!remote) {
        localTasks.delete(taskId);
        delete nextPending[taskId];
        delete nextEntries[taskId];
        continue;
      }
      if (remote.deleted) {
        adopt(remote);
        delete nextPending[taskId];
        continue;
      }
      if (remote.version !== expectedVersion) {
        adopt(remote);
        delete nextPending[taskId];
        conflicts.push({ taskId, resolution: "remote-won" });
        continue;
      }
      const applied = await applyRecord(client, local || remote, expectedVersion, true);
      if (!applied.ok) {
        syncError ||= applied.error;
        continue;
      }
      const returned = applied.result.task ? rpcTaskToTask(applied.result.task) : null;
      if (applied.result.status === "deleted" && returned) {
        remoteTasks.set(taskId, returned);
        adopt(returned);
        delete nextPending[taskId];
      } else if (applied.result.status === "conflict") {
        if (returned) {
          remoteTasks.set(taskId, returned);
          adopt(returned);
        }
        delete nextPending[taskId];
        conflicts.push({ taskId, resolution: "remote-won" });
      } else if (applied.result.status === "missing") {
        localTasks.delete(taskId);
        remoteTasks.delete(taskId);
        delete nextPending[taskId];
        delete nextEntries[taskId];
      } else {
        syncError ||= new Error("unexpected task deletion response");
      }
      continue;
    }

    if (pending?.kind !== "upsert" || !local) {
      delete nextPending[taskId];
      continue;
    }
    if (remote && (remote.deleted || remote.version !== expectedVersion)) {
      adopt(remote);
      delete nextPending[taskId];
      conflicts.push({ taskId, resolution: "remote-won" });
      continue;
    }
    if (!remote && expectedVersion !== 0) {
      localTasks.delete(taskId);
      delete nextPending[taskId];
      delete nextEntries[taskId];
      conflicts.push({ taskId, resolution: "remote-won" });
      continue;
    }

    const applied = await applyRecord(client, local, expectedVersion, false);
    if (!applied.ok) {
      syncError ||= applied.error;
      continue;
    }
    const returned = applied.result.task ? rpcTaskToTask(applied.result.task) : null;
    if (["created", "updated"].includes(applied.result.status) && returned) {
      remoteTasks.set(taskId, returned);
      adopt(returned);
      delete nextPending[taskId];
    } else if (applied.result.status === "conflict") {
      if (returned) {
        remoteTasks.set(taskId, returned);
        adopt(returned);
      }
      delete nextPending[taskId];
      conflicts.push({ taskId, resolution: "remote-won" });
    } else {
      syncError ||= new Error("unexpected task update response");
    }
  }

  // Non-pending records always win over the compatibility cache.
  for (const [taskId, remote] of remoteTasks) {
    if (nextPending[taskId]) continue;
    adopt(remote);
  }

  // A local record that has never existed remotely is a first-login import or
  // a newly-created offline task. Create it with expected version zero.
  for (const [taskId, local] of [...localTasks]) {
    if (remoteTasks.has(taskId) || nextPending[taskId] || nextEntries[taskId]) continue;
    const applied = await applyRecord(client, local, 0, false);
    if (!applied.ok) {
      syncError ||= applied.error;
      continue;
    }
    const returned = applied.result.task ? rpcTaskToTask(applied.result.task) : null;
    if (applied.result.status === "created" && returned) {
      remoteTasks.set(taskId, returned);
      adopt(returned);
    } else if (applied.result.status === "conflict" && returned) {
      remoteTasks.set(taskId, returned);
      adopt(returned);
      conflicts.push({ taskId, resolution: "remote-won" });
    } else {
      syncError ||= new Error("unexpected task import response");
    }
  }

  const orderedIds = [...localOrder, ...localTasks.keys()].filter(
    (id, index, all) => localTasks.has(id) && all.indexOf(id) === index
  );
  const nextTasks = orderedIds.map((id) => localTasks.get(id));
  const changed = JSON.stringify(core.tasks) !== JSON.stringify(nextTasks);
  if (changed) {
    writeJson(storage, TASK_DATA_KEY, { ...core, tasks: nextTasks });
    if (typeof window !== "undefined" && storage === window.localStorage) {
      window.dispatchEvent(new CustomEvent("ligand:hydrate"));
    }
  }

  writeJson(storage, TASK_RECORD_SYNC_KEY, {
    ownerUserId: state.ownerUserId,
    entries: nextEntries,
    pending: nextPending,
  });
  notify(conflicts);

  return {
    ok: !syncError,
    reason: syncError ? "apply-error" : undefined,
    error: syncError,
    changed,
    conflicts,
  };
}
