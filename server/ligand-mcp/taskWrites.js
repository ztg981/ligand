import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { taskSchema } from "./tasks.js";

const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid calendar date");

const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const addTaskInputSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    goalId: z.string().min(1).max(200).nullable().default(null),
    label: z.enum(["General", "Today", "Urgent"]).default("General"),
    term: z.enum(["short", "long"]).default("short"),
    scheduledFor: dateKeySchema.nullable().default(null),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const completeTaskInputSchema = z
  .object({
    taskId: z.string().min(1).max(200),
    expectedVersion: z.number().int().min(1),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const rescheduleTaskInputSchema = completeTaskInputSchema
  .extend({ scheduledFor: dateKeySchema.nullable() })
  .strict();

const writeTaskSchema = taskSchema.extend({ version: z.number().int().min(1) }).strict();

export const taskMutationOutputSchema = z
  .object({
    status: z.enum(["created", "completed", "rescheduled", "conflict", "replayed"]),
    task: writeTaskSchema,
  })
  .strict();

export class SafeTaskWriteError extends Error {
  constructor(message) {
    super(message);
    this.name = "SafeTaskWriteError";
  }
}

const RPC_BY_TOOL = Object.freeze({
  add_task: "assistant_add_task",
  complete_task: "assistant_complete_task",
  reschedule_task: "assistant_reschedule_task",
});

function rpcArguments(toolName, input, requestId) {
  if (toolName === "add_task") {
    return {
      p_text: input.text,
      p_goal_id: input.goalId,
      p_label: input.label,
      p_term: input.term,
      p_scheduled_for: input.scheduledFor,
      p_idempotency_key: input.idempotencyKey,
      p_request_id: requestId,
    };
  }
  if (toolName === "complete_task") {
    return {
      p_task_id: input.taskId,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
      p_request_id: requestId,
    };
  }
  return {
    p_task_id: input.taskId,
    p_expected_version: input.expectedVersion,
    p_scheduled_for: input.scheduledFor,
    p_idempotency_key: input.idempotencyKey,
    p_request_id: requestId,
  };
}

export async function applyAllowedTaskMutation({
  accessToken,
  config,
  toolName,
  input,
  requestId,
}) {
  const rpcName = RPC_BY_TOOL[toolName];
  if (!rpcName) throw new SafeTaskWriteError("Ligand rejected an unknown task action.");

  const client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await client.rpc(
    rpcName,
    rpcArguments(toolName, input, requestId)
  );

  if (error) {
    if (error.code === "42501" || error.code === "28000") {
      throw new SafeTaskWriteError(
        "Ligand task changes are disabled or this task is outside the goals you shared."
      );
    }
    if (error.code === "P0002") {
      throw new SafeTaskWriteError("That Ligand task no longer exists. Read tasks again first.");
    }
    if (error.code === "57014") {
      throw new SafeTaskWriteError("Ligand is limiting task changes. Wait a few minutes and retry.");
    }
    if (error.code === "22023") {
      throw new SafeTaskWriteError("Ligand rejected invalid or reused task-change details.");
    }
    throw new SafeTaskWriteError("Ligand could not apply that task change right now.");
  }

  const parsed = taskMutationOutputSchema.safeParse(data);
  if (!parsed.success) {
    throw new SafeTaskWriteError(
      "Ligand returned an unexpected task-change response and treated the action as unconfirmed."
    );
  }
  return parsed.data;
}

