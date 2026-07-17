import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const BLOCK_CATEGORIES = [
  "focus",
  "work",
  "personal",
  "break",
  "exercise",
  "sleep",
  "other",
];

const dateKeySchema = z.string().regex(DATE_PATTERN).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");

const taskFields = {
  text: z.string().trim().min(1).max(500),
  goalId: z.string().min(1).max(200).nullable().default(null),
  label: z.enum(["General", "Today", "Urgent"]).default("General"),
  term: z.enum(["short", "long"]).default("short"),
  scheduledFor: dateKeySchema.nullable().default(null),
};

const nestedTaskSchema = z.object(taskFields).strict();

const addTaskOperationSchema = z
  .object({ type: z.literal("add_task"), ...taskFields })
  .strict();

const completeTaskOperationSchema = z
  .object({
    type: z.literal("complete_task"),
    taskId: z.string().min(1).max(200),
    expectedVersion: z.number().int().min(1),
  })
  .strict();

const rescheduleTaskOperationSchema = completeTaskOperationSchema
  .omit({ type: true })
  .extend({
    type: z.literal("reschedule_task"),
    scheduledFor: dateKeySchema.nullable(),
  })
  .strict();

const addDayBlockOperationSchema = z
  .object({
    type: z.literal("add_day_block"),
    date: dateKeySchema,
    startTime: z.string().regex(TIME_PATTERN),
    endTime: z.string().regex(TIME_PATTERN),
    title: z.string().trim().min(1).max(60),
    category: z.enum(BLOCK_CATEGORIES).default("focus"),
    protected: z.boolean().default(false),
    linkTaskId: z.string().min(1).max(200).nullable().default(null),
    task: nestedTaskSchema.nullable().default(null),
  })
  .strict();

const completeDayBlockOperationSchema = z
  .object({
    type: z.literal("complete_day_block"),
    blockId: z.string().min(1).max(200),
    expectedVersion: z.number().int().min(1),
  })
  .strict();

const workoutExerciseSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    muscleGroup: z.string().trim().min(1).max(40).default("other"),
    type: z.enum(["strength", "cardio"]).default("strength"),
    targetSets: z.number().int().min(1).max(20).default(3),
    targetReps: z.number().int().min(1).max(100).nullable().default(null),
    targetWeight: z.number().min(0).max(2000).nullable().default(null),
    targetMinutes: z.number().int().min(1).max(600).nullable().default(null),
    restSec: z.number().int().min(0).max(900).nullable().default(null),
    notes: z.string().trim().max(200).nullable().default(null),
  })
  .strict();

const importWorkoutOperationSchema = z
  .object({
    type: z.literal("import_workout_plan"),
    date: dateKeySchema,
    name: z.string().trim().min(1).max(60),
    workoutType: z.enum(["strength", "cardio", "mixed"]).default("strength"),
    exercises: z.array(workoutExerciseSchema).min(1).max(40),
    notes: z.string().trim().max(1000).default(""),
  })
  .strict();

const markForReviewOperationSchema = z
  .object({
    type: z.literal("mark_for_review"),
    itemType: z.enum(["task", "goal", "day_block", "workout"]),
    itemId: z.string().min(1).max(200),
    label: z.string().trim().min(1).max(120),
    reason: z.string().trim().min(1).max(300),
  })
  .strict();

const operationSchema = z.discriminatedUnion("type", [
  addTaskOperationSchema,
  completeTaskOperationSchema,
  rescheduleTaskOperationSchema,
  addDayBlockOperationSchema,
  completeDayBlockOperationSchema,
  importWorkoutOperationSchema,
  markForReviewOperationSchema,
]);

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export const getSharedGoalsInputSchema = z.object({}).strict();
export const getDayPlanInputSchema = z.object({ date: dateKeySchema }).strict();
export const previewChangesInputSchema = z
  .object({ operations: z.array(operationSchema).min(1).max(30) })
  .strict()
  .superRefine((value, context) => {
    value.operations.forEach((operation, index) => {
      if (operation.type !== "add_day_block") return;
      if (timeToMinutes(operation.endTime) <= timeToMinutes(operation.startTime)) {
        context.addIssue({
          code: "custom",
          path: ["operations", index, "endTime"],
          message: "A Day block must end after it starts.",
        });
      }
      if (operation.linkTaskId && operation.task) {
        context.addIssue({
          code: "custom",
          path: ["operations", index],
          message: "A Day block cannot link an existing task and create another task.",
        });
      }
    });
  });
export const applyChangesInputSchema = z
  .object({ confirmationId: z.string().uuid() })
  .strict();

const sharedGoalsOutputSchema = z
  .object({
    goals: z.array(
      z.object({ id: z.string().max(200), name: z.string().max(120) }).strict()
    ).max(100),
    count: z.number().int().min(0).max(100),
  })
  .strict();

