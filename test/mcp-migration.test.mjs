import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = fs.readFileSync(
  "supabase/migrations/202607140001_chatgpt_read_only_foundation.sql",
  "utf8"
);
const taskMigration = fs.readFileSync(
  "supabase/migrations/202607140002_task_records_foundation.sql",
  "utf8"
);
const writeMigration = fs.readFileSync(
  "supabase/migrations/202607140003_assistant_task_writes.sql",
  "utf8"
);
const projectionFixMigration = fs.readFileSync(
  "supabase/migrations/202607140004_assistant_task_projection_fix.sql",
  "utf8"
);
const confirmationActionsMigration = fs.readFileSync(
  "supabase/migrations/202607140005_confirmation_first_assistant_actions.sql",
  "utf8"
);
const plusApprovalMigration = fs.readFileSync(
  "supabase/migrations/202607150001_plus_approval_links.sql",
  "utf8"
);
const assistantExperienceMigration = fs.readFileSync(
  "supabase/migrations/202607160001_assistant_experience.sql",
  "utf8"
);

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
const OTHER_USER_ID = "00000000-0000-4000-8000-0000000000b2";
const RESOURCE = "https://ligand.example/mcp";
const CLIENT_ID = "chatgpt-pglite-client";

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

function oauthClaims(overrides = {}) {
  return JSON.stringify({
    sub: USER_ID,
    role: "authenticated",
    client_id: CLIENT_ID,
    aud: RESOURCE,
    resource: RESOURCE,
    scope: "openid",
    ligand_mcp: true,
    ...overrides,
  });
}

