// ============================================================
// The Microsoft MCP server: Entra (people) and Intune (devices).
//
// Each tool is a thin wrapper:
//   name + description   all the model knows about it, so they say WHEN to use it
//   inputSchema          written with zod, checked before our code runs
//   handler              calls one simulator function and returns short text
//
// Two tools cannot be undone (retire, wipe). They carry
// `_meta.requiresApproval`, which the harness reads and enforces.
// ============================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimError, type Simulator } from "../sim/sim.js";

type Reply = { content: { type: "text"; text: string }[]; isError?: boolean };

// Results go back as compact JSON. Everything returned is read by the
// model and costs tokens, so tools return only what is useful.
const ok = (data: unknown): Reply => ({ content: [{ type: "text", text: JSON.stringify(data) }] });

// Run a simulator call. An expected failure (no such user, no seats left)
// becomes an error RESULT the model can read and react to, not a crash.
function attempt(run: () => unknown): Reply {
  try {
    return ok(run());
  } catch (err) {
    if (err instanceof SimError) return { content: [{ type: "text", text: `${err.code}: ${err.message}` }], isError: true };
    throw err;
  }
}

const APPROVAL = { requiresApproval: true };

export function createMicrosoftServer(sim: Simulator, actor = "it-agent"): McpServer {
  const server = new McpServer({ name: "microsoft", version: "0.0.0" });

  // ---------- Entra ----------

  server.registerTool(
    "entra_find_user",
    {
      description:
        "Search staff by part of a name, an email address or a user id. Call this first whenever a request names a person, to get their id for the other tools.",
      inputSchema: { query: z.string().min(1).describe("Part of a name, an email, or an id like u-005") },
    },
    ({ query }) => attempt(() => sim.findUsers(query)),
  );

  server.registerTool(
    "entra_list_groups",
    { description: "List every group with its id and member count. Call this to find a group id before adding someone to a group." },
    () => attempt(() => sim.listGroups().map((g) => ({ id: g.id, displayName: g.displayName, members: g.memberIds.length }))),
  );

  server.registerTool(
    "entra_list_licences",
    { description: "List licence products with total and used seats. Call this before assigning a licence, to get the skuId and check a seat is free." },
    () => attempt(() => sim.listLicences()),
  );

  server.registerTool(
    "entra_create_user",
    {
      description: "Create a new staff account that can sign in. It starts with no groups and no licences. Use when onboarding someone.",
      inputSchema: {
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        department: z.string().min(1),
        jobTitle: z.string().min(1),
        managerId: z.string().optional().describe("User id of their manager, e.g. u-004"),
      },
    },
    (input) => attempt(() => sim.createUser(actor, input)),
  );

  server.registerTool(
    "entra_disable_user",
    {
      description: "Block a user from signing in. Their data, groups and licences are kept. Use when someone leaves or an account is compromised.",
      inputSchema: { userId: z.string() },
    },
    ({ userId }) => attempt(() => sim.disableUser(actor, userId)),
  );

  server.registerTool(
    "entra_add_user_to_group",
    {
      description: "Add a user to a group. Get the group id from entra_list_groups first.",
      inputSchema: { userId: z.string(), groupId: z.string() },
    },
    ({ userId, groupId }) => attempt(() => sim.addUserToGroup(actor, userId, groupId)),
  );

  server.registerTool(
    "entra_assign_licence",
    {
      description: "Give a user one seat of a licence product. Fails if no seats are left. Get the skuId from entra_list_licences first.",
      inputSchema: { userId: z.string(), skuId: z.string() },
    },
    ({ userId, skuId }) => attempt(() => sim.assignLicence(actor, userId, skuId)),
  );

  // ---------- Intune ----------

  server.registerTool(
    "intune_list_devices",
    {
      description:
        "List managed devices, optionally only one user's or only those in one compliance state. Call this to find non-compliant devices or everything a person uses.",
      inputSchema: {
        userId: z.string().optional(),
        complianceState: z.enum(["compliant", "noncompliant", "inGracePeriod"]).optional(),
      },
    },
    (filter) => attempt(() => sim.listDevices(filter)),
  );

  server.registerTool(
    "intune_get_device",
    {
      description: "Get one device: its owner, operating system, compliance state and when it last checked in.",
      inputSchema: { deviceId: z.string() },
    },
    ({ deviceId }) => attempt(() => sim.getDevice(deviceId)),
  );

  server.registerTool(
    "intune_lock_device",
    {
      description: "Lock a device's screen remotely. Nothing is deleted and the owner can unlock it. Use for a lost device or as a first response.",
      inputSchema: { deviceId: z.string() },
    },
    ({ deviceId }) => attempt(() => sim.lockDevice(actor, deviceId)),
  );

  server.registerTool(
    "intune_retire_device",
    {
      description: "Remove company data and management from a device, leaving personal data. Cannot be undone. Use when a device leaves the company.",
      inputSchema: { deviceId: z.string() },
      annotations: { destructiveHint: true },
      _meta: APPROVAL,
    },
    ({ deviceId }) => attempt(() => sim.retireDevice(actor, deviceId)),
  );

  server.registerTool(
    "intune_wipe_device",
    {
      description: "Erase a device completely and return it to factory settings. Cannot be undone. Use only for a lost or stolen device.",
      inputSchema: { deviceId: z.string() },
      annotations: { destructiveHint: true },
      _meta: APPROVAL,
    },
    ({ deviceId }) => attempt(() => sim.wipeDevice(actor, deviceId)),
  );

  return server;
}
