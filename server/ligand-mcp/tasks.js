import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const getTasksInputSchema = z
  .object({
    focus: z.enum(["today", "all"]).default("today"),
    status: z.enum(["open", "completed", "all"]).default("open"),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();

const repeatSchema = z
  .object({
    type: z.enum(["daily", "weekly"]),
    weekday: z.number().int().min(0).max(6).optional(),
  })
  .strict();

export const taskSchema = z
  .object({
    id: z.string().min(1).max(200),
    text: z.string().max(500),
    label: z.string().max(80).optional(),
    goalId: z.string().max(200).optional(),
    goalName: z.string().max(120).optional(),
    term: z.string().max(40).optional(),
    repeat: repeatSchema.nullable().optional(),
    scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    done: z.boolean(),
    completedOn: z.string().max(10).optional(),
    version: z.number().int().min(1),
    createdAt: z.string().max(40).optional(),
    updatedAt: z.string().max(40).optional(),
  })
  .strict();

export const getTasksOutputSchema = z
  .object({
    focus: z.enum(["today", "all"]),
    status: z.enum(["open", "completed", "all"]),
    tasks: z.array(taskSchema).max(100),
    count: z.number().int().min(0).max(100),
    truncated: z.boolean(),
  })
  .strict();

export class SafeTaskToolError extends Error {
  constructor(message) {
    super(message);
    this.name = "SafeTaskToolError";
  }
}

export async function fetchAllowedTasks({ accessToken, config, input, requestId }) {
  const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data, error } = await supabase.rpc("assistant_get_tasks", {
    p_focus: input.focus,
    p_status: input.status,
    p_limit: input.limit,
    p_request_id: requestId,
  });

  if (error) {
    if (error.code === "42501" || error.code === "28000") {
      throw new SafeTaskToolError(
        "Ligand assistant access is disabled or does not include tasks. Enable task access in Ligand first."
      );
    }
    throw new SafeTaskToolError("Ligand could not read tasks right now. Try again later.");
  }

  const parsed = getTasksOutputSchema.safeParse(data);
  if (!parsed.success) {
    throw new SafeTaskToolError("Ligand returned an unexpected task response and shared no data.");
  }
  return parsed.data;
}
