// Every test follows the same three beats:
//   arrange  start from a fresh company
//   act      call one function
//   assert   check the company is now what we expect
//
// `beforeEach` gives each test its own simulator, so no test can be
// affected by one that ran before it.

import { beforeEach, describe, expect, it } from "vitest";
import { buildSeed, SKU_M365, SKU_POWER_BI } from "./seed.js";
import { createSimulator, SimError, type SimErrorCode, type Simulator } from "./sim.js";

let sim: Simulator;
beforeEach(() => {
  sim = createSimulator();
});

// Run something that should fail, and return the code it failed with.
function failure(run: () => unknown): SimErrorCode | "did not throw" {
  try {
    run();
  } catch (err) {
    if (err instanceof SimError) return err.code;
    throw err;
  }
  return "did not throw";
}

describe("seed", () => {
  it("builds the same company every time", () => {
    expect(buildSeed()).toEqual(buildSeed());
  });

  it("has 40 users, 57 devices, 10 companies, 30 contacts and 20 deals", () => {
    const s = sim.snapshot();
    expect(s.entra.users).toHaveLength(40);
    expect(s.intune.devices).toHaveLength(57);
    expect(s.hubspot.companies).toHaveLength(10);
    expect(s.hubspot.contacts).toHaveLength(30);
    expect(s.hubspot.deals).toHaveLength(20);
    expect(new Set(s.hubspot.contacts.map((c) => c.email)).size).toBe(30);
  });

  it("contains the leaver: Grace is disabled but still owns five open deals", () => {
    const [grace] = sim.findUsers("grace.lindqvist@kestrelfreight.example");
    expect(grace?.accountEnabled).toBe(false);
    const owner = sim.listOwners().find((o) => o.email === grace?.mail);
    expect(sim.listDeals({ ownerId: owner?.id, openOnly: true })).toHaveLength(5);
  });

  it("has four non-compliant devices and no spare Power BI seats", () => {
    expect(sim.listDevices({ complianceState: "noncompliant" })).toHaveLength(4);
    const powerBi = sim.listLicences().find((l) => l.skuId === SKU_POWER_BI);
    expect(powerBi?.consumedUnits).toBe(powerBi?.totalUnits);
  });

  it("links every record to something that exists", () => {
    const s = sim.snapshot();
    const userIds = new Set(s.entra.users.map((u) => u.id));
    const ownerIds = new Set(s.hubspot.owners.map((o) => o.id));
    const companyIds = new Set(s.hubspot.companies.map((c) => c.id));
    expect(s.entra.users.every((u) => u.managerId === null || userIds.has(u.managerId))).toBe(true);
    expect(s.intune.devices.every((d) => userIds.has(d.userId))).toBe(true);
    expect(s.hubspot.deals.every((d) => ownerIds.has(d.hubspot_owner_id) && companyIds.has(d.companyId))).toBe(true);
    expect(s.hubspot.owners.every((o) => s.entra.users.some((u) => u.mail === o.email))).toBe(true);
  });
});

