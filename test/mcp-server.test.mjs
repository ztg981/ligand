import assert from "node:assert/strict";
import test from "node:test";

import { createLigandMcpHandler } from "../server/ligand-mcp/server.js";
import {
  getTasksInputSchema,
  getTasksOutputSchema,
} from "../server/ligand-mcp/tasks.js";
import {
  addTaskInputSchema,
  completeTaskInputSchema,
  rescheduleTaskInputSchema,
} from "../server/ligand-mcp/taskWrites.js";
import { previewChangesInputSchema } from "../server/ligand-mcp/assistantActions.js";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const ENV = Object.freeze({
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  LIGAND_MCP_RESOURCE_URL: "https://ligand.example/mcp",
  LIGAND_MCP_OAUTH_CLIENT_ID: "chatgpt-client",
  LIGAND_MCP_ALLOWED_USER_ID: USER_ID,
});

function mcpRequest(body, token) {
  const headers = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request("https://ligand.example/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function invoke(handler, body, token) {
  const response = await handler(mcpRequest(body, token));
  const payload = await response.json();
  return { response, payload };
}

test("get_tasks schemas default inputs and reject extra input/output fields", () => {
  assert.deepEqual(getTasksInputSchema.parse({}), {
    focus: "today",
    status: "open",
    limit: 50,
  });
  assert.equal(getTasksInputSchema.safeParse({ unexpected: true }).success, false);
  assert.equal(
    getTasksOutputSchema.safeParse({
      focus: "today",
      status: "open",
      tasks: [],
      count: 0,
      truncated: false,
      privateNotes: "must not pass",
    }).success,
    false
  );
});

test("MCP initializes and lists only read tools by default", async () => {
  const handler = createLigandMcpHandler({ env: ENV });
  const initialized = await invoke(handler, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "ligand-test", version: "1.0.0" },
    },
  });
  assert.equal(initialized.response.status, 200);
  assert.equal(initialized.payload.result.serverInfo.name, "ligand");

  const listed = await invoke(handler, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  const tool = listed.payload.result.tools[0];
  assert.equal(listed.payload.result.tools.length, 3);
  assert.deepEqual(
    listed.payload.result.tools.map((item) => item.name),
    ["get_tasks", "get_shared_goals", "get_day_plan"]
  );
  assert.equal(tool.name, "get_tasks");
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);
  assert.deepEqual(tool.securitySchemes, [{ type: "oauth2", scopes: ["openid"] }]);
});

test("the deployment flag exposes only preview and confirmed apply writes", async () => {
  const handler = createLigandMcpHandler({
    env: { ...ENV, LIGAND_MCP_ENABLE_TASK_WRITES: "true" },
  });
  const listed = await invoke(handler, {
    jsonrpc: "2.0",
    id: 20,
    method: "tools/list",
    params: {},
  });

  assert.deepEqual(
    listed.payload.result.tools.map((tool) => tool.name),
    [
      "get_tasks",
      "get_shared_goals",
      "get_day_plan",
      "preview_ligand_changes",
      "apply_ligand_changes",
    ]
  );
  const preview = listed.payload.result.tools[3];
  const apply = listed.payload.result.tools[4];
  assert.equal(preview.annotations.readOnlyHint, true);
  assert.ok(preview.outputSchema.required.includes("approvalUrl"));
  assert.equal(apply.annotations.readOnlyHint, false);
  assert.equal(apply.annotations.destructiveHint, false);
  assert.equal(apply.annotations.idempotentHint, true);
  assert.doesNotMatch(JSON.stringify(listed.payload), /delete_task|recoveryData|privateNotes/);
});

test("write schemas require exact versions and retry-safe keys", () => {
  assert.deepEqual(
    addTaskInputSchema.parse({ text: "Draft proposal", idempotencyKey: "write-0001" }),
    {
      text: "Draft proposal",
      goalId: null,
      label: "General",
      term: "short",
      scheduledFor: null,
      idempotencyKey: "write-0001",
    }
  );
  assert.equal(
    completeTaskInputSchema.safeParse({ taskId: "task-1", idempotencyKey: "write-0002" })
      .success,
    false
  );
  assert.equal(
    rescheduleTaskInputSchema.safeParse({
      taskId: "task-1",
      expectedVersion: 2,
      scheduledFor: "2026-02-30",
      idempotencyKey: "write-0003",
    }).success,
    false
  );
});

test("change previews reject deletion operations and invalid Day ranges", () => {
  assert.equal(
    previewChangesInputSchema.safeParse({
      operations: [{ type: "delete_task", taskId: "task-1" }],
    }).success,
    false
  );
  assert.equal(
    previewChangesInputSchema.safeParse({
      operations: [
        {
          type: "add_day_block",
          date: "2026-07-15",
          startTime: "17:00",
          endTime: "16:00",
          title: "Backwards",
        },
      ],
    }).success,
    false
  );
});

