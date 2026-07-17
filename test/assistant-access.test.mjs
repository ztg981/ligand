import assert from "node:assert/strict";
import test from "node:test";

import {
  assistantAccessRow,
  normalizeAssistantAccess,
  shareableGoalsFromUserData,
  validateOAuthAuthorization,
} from "../src/lib/assistantAccess.js";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CLIENT_ID = "chatgpt-private-client";

function authorization(overrides = {}) {
  return {
    authorization_id: "authorization-1",
    redirect_uri: "https://chatgpt.com/connector/oauth/callback-1",
    client: { id: CLIENT_ID, name: "ChatGPT" },
    user: { id: USER_ID, email: "private@example.test" },
    scope: "openid",
    ...overrides,
  };
}

test("shareable goals expose only bounded id/name fields and exclude recovery", () => {
  const goals = shareableGoalsFromUserData({
    "ligand.data": {
      goals: [
        { id: "school", name: " School ", type: "custom", reflections: ["private"] },
        { id: "recovery", name: "Private", type: "recovery", recoveryData: { why: "no" } },
        { id: "fitness", name: "Fitness", type: "fitness", privateField: "not copied" },
        { id: "", name: "Invalid" },
      ],
    },
  });

  assert.deepEqual(goals, [
    { id: "school", name: "School" },
    { id: "fitness", name: "Fitness" },
  ]);
  assert.doesNotMatch(JSON.stringify(goals), /reflections|recoveryData|privateField/);
});

test("assistant access normalization drops stale or sensitive goal ids", () => {
  assert.deepEqual(
    normalizeAssistantAccess(
      {
        enabled: true,
        tasks_read: true,
        tasks_write: true,
        day_read: true,
        day_write: true,
        workouts_write: true,
        review_write: true,
        allow_unassigned_tasks: false,
        allowed_goal_ids: ["school", "recovery", "deleted"],
      },
      [{ id: "school", name: "School" }]
    ),
    {
      enabled: true,
      tasksRead: true,
      tasksWrite: true,
      dayRead: true,
      dayWrite: true,
      workoutsWrite: true,
      reviewWrite: true,
      allowUnassignedTasks: false,
      allowedGoalIds: ["school"],
    }
  );
});

test("consent accepts only the configured client, user, ChatGPT redirect, and required identity scopes", () => {
  assert.equal(validateOAuthAuthorization(authorization(), CLIENT_ID, USER_ID), null);
  assert.equal(
    validateOAuthAuthorization(authorization({ scope: "openid email" }), CLIENT_ID, USER_ID),
    null
  );

  const rejected = [
    [authorization(), "", USER_ID],
    [authorization({ client: { id: "other", name: "Other" } }), CLIENT_ID, USER_ID],
    [authorization({ user: { id: "other" } }), CLIENT_ID, USER_ID],
    [authorization({ redirect_uri: "https://attacker.example/callback" }), CLIENT_ID, USER_ID],
    [authorization({ redirect_uri: "http://chatgpt.com/connector/oauth/1" }), CLIENT_ID, USER_ID],
    [authorization({ redirect_uri: "https://chatgpt.com/not-a-connector" }), CLIENT_ID, USER_ID],
    [authorization({ scope: "openid profile" }), CLIENT_ID, USER_ID],
    [authorization({ scope: "openid phone" }), CLIENT_ID, USER_ID],
    [authorization({ scope: "email" }), CLIENT_ID, USER_ID],
  ];
  for (const args of rejected) assert.equal(typeof validateOAuthAuthorization(...args), "string");
});

test("assistant access rows keep task writes behind a separate feature and user opt-in", () => {
  assert.deepEqual(
    assistantAccessRow({
      userId: USER_ID,
      tasksRead: true,
      allowUnassignedTasks: false,
      allowedGoalIds: [],
      timezone: "America/Los_Angeles",
    }),
    {
      user_id: USER_ID,
      enabled: false,
      tasks_read: false,
      tasks_write: false,
      day_read: false,
      day_write: false,
      workouts_write: false,
      review_write: false,
      allow_unassigned_tasks: false,
      allowed_goal_ids: [],
      timezone: "America/Los_Angeles",
    }
  );

  const enabled = assistantAccessRow({
    userId: USER_ID,
    tasksRead: true,
    allowUnassignedTasks: false,
    allowedGoalIds: ["school", "school"],
    timezone: "America/Los_Angeles",
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.tasks_read, true);
  assert.equal(enabled.tasks_write, false);
  assert.deepEqual(enabled.allowed_goal_ids, ["school"]);

  const writesEnabled = assistantAccessRow({
    userId: USER_ID,
    tasksRead: true,
    tasksWrite: true,
    dayRead: true,
    dayWrite: true,
    workoutsWrite: true,
    reviewWrite: true,
    writeFeatureEnabled: true,
    allowUnassignedTasks: false,
    allowedGoalIds: ["school"],
    timezone: "America/Los_Angeles",
  });
  assert.equal(writesEnabled.tasks_write, true);
  assert.equal(writesEnabled.day_read, true);
  assert.equal(writesEnabled.day_write, true);
  assert.equal(writesEnabled.workouts_write, true);
  assert.equal(writesEnabled.review_write, true);

  const missingUserOptIn = assistantAccessRow({
    userId: USER_ID,
    tasksRead: true,
    tasksWrite: false,
    writeFeatureEnabled: true,
    allowUnassignedTasks: false,
    allowedGoalIds: ["school"],
  });
  assert.equal(missingUserOptIn.tasks_write, false);
});