describe("Entra", () => {
  it("finds users by part of a name, by email and by id", () => {
    expect(sim.findUsers("whitlock").map((u) => u.id)).toEqual(["u-005"]);
    expect(sim.findUsers("SAM.WHITLOCK@kestrelfreight.example")).toHaveLength(1);
    expect(sim.findUsers("u-005")).toHaveLength(1);
    expect(sim.findUsers("nobody")).toEqual([]);
  });

  it("creates a user who can sign in and has no licences yet", () => {
    const created = sim.createUser("it-agent", { firstName: "Noor", lastName: "Haddad", department: "Sales", jobTitle: "Account Executive", managerId: "u-004" });
    expect(created).toMatchObject({ id: "u-041", userPrincipalName: "noor.haddad@kestrelfreight.example", accountEnabled: true, assignedLicenses: [] });
    expect(sim.listUsers()).toHaveLength(41);
  });

  it("refuses a duplicate sign-in name or a manager who does not exist", () => {
    const base = { department: "Sales", jobTitle: "Account Executive" };
    expect(failure(() => sim.createUser("it-agent", { ...base, firstName: "Sam", lastName: "Whitlock" }))).toBe("conflict");
    expect(failure(() => sim.createUser("it-agent", { ...base, firstName: "Noor", lastName: "Haddad", managerId: "u-999" }))).toBe("not_found");
    expect(sim.listUsers()).toHaveLength(40);
  });

  it("disables an account, and doing it twice is harmless", () => {
    sim.disableUser("it-agent", "u-005");
    sim.disableUser("it-agent", "u-005");
    expect(sim.getUser("u-005").accountEnabled).toBe(false);
    expect(failure(() => sim.disableUser("it-agent", "u-999"))).toBe("not_found");
  });

  it("adds and removes group members", () => {
    sim.addUserToGroup("it-agent", "u-005", "g-it");
    expect(sim.listGroups().find((g) => g.id === "g-it")?.memberIds).toContain("u-005");
    expect(failure(() => sim.addUserToGroup("it-agent", "u-005", "g-it"))).toBe("conflict");
    sim.removeUserFromGroup("it-agent", "u-005", "g-it");
    expect(sim.listGroups().find((g) => g.id === "g-it")?.memberIds).not.toContain("u-005");
    expect(failure(() => sim.removeUserFromGroup("it-agent", "u-005", "g-it"))).toBe("not_found");
  });

  it("assigns a licence only while seats are left", () => {
    const noor = sim.createUser("it-agent", { firstName: "Noor", lastName: "Haddad", department: "Sales", jobTitle: "Account Executive" });
    sim.assignLicence("it-agent", noor.id, SKU_M365);
    expect(sim.getUser(noor.id).assignedLicenses).toEqual([{ skuId: SKU_M365 }]);
    expect(failure(() => sim.assignLicence("it-agent", noor.id, SKU_M365))).toBe("conflict"); // already has it
    expect(failure(() => sim.assignLicence("it-agent", noor.id, SKU_POWER_BI))).toBe("conflict"); // none left

    // Free a seat by taking it from someone else, and now it works.
    sim.removeLicence("it-agent", "u-011", SKU_POWER_BI);
    sim.assignLicence("it-agent", noor.id, SKU_POWER_BI);
    expect(sim.getUser(noor.id).assignedLicenses).toHaveLength(2);
  });
});

describe("Intune", () => {
  it("lists devices by user and by compliance", () => {
    expect(sim.listDevices({ userId: "u-005" }).map((d) => d.id)).toEqual(["d-005-l", "d-005-p"]);
    expect(sim.listDevices({ userId: "u-020" })).toHaveLength(1); // engineers have no work phone
  });

  it("locks a device without ending management", () => {
    const d = sim.lockDevice("it-agent", "d-031-l");
    expect(d).toMatchObject({ locked: true, managementState: "managed" });
  });

  it("retires or wipes a device once, and never twice", () => {
    expect(sim.retireDevice("it-agent", "d-005-l").managementState).toBe("retireIssued");
    expect(sim.wipeDevice("it-agent", "d-005-p").managementState).toBe("wipeIssued");
    expect(failure(() => sim.wipeDevice("it-agent", "d-005-l"))).toBe("conflict");
    expect(failure(() => sim.wipeDevice("it-agent", "d-999-l"))).toBe("not_found");
  });
});

