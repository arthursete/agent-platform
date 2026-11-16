// These tests go the whole way a real request goes:
//   harness Tool -> MCP client -> MCP server -> simulator
// so they prove the tool, the schema and the bridge all agree.

import { beforeEach, describe, expect, it } from "vitest";
import { loadMcpTools, type Tool } from "@platform/core";
import { SKU_M365, SKU_POWER_BI } from "../sim/seed.js";
import { createSimulator, type Simulator } from "../sim/sim.js";
import { createMicrosoftServer } from "./server.js";

let sim: Simulator;
let tools: Tool[];
beforeEach(async () => {
  sim = createSimulator();
  tools = await loadMcpTools(createMicrosoftServer(sim));
});

async function call(name: string, input: Record<string, unknown> = {}) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  const outcome = await tool.run(input);
  return { ...outcome, data: outcome.isError ? null : JSON.parse(outcome.text) };
}

describe("the tool list", () => {
  it("offers twelve tools, each with a description and an object schema", () => {
    expect(tools.map((t) => t.name)).toEqual([
      "entra_find_user", "entra_list_groups", "entra_list_licences", "entra_create_user",
      "entra_disable_user", "entra_add_user_to_group", "entra_assign_licence",
      "intune_list_devices", "intune_get_device", "intune_lock_device",
      "intune_retire_device", "intune_wipe_device",
    ]);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("marks only retire and wipe as needing approval", () => {
    expect(tools.filter((t) => t.requiresApproval).map((t) => t.name)).toEqual(["intune_retire_device", "intune_wipe_device"]);
  });
});

describe("Entra tools", () => {
  it("finds a user", async () => {
    const { data } = await call("entra_find_user", { query: "whitlock" });
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ id: "u-005", accountEnabled: true });
  });

  it("onboards someone: create, add to group, assign a licence", async () => {
    const { data: user } = await call("entra_create_user", { firstName: "Noor", lastName: "Haddad", department: "Sales", jobTitle: "Account Executive", managerId: "u-004" });
    await call("entra_add_user_to_group", { userId: user.id, groupId: "g-sales" });
    await call("entra_assign_licence", { userId: user.id, skuId: SKU_M365 });
    expect(sim.getUser(user.id).assignedLicenses).toEqual([{ skuId: SKU_M365 }]);
    expect(sim.listGroups().find((g) => g.id === "g-sales")?.memberIds).toContain(user.id);
    expect(sim.auditLog().map((e) => [e.actor, e.action])).toEqual([
      ["it-agent", "entra.createUser"], ["it-agent", "entra.addUserToGroup"], ["it-agent", "entra.assignLicence"],
    ]);
  });

  it("disables an account", async () => {
    await call("entra_disable_user", { userId: "u-005" });
    expect(sim.getUser("u-005").accountEnabled).toBe(false);
  });

  it("lists groups and licences with the ids the other tools need", async () => {
    expect((await call("entra_list_groups")).data).toContainEqual(expect.objectContaining({ id: "g-all-staff", members: 40 }));
    expect((await call("entra_list_licences")).data).toContainEqual(expect.objectContaining({ skuId: SKU_POWER_BI, totalUnits: 5, consumedUnits: 5 }));
  });

  it("returns a readable error, not a crash, when the simulator says no", async () => {
    expect(await call("entra_disable_user", { userId: "u-999" })).toMatchObject({ isError: true, text: expect.stringMatching(/^not_found: /) });
    expect(await call("entra_assign_licence", { userId: "u-005", skuId: SKU_POWER_BI })).toMatchObject({ isError: true, text: expect.stringMatching(/^conflict: /) });
  });

  it("rejects input that does not match the schema, before any code runs", async () => {
    expect((await call("entra_find_user", {})).isError).toBe(true);
    expect((await call("entra_create_user", { firstName: "Noor" })).isError).toBe(true);
    expect(sim.auditLog()).toEqual([]);
  });
});

describe("Intune tools", () => {
  it("lists the four non-compliant devices", async () => {
    const { data } = await call("intune_list_devices", { complianceState: "noncompliant" });
    expect(data.map((d: { id: string }) => d.id).sort()).toEqual(["d-007-l", "d-009-p", "d-022-l", "d-031-l"]);
  });

  it("lists one person's devices and reads one device", async () => {
    expect((await call("intune_list_devices", { userId: "u-005" })).data).toHaveLength(2);
    expect((await call("intune_get_device", { deviceId: "d-031-l" })).data).toMatchObject({ complianceState: "noncompliant" });
  });

  it("rejects a compliance state that does not exist", async () => {
    expect((await call("intune_list_devices", { complianceState: "broken" })).isError).toBe(true);
  });

  it("locks a device", async () => {
    await call("intune_lock_device", { deviceId: "d-031-l" });
    expect(sim.getDevice("d-031-l")).toMatchObject({ locked: true, managementState: "managed" });
  });

  // The tools themselves work. Stopping them is the harness's job, and
  // packages/core/src/agent.test.ts proves it does.
  it("retires and wipes when called directly", async () => {
    await call("intune_retire_device", { deviceId: "d-005-l" });
    await call("intune_wipe_device", { deviceId: "d-005-p" });
    expect(sim.getDevice("d-005-l").managementState).toBe("retireIssued");
    expect(sim.getDevice("d-005-p").managementState).toBe("wipeIssued");
    expect((await call("intune_wipe_device", { deviceId: "d-005-l" })).isError).toBe(true);
  });
});
