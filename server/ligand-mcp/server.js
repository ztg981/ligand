import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  SafeAssistantActionError,
  applyAssistantChanges,
  applyChangesInputSchema,
  fetchDayPlan,
  fetchSharedGoals,
  getDayPlanInputSchema,
  getSharedGoalsInputSchema,
  previewAssistantChanges,
  previewChangesInputSchema,
} from "./assistantActions.js";
import {
  McpAuthenticationError,
  authorizationChallenge,
  extractBearerToken,
  unauthorizedResponse,
  verifyMcpToken,
} from "./auth.js";
import { getMcpConfig } from "./config.js";
import {
  SafeTaskToolError,
  fetchAllowedTasks,
  getTasksInputSchema,
} from "./tasks.js";

const SECURITY_SCHEMES = Object.freeze([{ type: "oauth2", scopes: ["openid"] }]);
const READ_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export const GET_TASKS_TOOL = Object.freeze({
  name: "get_tasks",
  title: "Get Ligand tasks",
  description:
    "Read tasks the user explicitly shared from Ligand. Use focus=all for questions about a whole day or all open work. This never returns journals, notes, recovery data, settings, or raw database content.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      focus: {
        type: "string",
        enum: ["today", "all"],
        default: "today",
        description:
          "today returns open tasks labeled Today or Urgent; all uses the complete explicitly shared task scope.",
      },
      status: {
        type: "string",
        enum: ["open", "completed", "all"],
        default: "open",
        description: "Filter by completion status.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 50,
        description: "Maximum number of tasks to return.",
      },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["focus", "status", "tasks", "count", "truncated"],
    properties: {
      focus: { type: "string", enum: ["today", "all"] },
      status: { type: "string", enum: ["open", "completed", "all"] },
      count: { type: "integer", minimum: 0, maximum: 100 },
      truncated: { type: "boolean" },
      tasks: {
        type: "array",
        maxItems: 100,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "text", "done", "version"],
          properties: {
            id: { type: "string" },
            text: { type: "string" },
            label: { type: "string" },
            goalId: { type: "string" },
            goalName: { type: "string" },
            term: { type: "string" },
            repeat: { type: ["object", "null"] },
            scheduledFor: { type: "string", format: "date" },
            done: { type: "boolean" },
            completedOn: { type: "string" },
            version: { type: "integer", minimum: 1 },
            createdAt: { type: "string" },
            updatedAt: { type: "string" },
          },
        },
      },
    },
  },
  annotations: READ_ANNOTATIONS,
  securitySchemes: SECURITY_SCHEMES,
});

export const GET_SHARED_GOALS_TOOL = Object.freeze({
  name: "get_shared_goals",
  title: "Get shared Ligand goals",
  description:
    "List only the non-recovery goals the user selected for ChatGPT. Use goal ids from this result when preparing tasks or review marks.",
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["goals", "count"],
    properties: {
      goals: {
        type: "array",
        maxItems: 100,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "name"],
          properties: { id: { type: "string" }, name: { type: "string" } },
        },
      },
      count: { type: "integer", minimum: 0, maximum: 100 },
    },
  },
  annotations: READ_ANNOTATIONS,
  securitySchemes: SECURITY_SCHEMES,
});

export const GET_DAY_PLAN_TOOL = Object.freeze({
  name: "get_day_plan",
  title: "Get a Ligand Day plan",
  description:
    "Read the user's approved Ligand Day blocks for one calendar date. Times are minutes after local midnight; summarize them in the user's local time.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["date"],
    properties: { date: { type: "string", format: "date" } },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["date", "blocks", "count"],
    properties: {
      date: { type: "string", format: "date" },
      count: { type: "integer", minimum: 0, maximum: 100 },
      blocks: {
        type: "array",
        maxItems: 100,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "date",
            "start",
            "end",
            "title",
            "category",
            "protected",
            "done",
            "linkType",
            "linkId",
            "version",
            "updatedAt",
          ],
          properties: {
            id: { type: "string" },
            date: { type: "string", format: "date" },
            start: { type: "integer", minimum: 0, maximum: 1439 },
            end: { type: "integer", minimum: 1, maximum: 1440 },
            title: { type: "string" },
            category: {
              type: "string",
              enum: ["focus", "work", "personal", "break", "exercise", "sleep", "other"],
            },
            protected: { type: "boolean" },
            done: { type: "boolean" },
            linkType: { type: ["string", "null"], enum: ["task", "habit", "workout", null] },
            linkId: { type: ["string", "null"] },
            version: { type: "integer", minimum: 1 },
            updatedAt: { type: "string" },
          },
        },
      },
    },
  },
  annotations: READ_ANNOTATIONS,
  securitySchemes: SECURITY_SCHEMES,
});