describe("HubSpot", () => {
  it("searches contacts and shows a company with its contacts and deals", () => {
    expect(sim.searchContacts("coastalpharma")).toHaveLength(3);
    const page = sim.getCompany("c-004");
    expect(page.company.name).toBe("Coastal Pharma");
    expect(page.contacts).toHaveLength(3);
    expect(page.deals.map((d) => d.id)).toEqual(["dl-007", "dl-008"]);
  });

  it("knows the largest open deal", () => {
    const largest = sim.listDeals({ openOnly: true }).sort((a, b) => b.amount - a.amount)[0];
    expect(largest).toMatchObject({ id: "dl-007", amount: 120000, hubspot_owner_id: "o-4" });
  });

  it("updates a deal and rejects a stage that does not exist", () => {
    expect(sim.updateDeal("crm-agent", "dl-002", { dealstage: "contractsent", amount: 13500 })).toMatchObject({ dealstage: "contractsent", amount: 13500 });
    expect(failure(() => sim.updateDeal("crm-agent", "dl-002", { dealstage: "nearly-there" as never }))).toBe("invalid");
    expect(failure(() => sim.updateDeal("crm-agent", "dl-002", { amount: -1 }))).toBe("invalid");
  });

  it("reassigns a deal to an owner who exists", () => {
    sim.reassignDeal("crm-agent", "dl-007", "o-1");
    expect(sim.getDeal("dl-007").hubspot_owner_id).toBe("o-1");
    expect(failure(() => sim.reassignDeal("crm-agent", "dl-007", "o-1"))).toBe("conflict");
    expect(failure(() => sim.reassignDeal("crm-agent", "dl-007", "o-9"))).toBe("not_found");
  });

  it("adds a note to a deal or a contact, never both or neither", () => {
    const note = sim.addNote("crm-agent", { body: "Handed over from Grace.", dealId: "dl-007" });
    expect(note.id).toBe("n-003");
    expect(sim.listNotes({ dealId: "dl-007" })).toHaveLength(2);
    expect(failure(() => sim.addNote("crm-agent", { body: "x" }))).toBe("invalid");
    expect(failure(() => sim.addNote("crm-agent", { body: "x", dealId: "dl-007", contactId: "ct-001" }))).toBe("invalid");
    expect(failure(() => sim.addNote("crm-agent", { body: "  ", dealId: "dl-007" }))).toBe("invalid");
  });
});

describe("audit log, snapshot and reset", () => {
  it("records every change in order, and nothing for reads or failures", () => {
    sim.findUsers("sam");
    sim.disableUser("it-agent", "u-005");
    failure(() => sim.wipeDevice("it-agent", "d-999-l"));
    sim.wipeDevice("it-agent", "d-005-l");
    expect(sim.auditLog()).toEqual([
      { seq: 1, actor: "it-agent", action: "entra.disableUser", target: "u-005", details: { wasEnabled: true } },
      { seq: 2, actor: "it-agent", action: "intune.wipeDevice", target: "d-005-l", details: { userId: "u-005" } },
    ]);
  });

  it("hands out copies, so editing a result cannot change the company", () => {
    const u = sim.getUser("u-005");
    u.accountEnabled = false;
    const snap = sim.snapshot();
    snap.entra.users.length = 0;
    expect(sim.getUser("u-005").accountEnabled).toBe(true);
    expect(sim.listUsers()).toHaveLength(40);
  });

  it("a snapshot is frozen in time", () => {
    const before = sim.snapshot();
    sim.disableUser("it-agent", "u-005");
    expect(before.entra.users.find((u) => u.id === "u-005")?.accountEnabled).toBe(true);
    expect(sim.snapshot()).not.toEqual(before);
  });

  it("reset puts everything back, including the audit log", () => {
    sim.disableUser("it-agent", "u-005");
    sim.wipeDevice("it-agent", "d-005-l");
    sim.reassignDeal("crm-agent", "dl-007", "o-1");
    sim.createUser("it-agent", { firstName: "Noor", lastName: "Haddad", department: "Sales", jobTitle: "Account Executive" });
    sim.reset();
    expect(sim.snapshot()).toEqual(buildSeed());
  });

  it("two simulators never share state", () => {
    const other = createSimulator();
    sim.disableUser("it-agent", "u-005");
    expect(other.getUser("u-005").accountEnabled).toBe(true);
  });
});