test("assistant migration executes and enforces its database boundary in PostgreSQL", async () => {
  const db = new PGlite();
  try {
    await db.exec(bootstrap);
    await db.exec(migration);

    await db.query("insert into auth.users (id) values ($1), ($2)", [USER_ID, OTHER_USER_ID]);
    await db.query(
      `insert into public.user_data (user_id, data)
       values ($1, $2::jsonb)`,
      [
        USER_ID,
        JSON.stringify({
          marker: "raw-document",
          "ligand.data": {
            goals: [
              { id: "shared", name: "School", type: "custom" },
              { id: "private", name: "Private", type: "custom" },
              {
                id: "recovery",
                name: "Sensitive recovery",
                type: "recovery",
                recoveryData: { why: "never expose" },
              },
            ],
            tasks: [
              {
                id: "task-shared",
                text: "Submit assignment",
                label: "Today",
                goalId: "shared",
                done: false,
                createdAt: "2026-07-14",
              },
              {
                id: "task-private",
                text: "Private task",
                label: "Today",
                goalId: "private",
                done: false,
              },
              {
                id: "task-recovery",
                text: "Sensitive task",
                label: "Today",
                goalId: "recovery",
                done: false,
              },
            ],
            journal: [{ text: "never expose" }],
          },
        }),
      ]
    );
    await db.exec(taskMigration);
    await db.exec(writeMigration);
    await db.exec(projectionFixMigration);
    await db.exec(confirmationActionsMigration);
    await db.exec(plusApprovalMigration);
    await db.exec(assistantExperienceMigration);
    await db.query(
      `insert into public.assistant_oauth_clients
         (client_id, resource_url, allowed_user_id, enabled)
       values ($1, $2, $3, true)`,
      [CLIENT_ID, RESOURCE, USER_ID]
    );
    await db.query(
      `insert into public.assistant_access
         (user_id, enabled, tasks_read, allowed_goal_ids)
       values ($1, true, true, array['shared', 'recovery'])`,
      [USER_ID]
    );

    const hook = await db.query(
      `select public.ligand_custom_access_token_hook($1::jsonb) as event`,
      [
        JSON.stringify({
          user_id: USER_ID,
          claims: { sub: USER_ID, client_id: CLIENT_ID },
        }),
      ]
    );
    assert.equal(hook.rows[0].event.claims.aud, RESOURCE);
    assert.equal(hook.rows[0].event.claims.ligand_mcp, true);

    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [USER_ID]);
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: USER_ID, role: "authenticated" }),
    ]);
    const directRows = await db.query("select data ->> 'marker' as marker from public.user_data");
    assert.deepEqual(directRows.rows, [{ marker: "raw-document" }]);

    await db.query("select set_config('request.jwt.claims', $1, false)", [oauthClaims()]);
    const rawOAuthRows = await db.query("select user_id from public.user_data");
    assert.equal(rawOAuthRows.rows.length, 0);

    const taskResult = await db.query(
      "select public.assistant_get_tasks('today', 'open', 50, 'pglite-request') as result"
    );
    const result = taskResult.rows[0].result;
    assert.equal(result.count, 1);
    assert.equal(result.tasks[0].id, "task-shared");
    assert.equal(JSON.stringify(result).includes("Private task"), false);
    assert.equal(JSON.stringify(result).includes("Sensitive task"), false);
    assert.equal(JSON.stringify(result).includes("journal"), false);
    assert.equal(result.tasks[0].version, 1);
    assert.equal("deleted" in result.tasks[0], false);

    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: USER_ID, role: "authenticated" }),
    ]);
    const updated = await db.query(
      `select public.task_record_apply(
         $1::jsonb,
         1,
         false
       ) as result`,
      [
        JSON.stringify({
          id: "task-shared",
          text: "Submit assignment revised",
          label: "Today",
          goalId: "shared",
          term: "short",
          scheduledFor: "2026-07-15",
          done: false,
          createdAt: "2026-07-14",
        }),
      ]
    );
    assert.equal(updated.rows[0].result.status, "updated");
    assert.equal(updated.rows[0].result.task.version, 2);
    assert.equal(updated.rows[0].result.task.scheduledFor, "2026-07-15");

    const conflict = await db.query(
      `select public.task_record_apply(
         $1::jsonb,
         1,
         false
       ) as result`,
      [
        JSON.stringify({
          id: "task-shared",
          text: "Stale overwrite",
          label: "Today",
          goalId: "shared",
          term: "short",
          done: false,
          createdAt: "2026-07-14",
        }),
      ]
    );
    assert.equal(conflict.rows[0].result.status, "conflict");
    assert.equal(conflict.rows[0].result.task.text, "Submit assignment revised");
    assert.equal(conflict.rows[0].result.task.version, 2);

    await assert.rejects(
      db.query(
        `select public.task_record_apply(
          $1::jsonb, null, false
        )`,
        [JSON.stringify({ id: "task-shared", text: "Null-version overwrite" })]
      ),
      /invalid expected version/
    );

    await db.query("select set_config('request.jwt.claims', $1, false)", [oauthClaims()]);
    await assert.rejects(
      db.query(
        `select public.assistant_add_task(
          'Write outline', 'shared', 'Today', 'short', '2026-07-16',
          'add-disabled-001', 'write-disabled'
        )`
      ),
      /assistant task access is disabled/
    );

    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: USER_ID, role: "authenticated" }),
    ]);
    await db.query(
      "update public.assistant_access set tasks_write = true where user_id = $1",
      [USER_ID]
    );
    await db.query("select set_config('request.jwt.claims', $1, false)", [oauthClaims()]);

    const added = await db.query(
      `select public.assistant_add_task(
        'Write outline', 'shared', 'Today', 'short', '2026-07-16',
        'add-task-0001', 'write-add'
      ) as result`
    );
    assert.equal(added.rows[0].result.status, "created");
    assert.equal(added.rows[0].result.task.version, 1);
    const addedTaskId = added.rows[0].result.task.id;

    const replayedAdd = await db.query(
      `select public.assistant_add_task(
        'Write outline', 'shared', 'Today', 'short', '2026-07-16',
        'add-task-0001', 'write-add-retry'
      ) as result`
    );
    assert.equal(replayedAdd.rows[0].result.status, "replayed");
    assert.equal(replayedAdd.rows[0].result.task.id, addedTaskId);

    const completed = await db.query(
      `select public.assistant_complete_task(
        $1, 1, 'complete-0001', 'write-complete'
      ) as result`,
      [addedTaskId]
    );
    assert.equal(completed.rows[0].result.status, "completed");
    assert.equal(completed.rows[0].result.task.done, true);
    assert.equal(completed.rows[0].result.task.version, 2);

    const staleSchedule = await db.query(
      `select public.assistant_reschedule_task(
        $1, 1, '2026-07-20', 'schedule-stale-0001', 'write-conflict'
      ) as result`,
      [addedTaskId]
    );
    assert.equal(staleSchedule.rows[0].result.status, "conflict");
    assert.equal(staleSchedule.rows[0].result.task.version, 2);
    assert.equal(staleSchedule.rows[0].result.task.scheduledFor, "2026-07-16");

    const rescheduled = await db.query(
      `select public.assistant_reschedule_task(
        $1, 2, '2026-07-20', 'schedule-good-0001', 'write-reschedule'
      ) as result`,
      [addedTaskId]
    );
    assert.equal(rescheduled.rows[0].result.status, "rescheduled");
    assert.equal(rescheduled.rows[0].result.task.version, 3);
    assert.equal(rescheduled.rows[0].result.task.scheduledFor, "2026-07-20");

    await assert.rejects(
      db.query(
        `select public.assistant_add_task(
          'Sensitive write', 'recovery', 'Today', 'short', null,
          'recovery-denied-0001', 'write-denied'
        )`
      ),
      /outside assistant access/
    );

    await db.query("select set_config('request.jwt.claims', $1, false)", [
      oauthClaims({ resource: "https://attacker.example/mcp", aud: "https://attacker.example/mcp" }),
    ]);
    await assert.rejects(
      db.query("select public.assistant_get_tasks('today', 'open', 50, 'bad-resource')"),
      /oauth client or resource is not allowed/
    );

    await db.exec("reset role");
    const audit = await db.query(
      `select tool_name, action_class, outcome, item_count, request_id
         from public.assistant_audit_log order by id`
    );
    assert.deepEqual(audit.rows, [
      {
        tool_name: "get_tasks",
        action_class: "read",
        outcome: "success",
        item_count: 1,
        request_id: "pglite-request",
      },
      {
        tool_name: "add_task",
        action_class: "write",
        outcome: "success",
        item_count: 1,
        request_id: "write-add",
      },
      {
        tool_name: "add_task",
        action_class: "write",
        outcome: "replayed",
        item_count: 0,
        request_id: "write-add-retry",
      },
      {
        tool_name: "complete_task",
        action_class: "write",
        outcome: "success",
        item_count: 1,
        request_id: "write-complete",
      },
      {
        tool_name: "reschedule_task",
        action_class: "write",
        outcome: "conflict",
        item_count: 0,
        request_id: "write-conflict",
      },
      {
        tool_name: "reschedule_task",
        action_class: "write",
        outcome: "success",
        item_count: 1,
        request_id: "write-reschedule",
      },
    ]);
    assert.equal(JSON.stringify(audit.rows).includes("Write outline"), false);
    const idempotency = await db.query(
      "select tool_name, request_hash, task_id, result_version from public.assistant_idempotency order by tool_name, idempotency_key"
    );
    assert.equal(idempotency.rows.length, 4);
    assert.equal(JSON.stringify(idempotency.rows).includes("Write outline"), false);

    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: USER_ID, role: "authenticated" }),
    ]);
    await db.query(
      `update public.assistant_access
          set tasks_write = true,
              day_read = true,
              day_write = true,
              workouts_write = true,
              review_write = true
        where user_id = $1`,
      [USER_ID]
    );
    await db.query("select set_config('request.jwt.claims', $1, false)", [oauthClaims()]);

    const goalsResult = await db.query(
      "select public.assistant_get_shared_goals() as result"
    );
    assert.deepEqual(goalsResult.rows[0].result.goals, [{ id: "shared", name: "School" }]);

    const operations = [
      {
        type: "add_task",
        text: "Prepare tomorrow notes",
        goalId: "shared",
        label: "Today",
        term: "short",
        scheduledFor: "2026-07-15",
      },
      {
        type: "add_day_block",
        date: "2026-07-15",
        start: 17 * 60,
        end: 18 * 60,
        title: "Prepare tomorrow notes",
        category: "focus",
        protected: false,
        linkTaskId: null,
        task: null,
      },
      {
        type: "import_workout_plan",
        date: "2026-07-15",
        name: "Upper body",
        workoutType: "strength",
        notes: "",
        exercises: [
          {
            name: "Bench press",
            muscleGroup: "chest",
            type: "strength",
            targetSets: 3,
            targetReps: 8,
            targetWeight: 135,
            targetMinutes: null,
            restSec: 90,
            notes: null,
          },
        ],
      },
      {
        type: "mark_for_review",
        itemType: "goal",
        itemId: "shared",
        label: "School",
        reason: "User asked to remove this goal later",
      },
    ];
    const preview = await db.query(
      "select public.assistant_preview_changes($1::jsonb, 'preview-test') as result",
      [JSON.stringify(operations)]
    );
    assert.equal(preview.rows[0].result.changeCount, 4);
    assert.equal(preview.rows[0].result.summary.length, 4);

    const confirmationId = preview.rows[0].result.confirmationId;
    const applied = await db.query(
      "select public.assistant_apply_changes($1::uuid, 'apply-test') as result",
      [confirmationId]
    );
    assert.equal(applied.rows[0].result.status, "applied");
    assert.equal(applied.rows[0].result.changeCount, 4);
    assert.deepEqual(
      applied.rows[0].result.results.map((item) => item.type),
      ["add_task", "add_day_block", "import_workout_plan", "mark_for_review"]
    );

    const replayed = await db.query(
      "select public.assistant_apply_changes($1::uuid, 'apply-retry') as result",
      [confirmationId]
    );
    assert.equal(replayed.rows[0].result.status, "replayed");

    const dayPlan = await db.query(
      "select public.assistant_get_day_plan('2026-07-15') as result"
    );
    assert.equal(dayPlan.rows[0].result.count, 1);
    assert.equal(dayPlan.rows[0].result.blocks[0].title, "Prepare tomorrow notes");
    assert.equal(dayPlan.rows[0].result.blocks[0].version, 1);

    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: USER_ID, role: "authenticated" }),
    ]);
    const reviewMarks = await db.query(
      "select label, reason, status from public.assistant_review_marks"
    );
    assert.deepEqual(reviewMarks.rows, [
      {
        label: "School",
        reason: "User asked to remove this goal later",
        status: "pending",
      },
    ]);
    const storedPlan = await db.query(
      `select jsonb_array_length(data -> 'ligand.data' -> 'scheduledWorkouts') as count
         from public.user_data where user_id = $1`,
      [USER_ID]
    );
    assert.equal(storedPlan.rows[0].count, 1);

    await db.query("select set_config('request.jwt.claims', $1, false)", [oauthClaims()]);
    const plusPreview = await db.query(
      `select public.assistant_preview_changes($1::jsonb, 'plus-preview') as result`,
      [
        JSON.stringify([
          {
            type: "add_task",
            text: "Plus approval task",
            goalId: "shared",
            label: "Today",
            term: "short",
            scheduledFor: "2026-07-16",
          },
        ]),
      ]
    );
    const plusConfirmationId = plusPreview.rows[0].result.confirmationId;

    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: USER_ID, role: "authenticated" }),
    ]);
    const directPreview = await db.query(
      "select public.assistant_get_change_preview($1::uuid) as result",
      [plusConfirmationId]
    );
    assert.equal(directPreview.rows[0].result.status, "pending");
    assert.deepEqual(directPreview.rows[0].result.summary, [
      'Add task "Plus approval task"',
    ]);

    const directApplied = await db.query(
      "select public.assistant_apply_changes_direct($1::uuid) as result",
      [plusConfirmationId]
    );
    assert.equal(directApplied.rows[0].result.status, "applied");
    assert.equal(directApplied.rows[0].result.results[0].type, "add_task");
    const restoredClaims = await db.query(
      "select auth.jwt() -> 'ligand_mcp' as ligand_mcp"
    );
    assert.equal(restoredClaims.rows[0].ligand_mcp, null);

    const directReplay = await db.query(
      "select public.assistant_apply_changes_direct($1::uuid) as result",
      [plusConfirmationId]
    );
    assert.equal(directReplay.rows[0].result.status, "replayed");

    const listedDrafts = await db.query(
      "select public.assistant_list_change_previews(20) as result"
    );
    assert.ok(listedDrafts.rows[0].result.count >= 1);
    assert.equal(
      listedDrafts.rows[0].result.drafts.some(
        (draft) => draft.confirmationId === plusConfirmationId
      ),
      true
    );

    await db.query("select set_config('request.jwt.claims', $1, false)", [oauthClaims()]);
    const dismissible = await db.query(
      `select public.assistant_preview_changes($1::jsonb, 'dismiss-preview') as result`,
      [
        JSON.stringify([{
          type: "add_task",
          text: "Dismiss this",
          goalId: "shared",
          label: "General",
          term: "short",
          scheduledFor: null,
        }]),
      ]
    );
    const dismissibleId = dismissible.rows[0].result.confirmationId;
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: USER_ID, role: "authenticated" }),
    ]);
    const dismissed = await db.query(
      "select public.assistant_dismiss_change_preview($1::uuid) as result",
      [dismissibleId]
    );
    assert.equal(dismissed.rows[0].result.status, "dismissed");
    const dismissedPreview = await db.query(
      "select public.assistant_get_change_preview($1::uuid) as result",
      [dismissibleId]
    );
    assert.equal(dismissedPreview.rows[0].result.status, "dismissed");
    await assert.rejects(
      db.query("select public.assistant_apply_changes_direct($1::uuid)", [dismissibleId]),
      /confirmation expired/
    );

    const privateTask = {
      id: "private-task",
      text: "Embarrassing private task",
      label: "Today",
      goalId: "shared",
      term: "short",
      repeat: null,
      scheduledFor: "2026-07-15",
      done: false,
      completedOn: null,
      assistantPrivate: true,
      createdAt: "2026-07-15T00:00:00Z",
    };
    await db.query(
      "select public.task_record_apply($1::jsonb, 0, false)",
      [JSON.stringify(privateTask)]
    );
    await db.query("select set_config('request.jwt.claims', $1, false)", [oauthClaims()]);
    const privateFiltered = await db.query(
      "select public.assistant_get_tasks('all', 'all', 100, 'private-filter') as result"
    );
    assert.equal(
      privateFiltered.rows[0].result.tasks.some((task) => task.id === "private-task"),
      false
    );

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [OTHER_USER_ID]);
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: OTHER_USER_ID, role: "authenticated" }),
    ]);
    await assert.rejects(
      db.query("select public.assistant_get_change_preview($1::uuid)", [plusConfirmationId]),
      /confirmation not found/
    );
  } finally {
    await db.close();
  }
});