const TASK_CHANGE_PROPERTIES = Object.freeze({
  text: { type: "string", minLength: 1, maxLength: 500 },
  goalId: { type: ["string", "null"], maxLength: 200, default: null },
  label: { type: "string", enum: ["General", "Today", "Urgent"], default: "General" },
  term: { type: "string", enum: ["short", "long"], default: "short" },
  scheduledFor: { type: ["string", "null"], format: "date", default: null },
});

const WORKOUT_EXERCISE_PROPERTIES = Object.freeze({
  name: { type: "string", minLength: 1, maxLength: 100 },
  muscleGroup: { type: "string", minLength: 1, maxLength: 40, default: "other" },
  type: { type: "string", enum: ["strength", "cardio"], default: "strength" },
  targetSets: { type: "integer", minimum: 1, maximum: 20, default: 3 },
  targetReps: { type: ["integer", "null"], minimum: 1, maximum: 100, default: null },
  targetWeight: { type: ["number", "null"], minimum: 0, maximum: 2000, default: null },
  targetMinutes: { type: ["integer", "null"], minimum: 1, maximum: 600, default: null },
  restSec: { type: ["integer", "null"], minimum: 0, maximum: 900, default: null },
  notes: { type: ["string", "null"], maxLength: 200, default: null },
});

export const PREVIEW_CHANGES_TOOL = Object.freeze({
  name: "preview_ligand_changes",
  title: "Preview Ligand changes",
  description:
    "Prepare a short-lived exact preview without changing Ligand content. Show the returned summary to the user. If apply_ligand_changes is unavailable, give the user approvalUrl so they can review and save inside Ligand. To handle a request to delete or remove something, use mark_for_review; there is no delete operation.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["operations"],
    properties: {
      operations: {
        type: "array",
        minItems: 1,
        maxItems: 30,
        items: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "text"],
              properties: { type: { const: "add_task" }, ...TASK_CHANGE_PROPERTIES },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "taskId", "expectedVersion"],
              properties: {
                type: { const: "complete_task" },
                taskId: { type: "string", minLength: 1, maxLength: 200 },
                expectedVersion: { type: "integer", minimum: 1 },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "taskId", "expectedVersion", "scheduledFor"],
              properties: {
                type: { const: "reschedule_task" },
                taskId: { type: "string", minLength: 1, maxLength: 200 },
                expectedVersion: { type: "integer", minimum: 1 },
                scheduledFor: { type: ["string", "null"], format: "date" },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "date", "startTime", "endTime", "title"],
              properties: {
                type: { const: "add_day_block" },
                date: { type: "string", format: "date" },
                startTime: { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" },
                endTime: { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" },
                title: { type: "string", minLength: 1, maxLength: 60 },
                category: {
                  type: "string",
                  enum: ["focus", "work", "personal", "break", "exercise", "sleep", "other"],
                  default: "focus",
                },
                protected: { type: "boolean", default: false },
                linkTaskId: { type: ["string", "null"], maxLength: 200, default: null },
                task: {
                  type: ["object", "null"],
                  default: null,
                  additionalProperties: false,
                  required: ["text"],
                  properties: TASK_CHANGE_PROPERTIES,
                  description: "Optionally create and link a new task for this block.",
                },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "blockId", "expectedVersion"],
              properties: {
                type: { const: "complete_day_block" },
                blockId: { type: "string", minLength: 1, maxLength: 200 },
                expectedVersion: { type: "integer", minimum: 1 },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "date", "name", "exercises"],
              properties: {
                type: { const: "import_workout_plan" },
                date: { type: "string", format: "date" },
                name: { type: "string", minLength: 1, maxLength: 60 },
                workoutType: {
                  type: "string",
                  enum: ["strength", "cardio", "mixed"],
                  default: "strength",
                },
                exercises: {
                  type: "array",
                  minItems: 1,
                  maxItems: 40,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name"],
                    properties: WORKOUT_EXERCISE_PROPERTIES,
                  },
                },
                notes: { type: "string", maxLength: 1000, default: "" },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["type", "itemType", "itemId", "label", "reason"],
              properties: {
                type: { const: "mark_for_review" },
                itemType: { type: "string", enum: ["task", "goal", "day_block", "workout"] },
                itemId: { type: "string", minLength: 1, maxLength: 200 },
                label: { type: "string", minLength: 1, maxLength: 120 },
                reason: { type: "string", minLength: 1, maxLength: 300 },
              },
            },
          ],
        },
      },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["confirmationId", "expiresAt", "changeCount", "summary", "approvalUrl"],
    properties: {
      confirmationId: { type: "string", format: "uuid" },
      expiresAt: { type: "string" },
      changeCount: { type: "integer", minimum: 1, maximum: 30 },
      summary: { type: "array", minItems: 1, maxItems: 30, items: { type: "string" } },
      approvalUrl: { type: "string", format: "uri", maxLength: 1000 },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  securitySchemes: SECURITY_SCHEMES,
});

