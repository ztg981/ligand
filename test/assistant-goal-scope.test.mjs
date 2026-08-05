/* Connector contract tests: what the ChatGPT connector returns must track
   what actually exists in Ligand.

   The reported bug was goals and tasks the user had deleted months earlier
   still coming back from get_shared_goals and get_tasks. These run the real
   migrations in an in-process PostgreSQL (pglite) and walk the whole lifecycle
   the user cares about: share it, read it, rename it, then archive / delete /
   unshare it and prove it is gone.

   Recovery data gets its own test here rather than being assumed safe. */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = [
  "202607140001_chatgpt_read_only_foundation.sql",
  "202607140002_task_records_foundation.sql",
  "202607140003_assistant_task_writes.sql",
  "202607140004_assistant_task_projection_fix.sql",
  "202607140005_confirmation_first_assistant_actions.sql",
  "202607150001_plus_approval_links.sql",
  "202607160001_assistant_experience.sql",
  "202608050001_assistant_active_goal_scope.sql",
].map((name) => fs.readFileSync(`supabase/migrations/${name}`, "utf8"));

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
const RESOURCE = "https://ligand.example/mcp";
const CLIENT_ID = "chatgpt-scope-client";

const bootstrap = `
  create role anon nologin;
  create role authenticated nologin;
  create role supabase_auth_admin nologin;

  create schema auth;
  create table auth.users (id uuid primary key);

  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create or replace function auth.jwt()
  returns jsonb
  language sql
  stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb,
      '{}'::jsonb
    )
  $$;

  grant usage on schema auth to authenticated, supabase_auth_admin;
  grant execute on function auth.uid() to authenticated, supabase_auth_admin;
  grant execute on function auth.jwt() to authenticated, supabase_auth_admin;

  create table public.user_data (
    user_id uuid primary key references auth.users (id) on delete cascade,
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
  );
  alter table public.user_data enable row level security;
  grant select, insert, update, delete on table public.user_data to authenticated;

  create or replace function public.user_data_touch_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
  as $$
  begin
    new.updated_at = now();
    return new;
  end;
  $$;
`;

function oauthClaims() {
  return JSON.stringify({
    sub: USER_ID,
    role: "authenticated",
    client_id: CLIENT_ID,
    aud: RESOURCE,
    resource: RESOURCE,
    scope: "openid",
    ligand_mcp: true,
  });
}

const ownerClaims = JSON.stringify({ sub: USER_ID, role: "authenticated" });

/* The blob as Ligand stores it: goals live inside data->'ligand.data'->'goals',
   and archiving a goal only flips its status field. */
function blob(goals) {
  return JSON.stringify({
    "ligand.data": {
      goals,
      journal: [{ text: "never leaves the database" }],
      notes: [{ text: "also never leaves" }],
    },
  });
}

const GOALS = [
  { id: "bulk-up", name: "Bulk up", type: "fitness", status: "active" },
  { id: "research", name: "Research", type: "custom", status: "active" },
  // No status key at all — written before the field existed. Must read active.
  { id: "legacy", name: "College planning", type: "custom" },
  { id: "recovery", name: "Recovery tracker", type: "recovery", status: "active" },
];

async function seed(db, { allowedGoalIds = ["bulk-up", "research", "legacy", "recovery"] } = {}) {
  await db.exec(bootstrap);
  for (const migration of MIGRATIONS) await db.exec(migration);

  await db.query("insert into auth.users (id) values ($1)", [USER_ID]);
  await db.query("insert into public.user_data (user_id, data) values ($1, $2::jsonb)", [
    USER_ID,
    blob(GOALS),
  ]);
  await db.query(
    `insert into public.assistant_oauth_clients
       (client_id, resource_url, allowed_user_id, enabled)
     values ($1, $2, $3, true)`,
    [CLIENT_ID, RESOURCE, USER_ID]
  );
  await db.query(
    `insert into public.assistant_access
       (user_id, enabled, tasks_read, allow_unassigned_tasks, allowed_goal_ids)
     values ($1, true, true, false, $2)`,
    [USER_ID, allowedGoalIds]
  );
  await db.exec("set role authenticated");
}

/** Read as the connector does (OAuth claims present). */
async function asConnector(db, sql) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [USER_ID]);
  await db.query("select set_config('request.jwt.claims', $1, false)", [oauthClaims()]);
  const result = await db.query(sql);
  return result.rows[0].result;
}

/** Write as Ligand itself does (ordinary session, no client_id). */
async function asOwner(db, sql, params = []) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [ownerClaims]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [USER_ID]);
  return db.query(sql, params);
}

/* Some statements are deliberately out of reach of the `authenticated` role:
   task_records only grants SELECT (every mutation must go through
   task_record_apply), and assistant_task_in_scope is an internal helper
   revoked from everyone. Seeding and probing them is a test concern, so drop
   to the migration owner for exactly those statements. */
async function asAdmin(db, sql, params = []) {
  await db.exec("reset role");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("set role authenticated");
  }
}