const dayBlockSchema = z
  .object({
    id: z.string().max(200),
    date: dateKeySchema,
    start: z.number().int().min(0).max(1439),
    end: z.number().int().min(1).max(1440),
    title: z.string().max(60),
    category: z.enum(BLOCK_CATEGORIES),
    protected: z.boolean(),
    done: z.boolean(),
    linkType: z.enum(["task", "habit", "workout"]).nullable(),
    linkId: z.string().max(200).nullable(),
    version: z.number().int().min(1),
    updatedAt: z.string().max(40),
  })
  .strict();

const dayPlanOutputSchema = z
  .object({
    date: dateKeySchema,
    blocks: z.array(dayBlockSchema).max(100),
    count: z.number().int().min(0).max(100),
  })
  .strict();

const previewOutputSchema = z
  .object({
    confirmationId: z.string().uuid(),
    expiresAt: z.string().max(40),
    changeCount: z.number().int().min(1).max(30),
    summary: z.array(z.string().max(300)).min(1).max(30),
    approvalUrl: z.string().url().max(1000),
  })
  .strict();

const applyOutputSchema = z
  .object({
    status: z.enum(["applied", "replayed"]),
    changeCount: z.number().int().min(1).max(30),
    results: z.array(
      z.object({
        type: z.string().max(40),
        status: z.string().max(40),
        id: z.string().max(200).optional(),
      }).strict()
    ).min(1).max(30),
  })
  .strict();

export class SafeAssistantActionError extends Error {
  constructor(message) {
    super(message);
    this.name = "SafeAssistantActionError";
  }
}

function clientFor(accessToken, config) {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function throwRpcError(error) {
  if (error?.code === "42501" || error?.code === "28000") {
    throw new SafeAssistantActionError(
      "That Ligand capability is disabled or outside the access you approved."
    );
  }
  if (error?.code === "P0002") {
    throw new SafeAssistantActionError(
      "That Ligand item no longer exists. Read the latest data and prepare a new preview."
    );
  }
  if (error?.code === "40001") {
    throw new SafeAssistantActionError(
      "Ligand changed after this preview. Read the latest data and prepare a new preview."
    );
  }
  if (error?.code === "57014") {
    throw new SafeAssistantActionError(
      "Ligand is limiting changes right now. Wait a few minutes and retry."
    );
  }
  if (error?.code === "22023") {
    throw new SafeAssistantActionError(
      "Ligand rejected invalid, expired, or conflicting change details. Prepare a new preview."
    );
  }
  throw new SafeAssistantActionError("Ligand could not complete that request right now.");
}

async function callRpc({ accessToken, config, name, args, schema }) {
  const { data, error } = await clientFor(accessToken, config).rpc(name, args);
  if (error) throwRpcError(error);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new SafeAssistantActionError(
      "Ligand returned an unexpected response and shared no unvalidated data."
    );
  }
  return parsed.data;
}

export function fetchSharedGoals({ accessToken, config }) {
  return callRpc({
    accessToken,
    config,
    name: "assistant_get_shared_goals",
    args: {},
    schema: sharedGoalsOutputSchema,
  });
}

export function fetchDayPlan({ accessToken, config, input }) {
  return callRpc({
    accessToken,
    config,
    name: "assistant_get_day_plan",
    args: { p_date: input.date },
    schema: dayPlanOutputSchema,
  });
}

function normalizeOperations(operations) {
  return operations.map((operation) => {
    if (operation.type !== "add_day_block") return operation;
    const { startTime, endTime, ...rest } = operation;
    return {
      ...rest,
      start: timeToMinutes(startTime),
      end: timeToMinutes(endTime),
    };
  });
}

export async function previewAssistantChanges({ accessToken, config, input, requestId }) {
  const preview = await callRpc({
    accessToken,
    config,
    name: "assistant_preview_changes",
    args: {
      p_operations: normalizeOperations(input.operations),
      p_request_id: requestId,
    },
    schema: previewOutputSchema.omit({ approvalUrl: true }),
  });
  const approvalUrl = new URL("/assistant/approve", config.resourceDocumentationUrl);
  approvalUrl.searchParams.set("confirmation_id", preview.confirmationId);
  return previewOutputSchema.parse({ ...preview, approvalUrl: approvalUrl.toString() });
}

export function applyAssistantChanges({ accessToken, config, input, requestId }) {
  return callRpc({
    accessToken,
    config,
    name: "assistant_apply_changes",
    args: {
      p_confirmation_id: input.confirmationId,
      p_request_id: requestId,
    },
    schema: applyOutputSchema,
  });
}

export {
  BLOCK_CATEGORIES,
  applyOutputSchema,
  dayPlanOutputSchema,
  previewOutputSchema,
  sharedGoalsOutputSchema,
};
