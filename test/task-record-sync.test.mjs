import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareTaskRecordSyncForUser,
  queueTaskDelete,
  queueTaskUpsert,
  readTaskRecordSyncState,
  reconcileTaskRecords,
  TASK_DATA_KEY,
} from "../src/lib/taskRecordSync.js";

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

function row(overrides = {}) {
  return {
    id: "task-1",
    text: "Remote task",
    label: "Today",
    goal_id: "goal-1",
    term: "short",
    repeat: null,
    scheduled_for: null,
    done: false,
    completed_on: null,
    assistant_hidden: false,
    version: 1,
    created_at: "2026-07-14T00:00:00Z",
    updated_at: "2026-07-14T01:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

function rpcTask(record) {
  return {
    id: record.id,
    text: record.text,
    label: record.label,
    goalId: record.goal_id,
    term: record.term,
    repeat: record.repeat,
    scheduledFor: record.scheduled_for,
    done: record.done,
    completedOn: record.completed_on,
    assistantPrivate: record.assistant_hidden,
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    deleted: Boolean(record.deleted_at),
  };
}

function fakeClient(initialRows = []) {
  const records = new Map(initialRows.map((record) => [record.id, { ...record }]));
  const calls = [];
  return {
    calls,
    records,
    from(table) {
      assert.equal(table, "task_records");
      return {
        async select() {
          return { data: [...records.values()].map((record) => ({ ...record })), error: null };
        },
      };
    },
    async rpc(name, args) {
      assert.equal(name, "task_record_apply");
      calls.push(structuredClone(args));
      const existing = records.get(args.p_task.id);
      if (!existing) {
        if (args.p_delete) return { data: { status: "missing", taskId: args.p_task.id }, error: null };
        if (args.p_expected_version !== 0) {
          return { data: { status: "conflict", taskId: args.p_task.id }, error: null };
        }
        const created = row({
          id: args.p_task.id,
          text: args.p_task.text,
          label: args.p_task.label,
          goal_id: args.p_task.goalId,
          term: args.p_task.term,
          repeat: args.p_task.repeat,
          scheduled_for: args.p_task.scheduledFor,
          done: args.p_task.done,
          completed_on: args.p_task.completedOn,
          assistant_hidden: args.p_task.assistantPrivate,
          created_at: args.p_task.createdAt || "2026-07-14T00:00:00Z",
        });
        records.set(created.id, created);
        return { data: { status: "created", task: rpcTask(created) }, error: null };
      }
      if (existing.version !== args.p_expected_version) {
        return { data: { status: "conflict", task: rpcTask(existing) }, error: null };
      }
      const saved = {
        ...existing,
        ...(args.p_delete
          ? { deleted_at: "2026-07-14T03:00:00Z" }
          : {
              text: args.p_task.text,
              label: args.p_task.label,
              goal_id: args.p_task.goalId,
              term: args.p_task.term,
              repeat: args.p_task.repeat,
              scheduled_for: args.p_task.scheduledFor,
              done: args.p_task.done,
              completed_on: args.p_task.completedOn,
              assistant_hidden: args.p_task.assistantPrivate,
            }),
        version: existing.version + 1,
        updated_at: "2026-07-14T03:00:00Z",
      };
      records.set(saved.id, saved);
      return {
        data: { status: args.p_delete ? "deleted" : "updated", task: rpcTask(saved) },
        error: null,
      };
    },
  };
}

function storageWithTasks(tasks) {
  return new MemoryStorage({
    [TASK_DATA_KEY]: JSON.stringify({ goals: [], tasks, countUps: [] }),
  });
}

function readTasks(storage) {
  return JSON.parse(storage.getItem(TASK_DATA_KEY)).tasks;
}

test("an explicitly queued local edit updates the matching record version", async () => {
  const storage = storageWithTasks([{ ...rpcTask(row()), text: "Local edit" }]);
  prepareTaskRecordSyncForUser("user-1", storage);
  queueTaskUpsert("task-1", 1, storage);
  const client = fakeClient([row()]);

  const result = await reconcileTaskRecords({ client, storage, notify: () => {} });

  assert.equal(result.ok, true);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].p_expected_version, 1);
  assert.equal(readTasks(storage)[0].text, "Local edit");
  assert.equal(readTasks(storage)[0].version, 2);
  assert.deepEqual(readTaskRecordSyncState(storage).pending, {});
});

