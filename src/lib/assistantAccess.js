const REQUIRED_OAUTH_SCOPES = Object.freeze(["openid"]);
const ALLOWED_OAUTH_SCOPES = Object.freeze(["openid", "email"]);

function safeGoals(data) {
  const core = data?.["ligand.data"];
  return Array.isArray(core?.goals) ? core.goals : [];
}

export function shareableGoalsFromUserData(data) {
  return safeGoals(data)
    .filter(
      (goal) =>
        goal &&
        typeof goal.id === "string" &&
        goal.id.length > 0 &&
        goal.id.length <= 200 &&
        goal.type !== "recovery"
    )
    .map((goal) => ({
      id: goal.id,
      name:
        typeof goal.name === "string" && goal.name.trim()
          ? goal.name.trim().slice(0, 120)
          : "Untitled goal",
    }));
}

export function normalizeAssistantAccess(row, shareableGoals) {
  const allowedIds = new Set((shareableGoals || []).map((goal) => goal.id));
  const enabled = row?.enabled === true;
  const tasksRead = enabled && row?.tasks_read === true;
  return {
    enabled,
    tasksRead,
    tasksWrite: tasksRead && row?.tasks_write === true,
    dayRead: tasksRead && row?.day_read === true,
    dayWrite: tasksRead && row?.day_read === true && row?.day_write === true,
    workoutsWrite: tasksRead && row?.workouts_write === true,
    reviewWrite: tasksRead && row?.review_write === true,
    allowUnassignedTasks: row?.allow_unassigned_tasks === true,
    allowedGoalIds: (Array.isArray(row?.allowed_goal_ids) ? row.allowed_goal_ids : []).filter(
      (id) => allowedIds.has(id)
    ),
  };
}

export function validateOAuthAuthorization(details, expectedClientId, currentUserId) {
  if (!expectedClientId) {
    return "The private ChatGPT client has not been configured for this Ligand build.";
  }
  if (!details || typeof details !== "object" || !("authorization_id" in details)) {
    return "This authorization request is no longer valid.";
  }
  if (details.client?.id !== expectedClientId) {
    return "This OAuth client is not allowed to connect to Ligand.";
  }
  if (details.user?.id !== currentUserId) {
    return "This authorization request belongs to a different Ligand account.";
  }

  let redirect;
  try {
    redirect = new URL(details.redirect_uri);
  } catch {
    return "The OAuth client supplied an invalid redirect address.";
  }
  if (
    redirect.protocol !== "https:" ||
    redirect.hostname !== "chatgpt.com" ||
    !redirect.pathname.startsWith("/connector/")
  ) {
    return "Only the official ChatGPT connector redirect is allowed.";
  }

  const scopes = new Set(
    String(details.scope || "")
      .split(/\s+/)
      .filter(Boolean)
  );
  if (
    REQUIRED_OAUTH_SCOPES.some((scope) => !scopes.has(scope)) ||
    [...scopes].some((scope) => !ALLOWED_OAUTH_SCOPES.includes(scope))
  ) {
    return "Ligand only permits the identity scopes required for this connection.";
  }
  return null;
}

export function assistantAccessRow({
  userId,
  tasksRead,
  tasksWrite = false,
  dayRead = false,
  dayWrite = false,
  workoutsWrite = false,
  reviewWrite = false,
  writeFeatureEnabled = false,
  allowUnassignedTasks,
  allowedGoalIds,
  timezone,
}) {
  const enabled =
    tasksRead === true &&
    (allowUnassignedTasks === true || (allowedGoalIds || []).length > 0);
  return {
    user_id: userId,
    enabled,
    tasks_read: enabled,
    tasks_write: enabled && writeFeatureEnabled === true && tasksWrite === true,
    day_read: enabled && dayRead === true,
    day_write:
      enabled && writeFeatureEnabled === true && dayRead === true && dayWrite === true,
    workouts_write:
      enabled && writeFeatureEnabled === true && workoutsWrite === true,
    review_write:
      enabled && writeFeatureEnabled === true && reviewWrite === true,
    allow_unassigned_tasks: enabled && allowUnassignedTasks === true,
    allowed_goal_ids: enabled ? [...new Set(allowedGoalIds || [])] : [],
    timezone: timezone || "UTC",
  };
}

export { ALLOWED_OAUTH_SCOPES, REQUIRED_OAUTH_SCOPES };