async function sharedGoalNames(db) {
  const result = await asConnector(db, "select public.assistant_get_shared_goals() as result");
  return result.goals.map((goal) => goal.name);
}

async function taskIds(db, focus = "all", status = "all") {
  const result = await asConnector(
    db,
    `select public.assistant_get_tasks('${focus}', '${status}', 50, 'scope-test') as result`
  );
  return result.tasks.map((task) => task.id);
}

test("a shared goal is readable, follows a rename, and disappears once archived", async () => {
  const db = new PGlite();
  try {
    await seed(db);

    // 1 + 2. Shared goals are readable. Recovery is excluded at the source.
    assert.deepEqual(await sharedGoalNames(db), ["Bulk up", "College planning", "Research"]);

    // 3 + 4. A rename in Ligand shows up on the next read — there is no
    // snapshot in between.
    await asOwner(db, "update public.user_data set data = $1::jsonb where user_id = $2", [
      blob(GOALS.map((goal) => (goal.id === "research" ? { ...goal, name: "Research Paper" } : goal))),
      USER_ID,
    ]);
    assert.deepEqual(await sharedGoalNames(db), ["Bulk up", "College planning", "Research Paper"]);

    // 5 + 6. Archiving is what Ligand's delete button does. The goal must
    // leave the connector's active results.
    await asOwner(db, "update public.user_data set data = $1::jsonb where user_id = $2", [
      blob(GOALS.map((goal) => (goal.id === "research" ? { ...goal, status: "archived" } : goal))),
      USER_ID,
    ]);
    assert.deepEqual(await sharedGoalNames(db), ["Bulk up", "College planning"]);
  } finally {
    await db.close();
  }
});

test("permanently deleting a goal removes it from connector results", async () => {
  const db = new PGlite();
  try {
    await seed(db);
    await asOwner(db, "update public.user_data set data = $1::jsonb where user_id = $2", [
      blob(GOALS.filter((goal) => goal.id !== "legacy")),
      USER_ID,
    ]);
    assert.deepEqual(await sharedGoalNames(db), ["Bulk up", "Research"]);
  } finally {
    await db.close();
  }
});

test("a goal completed rather than archived stays in scope", async () => {
  const db = new PGlite();
  try {
    await seed(db);
    await asOwner(db, "update public.user_data set data = $1::jsonb where user_id = $2", [
      blob(GOALS.map((goal) => (goal.id === "research" ? { ...goal, status: "done" } : goal))),
      USER_ID,
    ]);
    assert.ok((await sharedGoalNames(db)).includes("Research"));
  } finally {
    await db.close();
  }
});

test("unsharing a goal revokes connector access to it", async () => {
  const db = new PGlite();
  try {
    await seed(db);
    await asOwner(
      db,
      "update public.assistant_access set allowed_goal_ids = $1 where user_id = $2",
      [["bulk-up"], USER_ID]
    );
    assert.deepEqual(await sharedGoalNames(db), ["Bulk up"]);
  } finally {
    await db.close();
  }
});

test("archiving a goal prunes the stored share grant, not just the read", async () => {
  const db = new PGlite();
  try {
    await seed(db);
    await asOwner(db, "update public.user_data set data = $1::jsonb where user_id = $2", [
      blob(GOALS.map((goal) => (goal.id === "research" ? { ...goal, status: "archived" } : goal))),
      USER_ID,
    ]);
    const grant = await asOwner(
      db,
      "select allowed_goal_ids from public.assistant_access where user_id = $1",
      [USER_ID]
    );
    assert.equal(grant.rows[0].allowed_goal_ids.includes("research"), false);
    assert.ok(grant.rows[0].allowed_goal_ids.includes("bulk-up"));
  } finally {
    await db.close();
  }
});

test("tasks follow their goal out of scope when it is archived or deleted", async () => {
  const db = new PGlite();
  try {
    await seed(db);
    await asAdmin(
      db,
      `insert into public.task_records (user_id, id, text, label, goal_id, done)
       values ($1, 'task-bulk', 'Squat session', 'Today', 'bulk-up', false),
              ($1, 'task-research', 'Read paper', 'Today', 'research', false),
              ($1, 'task-recovery', 'Private step', 'Today', 'recovery', false)`,
      [USER_ID]
    );

    // Recovery-goal tasks never appear, even though the id was granted.
    assert.deepEqual((await taskIds(db)).sort(), ["task-bulk", "task-research"]);

    await asOwner(db, "update public.user_data set data = $1::jsonb where user_id = $2", [
      blob(GOALS.map((goal) => (goal.id === "research" ? { ...goal, status: "archived" } : goal))),
      USER_ID,
    ]);
    assert.deepEqual(await taskIds(db), ["task-bulk"]);
  } finally {
    await db.close();
  }
});