test("a stale queued edit cannot overwrite a newer authoritative record", async () => {
  const remote = row({ text: "Assistant update", version: 2 });
  const storage = storageWithTasks([{ ...rpcTask(row()), text: "Stale local edit" }]);
  prepareTaskRecordSyncForUser("user-1", storage);
  queueTaskUpsert("task-1", 1, storage);
  const client = fakeClient([remote]);
  let notified = [];

  const result = await reconcileTaskRecords({
    client,
    storage,
    notify: (conflicts) => {
      notified = conflicts;
    },
  });

  assert.equal(client.calls.length, 0);
  assert.equal(readTasks(storage)[0].text, "Assistant update");
  assert.equal(readTasks(storage)[0].version, 2);
  assert.deepEqual(notified, [{ taskId: "task-1", resolution: "remote-won" }]);
  assert.equal(result.conflicts.length, 1);
});

test("a stale blob omission restores a remote task instead of deleting it", async () => {
  const storage = storageWithTasks([]);
  prepareTaskRecordSyncForUser("user-1", storage);
  const client = fakeClient([row()]);

  const result = await reconcileTaskRecords({ client, storage, notify: () => {} });

  assert.equal(result.ok, true);
  assert.equal(client.calls.length, 0);
  assert.equal(readTasks(storage)[0].id, "task-1");
});

test("only an explicit queued deletion can soft-delete a task record", async () => {
  const storage = storageWithTasks([]);
  prepareTaskRecordSyncForUser("user-1", storage);
  queueTaskDelete("task-1", 1, storage);
  const client = fakeClient([row()]);

  const result = await reconcileTaskRecords({ client, storage, notify: () => {} });

  assert.equal(result.ok, true);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].p_delete, true);
  assert.deepEqual(readTasks(storage), []);
  assert.equal(client.records.get("task-1").version, 2);
  assert.ok(client.records.get("task-1").deleted_at);
});

test("a first-login local task is created with expected version zero", async () => {
  const local = {
    id: "new-task",
    text: "Import me",
    label: "General",
    done: false,
    version: 0,
    createdAt: "2026-07-14",
  };
  const storage = storageWithTasks([local]);
  prepareTaskRecordSyncForUser("user-1", storage);
  const client = fakeClient();

  const result = await reconcileTaskRecords({ client, storage, notify: () => {} });

  assert.equal(result.ok, true);
  assert.equal(client.calls[0].p_expected_version, 0);
  assert.equal(readTasks(storage)[0].version, 1);
});

test("sync control state is discarded when a different account signs in", () => {
  const storage = storageWithTasks([]);
  prepareTaskRecordSyncForUser("user-1", storage);
  queueTaskUpsert("task-1", 3, storage);

  const next = prepareTaskRecordSyncForUser("user-2", storage);

  assert.equal(next.ownerUserId, "user-2");
  assert.deepEqual(next.entries, {});
  assert.deepEqual(next.pending, {});
});

test("assistant privacy is synced as part of the authoritative task record", async () => {
  const storage = storageWithTasks([
    { ...rpcTask(row()), assistantPrivate: true },
  ]);
  prepareTaskRecordSyncForUser("user-1", storage);
  queueTaskUpsert("task-1", 1, storage);
  const client = fakeClient([row()]);

  const result = await reconcileTaskRecords({ client, storage, notify: () => {} });

  assert.equal(result.ok, true);
  assert.equal(client.calls[0].p_task.assistantPrivate, true);
  assert.equal(client.records.get("task-1").assistant_hidden, true);
  assert.equal(readTasks(storage)[0].assistantPrivate, true);
});