export const APPLY_CHANGES_TOOL = Object.freeze({
  name: "apply_ligand_changes",
  title: "Apply confirmed Ligand changes",
  description:
    "Apply one exact unexpired preview after the user has reviewed its summary and approved ChatGPT's change confirmation. The stored preview cannot be altered here. This tool cannot delete any Ligand content.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["confirmationId"],
    properties: { confirmationId: { type: "string", format: "uuid" } },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["status", "changeCount", "results"],
    properties: {
      status: { type: "string", enum: ["applied", "replayed"] },
      changeCount: { type: "integer", minimum: 1, maximum: 30 },
      results: {
        type: "array",
        minItems: 1,
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "status"],
          properties: {
            type: { type: "string" },
            status: { type: "string" },
            id: { type: "string" },
          },
        },
      },
    },
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  securitySchemes: SECURITY_SCHEMES,
});

function authRequiredResult(config) {
  return {
    content: [
      {
        type: "text",
        text: "Authentication required. Connect your Ligand account to continue.",
      },
    ],
    _meta: {
      "mcp/www_authenticate": [
        authorizationChallenge(config, {
          error: "insufficient_scope",
          description: "Connect your Ligand account to use this tool.",
        }),
      ],
    },
    isError: true,
  };
}

function safeToolFailure(message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function successfulToolResult(result) {
  return {
    structuredContent: result,
    content: [{ type: "text", text: JSON.stringify(result) }],
  };
}

function createProtocolServer({
  accessToken,
  identity,
  config,
  getTasks,
  getGoals,
  getDayPlan,
  previewChanges,
  applyChanges,
}) {
  const server = new Server(
    { name: "ligand", version: "0.5.0" },
    {
      capabilities: { tools: {} },
      instructions: config.taskWritesEnabled
        ? "Ligand shares only explicitly approved data. Notes, journals, recovery content, and tasks marked Private are never returned. Read current records before preparing changes. Every change must first use preview_ligand_changes and show its exact summary. If apply_ligand_changes is available, call it so ChatGPT can ask for confirmation. If it is unavailable on the user's ChatGPT plan, provide the returned approvalUrl and explain that the user can review it in Ligand's Assistant Inbox. Never claim a preview changed Ligand. There is no delete operation: represent removal requests with mark_for_review. For a timed task, create a scheduled task and a linked Day block; ask for the end time or duration if the user did not provide one. When the user asks to plan a day, read both open tasks and existing Day blocks first, avoid overlaps, include reasonable breaks, and prepare one combined preview. When the user finishes a linked Day block and its task, include both complete_day_block and complete_task in the same preview. Do not infer an item when more than one could match."
        : "Ligand shares only user-approved data. This deployment is read-only and cannot change or delete anything.",
    }
  );

  const listedTools = config.taskWritesEnabled
    ? [
        GET_TASKS_TOOL,
        GET_SHARED_GOALS_TOOL,
        GET_DAY_PLAN_TOOL,
        PREVIEW_CHANGES_TOOL,
        APPLY_CHANGES_TOOL,
      ]
    : [GET_TASKS_TOOL, GET_SHARED_GOALS_TOOL, GET_DAY_PLAN_TOOL];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listedTools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    if (!listedTools.some((tool) => tool.name === toolName)) {
      throw new McpError(ErrorCode.InvalidParams, "Unknown Ligand tool.");
    }
    if (!identity || !accessToken) return authRequiredResult(config);

    const args = request.params.arguments || {};
    const requestId = crypto.randomUUID();
    try {
      if (toolName === GET_TASKS_TOOL.name) {
        const parsed = getTasksInputSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, "Invalid get_tasks arguments.");
        }
        return successfulToolResult(
          await getTasks({ accessToken, config, input: parsed.data, requestId })
        );
      }
      if (toolName === GET_SHARED_GOALS_TOOL.name) {
        const parsed = getSharedGoalsInputSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, "Invalid get_shared_goals arguments.");
        }
        return successfulToolResult(
          await getGoals({ accessToken, config, input: parsed.data, requestId })
        );
      }
      if (toolName === GET_DAY_PLAN_TOOL.name) {
        const parsed = getDayPlanInputSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, "Invalid get_day_plan arguments.");
        }
        return successfulToolResult(
          await getDayPlan({ accessToken, config, input: parsed.data, requestId })
        );
      }
      if (toolName === PREVIEW_CHANGES_TOOL.name) {
        const parsed = previewChangesInputSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, "Invalid Ligand change preview.");
        }
        return successfulToolResult(
          await previewChanges({ accessToken, config, input: parsed.data, requestId })
        );
      }

      const parsed = applyChangesInputSchema.safeParse(args);
      if (!parsed.success) {
        throw new McpError(ErrorCode.InvalidParams, "Invalid Ligand confirmation.");
      }
      return successfulToolResult(
        await applyChanges({ accessToken, config, input: parsed.data, requestId })
      );
    } catch (error) {
      if (error instanceof McpError) throw error;
      if (error instanceof SafeTaskToolError || error instanceof SafeAssistantActionError) {
        return safeToolFailure(error.message);
      }
      return safeToolFailure("Ligand could not complete that request.");
    }
  });

  return server;
}

export function createLigandMcpHandler(options = {}) {
  const env = options.env || globalThis.process?.env || {};
  const verifyToken = options.verifyToken || verifyMcpToken;
  const getTasks = options.getTasks || fetchAllowedTasks;
  const getGoals = options.getGoals || fetchSharedGoals;
  const getDayPlan = options.getDayPlan || fetchDayPlan;
  const previewChanges = options.previewChanges || previewAssistantChanges;
  const applyChanges = options.applyChanges || applyAssistantChanges;

  return async function handleLigandMcp(request) {
    const config = getMcpConfig(env);
    let accessToken;
    let identity = null;

    try {
      accessToken = extractBearerToken(request);
      if (accessToken) identity = await verifyToken(accessToken, config);
    } catch (error) {
      if (error instanceof McpAuthenticationError) return unauthorizedResponse(config);
      return unauthorizedResponse(config);
    }

    const server = createProtocolServer({
      accessToken,
      identity,
      config,
      getTasks,
      getGoals,
      getDayPlan,
      previewChanges,
      applyChanges,
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  };
}