test("a deleted task stops being returned", async () => {
  const db = new PGlite();
  try {
    await seed(db);
    await asAdmin(
      db,
      `insert into public.task_records (user_id, id, text, label, goal_id, done)
       values ($1, 'task-bulk', 'Squat session', 'Today', 'bulk-up', false)`,
      [USER_ID]
    );
    assert.deepEqual(await taskIds(db), ["task-bulk"]);

    await asAdmin(
      db,
      "update public.task_records set deleted_at = now() where user_id = $1 and id = 'task-bulk'",
      [USER_ID]
    );
    assert.deepEqual(await taskIds(db), []);
  } finally {
    await db.close();
  }
});

test("completing a task is reflected in the connector's status filter", async () => {
  const db = new PGlite();
  try {
    await seed(db);
    await asAdmin(
      db,
      `insert into public.task_records (user_id, id, text, label, goal_id, done)
       values ($1, 'task-bulk', 'Squat session', 'Today', 'bulk-up', false)`,
      [USER_ID]
    );
    assert.deepEqual(await taskIds(db, "all", "open"), ["task-bulk"]);
    assert.deepEqual(await taskIds(db, "all", "completed"), []);

    await asAdmin(
      db,
      `update public.task_records set done = true, completed_on = current_date
        where user_id = $1 and id = 'task-bulk'`,
      [USER_ID]
    );
    assert.deepEqual(await taskIds(db, "all", "open"), []);
    assert.deepEqual(await taskIds(db, "all", "completed"), ["task-bulk"]);
  } finally {
    await db.close();
  }
});

test("recovery, journal and note content never crosses the connector boundary", async () => {
  const db = new PGlite();
  try {
    await seed(db);
    await asAdmin(
      db,
      `insert into public.task_records (user_id, id, text, label, goal_id, done)
       values ($1, 'task-recovery', 'Private step', 'Today', 'recovery', false)`,
      [USER_ID]
    );

    const goals = await asConnector(db, "select public.assistant_get_shared_goals() as result");
    const tasks = await asConnector(
      db,
      "select public.assistant_get_tasks('all', 'all', 50, 'privacy') as result"
    );
    const payload = JSON.stringify({ goals, tasks });

    assert.doesNotMatch(payload, /Recovery tracker/);
    assert.doesNotMatch(payload, /Private step/);
    assert.doesNotMatch(payload, /never leaves/);
    assert.equal(tasks.count, 0);
  } finally {
    await db.close();
  }
});

test("ChatGPT cannot file a new task into an archived goal", async () => {
  const db = new PGlite();
  try {
    await seed(db);
    const inScope = async (goalId) => {
      const result = await asAdmin(
        db,
        `select public.assistant_task_in_scope($1, $2, array['bulk-up','research'], false) as ok`,
        [USER_ID, goalId]
      );
      return result.rows[0].ok;
    };

    assert.equal(await inScope("research"), true);
    await asOwner(db, "update public.user_data set data = $1::jsonb where user_id = $2", [
      blob(GOALS.map((goal) => (goal.id === "research" ? { ...goal, status: "archived" } : goal))),
      USER_ID,
    ]);
    assert.equal(await inScope("research"), false);
    assert.equal(await inScope("bulk-up"), true);
  } finally {
    await db.close();
  }
});

test("milestones, rewards and count-up history never cross the connector boundary", async () => {
  const db = new PGlite();
  try {
    await seed(db);
    // A goal carrying everything the milestone/count-up features add. These
    // are personal by nature — a reward budget especially — and no sharing
    // feature has been built for them, so none of it may leave.
    await asOwner(db, "update public.user_data set data = $1::jsonb where user_id = $2", [
      blob(
        GOALS.map((goal) =>
          goal.id === "research"
            ? {
                ...goal,
                progressMode: "countUp",
                countUp: { metricId: "m1", name: "Papers read", start: 0, target: 15 },
                countUpEvents: [
                  { id: "e1", delta: 1, value: 1, note: "secret private note", at: "2026-08-05" },
                ],
                milestonesEnabled: true,
                milestones: [
                  {
                    id: "ms1",
                    title: "Reach 15 papers",
                    description: "confidential milestone detail",
                    trigger: { type: "countUpThreshold", config: { target: 15 } },
                    reward: {
                      title: "Buy a pair of shoes",
                      description: "reward detail",
                      budget: 100,
                      currency: "USD",
                    },
                  },
                ],
              }
            : goal
        )
      ),
      USER_ID,
    ]);

    const goals = await asConnector(db, "select public.assistant_get_shared_goals() as result");
    const tasks = await asConnector(
      db,
      "select public.assistant_get_tasks('all', 'all', 50, 'privacy-milestones') as result"
    );
    const payload = JSON.stringify({ goals, tasks });

    // The goal itself is still shared — only id and name are projected.
    assert.ok(payload.includes("Research"));
    for (const secret of [
      "milestone",
      "Milestones",
      "reward",
      "Reward",
      "shoes",
      "confidential",
      "secret private note",
      "countUp",
      "Papers read",
      "budget",
      "100",
    ]) {
      assert.equal(
        payload.includes(secret),
        false,
        `connector payload leaked ${JSON.stringify(secret)}`
      );
    }
    assert.deepEqual(Object.keys(goals.goals[0]).sort(), ["id", "name"]);
  } finally {
    await db.close();
  }
});