test("unauthenticated tool calls return the MCP OAuth challenge without data", async () => {
  const handler = createLigandMcpHandler({ env: ENV });
  const { response, payload } = await invoke(handler, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "get_tasks", arguments: {} },
  });

  assert.equal(response.status, 200);
  assert.equal(payload.result.isError, true);
  assert.match(payload.result._meta["mcp/www_authenticate"][0], /resource_metadata=/);
  assert.doesNotMatch(JSON.stringify(payload), /journal|recoveryData|privateNotes/);
});

test("invalid bearer tokens receive an HTTP 401 challenge", async () => {
  const handler = createLigandMcpHandler({
    env: ENV,
    verifyToken: async () => {
      const { McpAuthenticationError } = await import("../server/ligand-mcp/auth.js");
      throw new McpAuthenticationError();
    },
  });
  const { response, payload } = await invoke(
    handler,
    { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} },
    "invalid-token"
  );

  assert.equal(response.status, 401);
  assert.equal(payload.error, "unauthorized");
  assert.match(response.headers.get("www-authenticate"), /resource_metadata=/);
});

test("authenticated calls return only structured allowlisted task data", async () => {
  let captured;
  const handler = createLigandMcpHandler({
    env: ENV,
    verifyToken: async () => ({ userId: USER_ID, clientId: "chatgpt-client" }),
    getTasks: async (request) => {
      captured = request;
      return {
        focus: request.input.focus,
        status: request.input.status,
        tasks: [
          {
            id: "task-1",
            text: "Submit application",
            label: "Today",
            goalId: "college",
            goalName: "College Planning",
            term: "short",
            scheduledFor: "2026-07-15",
            done: false,
            version: 2,
            createdAt: "2026-07-14",
            updatedAt: "2026-07-14T12:00:00Z",
          },
        ],
        count: 1,
        truncated: false,
      };
    },
  });
  const { response, payload } = await invoke(
    handler,
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "get_tasks",
        arguments: { focus: "all", status: "open", limit: 10 },
      },
    },
    "valid-token"
  );

  assert.equal(response.status, 200);
  assert.equal(payload.result.structuredContent.count, 1);
  assert.equal(payload.result.structuredContent.tasks[0].id, "task-1");
  assert.equal(payload.result.structuredContent.tasks[0].version, 2);
  assert.equal(captured.accessToken, "valid-token");
  assert.deepEqual(captured.input, { focus: "all", status: "open", limit: 10 });
  assert.match(captured.requestId, /^[0-9a-f-]{36}$/);
  assert.doesNotMatch(JSON.stringify(payload), /token-value|recoveryData|privateNotes/);
});

test("an enabled write requires a preview id and forwards only the stored confirmation", async () => {
  const captured = [];
  const handler = createLigandMcpHandler({
    env: { ...ENV, LIGAND_MCP_ENABLE_TASK_WRITES: "true" },
    verifyToken: async () => ({ userId: USER_ID, clientId: "chatgpt-client" }),
    previewChanges: async (request) => {
      captured.push(request);
      return {
        confirmationId: "10000000-0000-4000-8000-000000000001",
        expiresAt: "2026-07-14T12:30:00Z",
        changeCount: 1,
        summary: ["Complete task Submit application"],
        approvalUrl: "https://ligand.example/assistant/approve?confirmation_id=10000000-0000-4000-8000-000000000001",
      };
    },
    applyChanges: async (request) => {
      captured.push(request);
      return {
        status: "applied",
        changeCount: 1,
        results: [{ type: "complete_task", status: "completed", id: "task-1" }],
      };
    },
  });

  const preview = await invoke(
    handler,
    {
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: {
        name: "preview_ligand_changes",
        arguments: {
          operations: [{ type: "complete_task", taskId: "task-1", expectedVersion: 2 }],
        },
      },
    },
    "valid-token"
  );
  assert.equal(preview.payload.result.structuredContent.changeCount, 1);
  assert.match(
    preview.payload.result.structuredContent.approvalUrl,
    /^https:\/\/ligand\.example\/assistant\/approve/
  );

  const applied = await invoke(
    handler,
    {
      jsonrpc: "2.0",
      id: 22,
      method: "tools/call",
      params: {
        name: "apply_ligand_changes",
        arguments: { confirmationId: "10000000-0000-4000-8000-000000000001" },
      },
    },
    "valid-token"
  );
  assert.equal(applied.payload.result.structuredContent.status, "applied");
  assert.deepEqual(captured[1].input, {
    confirmationId: "10000000-0000-4000-8000-000000000001",
  });
  assert.match(captured[1].requestId, /^[0-9a-f-]{36}$/);
  assert.doesNotMatch(
    JSON.stringify([preview.payload, applied.payload]),
    /token-value|privateNotes|recoveryData/
  );
});
