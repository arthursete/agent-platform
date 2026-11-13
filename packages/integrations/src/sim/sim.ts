// ============================================================
// The simulator: functions that read and change the fake company.
//
// Three rules hold everywhere in this file:
//   1. Reads hand back COPIES. A caller can never change the company by
//      editing what it was given. Changes go through a change function.
//   2. Every change function takes `actor` (who asked) and writes one
//      line to the audit log.
//   3. Anything that cannot be done throws a SimError with a code and a
//      sentence a person (or a model) can act on.
//
// The simulator does NOT decide whether an action is allowed. Wiping a
// laptop needs approval, but enforcing that is the harness's job. This
// file is only "the systems".
// ============================================================

import { buildSeed, DOMAIN } from "./seed.js";
import { DEAL_STAGES } from "./types.js";
import type { CompanyState, ComplianceState, Contact, Deal, DealStage, Device, Note, User } from "./types.js";

export type SimErrorCode = "not_found" | "conflict" | "invalid";

export class SimError extends Error {
  constructor(
    public code: SimErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SimError";
  }
}

const copy = <T>(value: T): T => structuredClone(value);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const isOpen = (deal: Deal) => deal.dealstage !== "closedwon" && deal.dealstage !== "closedlost";

export function createSimulator(seed: () => CompanyState = buildSeed) {
  let state = seed();

  // ---------- helpers that return the LIVE record, for internal use ----------

  const log = (actor: string, action: string, target: string, details: Record<string, unknown> = {}) => {
    state.audit.push({ seq: state.audit.length + 1, actor, action, target, details });
  };
  const find = <T extends { id: string }>(list: T[], id: string, what: string): T => {
    const item = list.find((x) => x.id === id);
    if (!item) throw new SimError("not_found", `No ${what} with id "${id}".`);
    return item;
  };
  const user = (id: string) => find(state.entra.users, id, "user");
  const group = (id: string) => find(state.entra.groups, id, "group");
  const device = (id: string) => find(state.intune.devices, id, "device");
  const deal = (id: string) => find(state.hubspot.deals, id, "deal");
  const owner = (id: string) => find(state.hubspot.owners, id, "owner");
  const licence = (skuId: string) => {
    const item = state.entra.licences.find((l) => l.skuId === skuId);
    if (!item) throw new SimError("not_found", `No licence with skuId "${skuId}".`);
    return item;
  };
  const seatsUsed = (skuId: string) =>
    state.entra.users.filter((u) => u.assignedLicenses.some((l) => l.skuId === skuId)).length;

  return {
    // ========================================================
    // Entra: reads
    // ========================================================

    getUser: (id: string) => copy(user(id)),

    /** Search by id, sign-in name or email (exact), or by part of the display name. */
    findUsers(query: string) {
      const q = query.trim().toLowerCase();
      return copy(
        state.entra.users.filter(
          (u) => same(u.id, q) || same(u.userPrincipalName, q) || same(u.mail, q) || u.displayName.toLowerCase().includes(q),
        ),
      );
    },

    listUsers(filter: { department?: string; enabledOnly?: boolean } = {}) {
      return copy(
        state.entra.users.filter(
          (u) => (!filter.department || same(u.department, filter.department)) && (!filter.enabledOnly || u.accountEnabled),
        ),
      );
    },

    listGroups: () => copy(state.entra.groups),

    /** Every licence, with how many seats are taken. */
    listLicences: () => state.entra.licences.map((l) => ({ ...l, consumedUnits: seatsUsed(l.skuId) })),

    // ========================================================
    // Entra: changes
    // ========================================================

    createUser(actor: string, input: { firstName: string; lastName: string; department: string; jobTitle: string; managerId?: string | null }) {
      const clean = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
      if (!clean(input.firstName) || !clean(input.lastName)) throw new SimError("invalid", "firstName and lastName are required.");
      if (input.managerId) user(input.managerId); // throws if the manager does not exist
      const address = `${clean(input.firstName)}.${clean(input.lastName)}@${DOMAIN}`;
      if (state.entra.users.some((u) => same(u.userPrincipalName, address))) {
        throw new SimError("conflict", `A user with sign-in name ${address} already exists.`);
      }
      const created: User = {
        // Users are never deleted, only disabled, so the count is a safe next id.
        id: `u-${String(state.entra.users.length + 1).padStart(3, "0")}`,
        displayName: `${input.firstName} ${input.lastName}`,
        userPrincipalName: address,
        mail: address,
        jobTitle: input.jobTitle,
        department: input.department,
        accountEnabled: true,
        managerId: input.managerId ?? null,
        assignedLicenses: [],
      };
      state.entra.users.push(created);
      log(actor, "entra.createUser", created.id, { userPrincipalName: address });
      return copy(created);
    },

    /** Block sign-in. Safe to call twice: the account just stays disabled. */
    disableUser(actor: string, userId: string) {
      const u = user(userId);
      const wasEnabled = u.accountEnabled;
      u.accountEnabled = false;
      log(actor, "entra.disableUser", userId, { wasEnabled });
      return copy(u);
    },

    addUserToGroup(actor: string, userId: string, groupId: string) {
      user(userId);
      const g = group(groupId);
      if (g.memberIds.includes(userId)) throw new SimError("conflict", `User ${userId} is already in group ${groupId}.`);
      g.memberIds.push(userId);
      log(actor, "entra.addUserToGroup", userId, { groupId });
      return copy(g);
    },

    removeUserFromGroup(actor: string, userId: string, groupId: string) {
      const g = group(groupId);
      if (!g.memberIds.includes(userId)) throw new SimError("not_found", `User ${userId} is not in group ${groupId}.`);
      g.memberIds = g.memberIds.filter((m) => m !== userId);
      log(actor, "entra.removeUserFromGroup", userId, { groupId });
      return copy(g);
    },

    assignLicence(actor: string, userId: string, skuId: string) {
      const u = user(userId);
      const l = licence(skuId);
      if (u.assignedLicenses.some((x) => x.skuId === skuId)) throw new SimError("conflict", `User ${userId} already has ${l.skuPartNumber}.`);
      if (seatsUsed(skuId) >= l.totalUnits) {
        throw new SimError("conflict", `No ${l.skuPartNumber} seats left (${l.totalUnits} of ${l.totalUnits} in use). Free one up first.`);
      }
      u.assignedLicenses.push({ skuId });
      log(actor, "entra.assignLicence", userId, { skuId });
      return copy(u);
    },

    removeLicence(actor: string, userId: string, skuId: string) {
      const u = user(userId);
      if (!u.assignedLicenses.some((x) => x.skuId === skuId)) throw new SimError("not_found", `User ${userId} does not have licence ${skuId}.`);
      u.assignedLicenses = u.assignedLicenses.filter((x) => x.skuId !== skuId);
      log(actor, "entra.removeLicence", userId, { skuId });
      return copy(u);
    },

    // ========================================================
    // Intune: reads
    // ========================================================

    getDevice: (id: string) => copy(device(id)),

    listDevices(filter: { userId?: string; complianceState?: ComplianceState } = {}) {
      return copy(
        state.intune.devices.filter(
          (d) => (!filter.userId || d.userId === filter.userId) && (!filter.complianceState || d.complianceState === filter.complianceState),
        ),
      );
    },

    // ========================================================
    // Intune: changes
    // ========================================================

    /** Lock the screen. The device stays managed and keeps its data. */
    lockDevice(actor: string, deviceId: string) {
      const d = device(deviceId);
      d.locked = true;
      log(actor, "intune.lockDevice", deviceId);
      return copy(d);
    },

    /** Remove company data and management. Personal data stays. Cannot be undone. */
    retireDevice(actor: string, deviceId: string) {
      return endManagement(actor, deviceId, "retireIssued", "intune.retireDevice");
    },

    /** Factory reset. Everything on the device is erased. Cannot be undone. */
    wipeDevice(actor: string, deviceId: string) {
      return endManagement(actor, deviceId, "wipeIssued", "intune.wipeDevice");
    },

    // ========================================================
    // HubSpot: reads
    // ========================================================

    listOwners: () => copy(state.hubspot.owners),

    searchContacts(query: string): Contact[] {
      const q = query.trim().toLowerCase();
      return copy(
        state.hubspot.contacts.filter(
          (c) => same(c.id, q) || c.email.toLowerCase().includes(q) || `${c.firstname} ${c.lastname}`.toLowerCase().includes(q),
        ),
      );
    },

    /** A company with its contacts and deals, the way a CRM page shows it. */
    getCompany(id: string) {
      const company = find(state.hubspot.companies, id, "company");
      return copy({
        company,
        contacts: state.hubspot.contacts.filter((c) => c.companyId === id),
        deals: state.hubspot.deals.filter((d) => d.companyId === id),
      });
    },

    listCompanies: () => copy(state.hubspot.companies),

    getDeal: (id: string) => copy(deal(id)),

    listDeals(filter: { ownerId?: string; openOnly?: boolean } = {}) {
      return copy(
        state.hubspot.deals.filter((d) => (!filter.ownerId || d.hubspot_owner_id === filter.ownerId) && (!filter.openOnly || isOpen(d))),
      );
    },

    listNotes(filter: { dealId?: string; contactId?: string } = {}) {
      return copy(
        state.hubspot.notes.filter((n) => (!filter.dealId || n.dealId === filter.dealId) && (!filter.contactId || n.contactId === filter.contactId)),
      );
    },

    // ========================================================
    // HubSpot: changes
    // ========================================================

    updateDeal(actor: string, dealId: string, changes: { amount?: number; dealstage?: DealStage }) {
      const d = deal(dealId);
      if (changes.dealstage !== undefined && !DEAL_STAGES.includes(changes.dealstage)) {
        throw new SimError("invalid", `"${changes.dealstage}" is not a deal stage. Use one of: ${DEAL_STAGES.join(", ")}.`);
      }
      if (changes.amount !== undefined && !(changes.amount >= 0)) throw new SimError("invalid", "amount must be zero or more.");
      if (changes.amount !== undefined) d.amount = changes.amount;
      if (changes.dealstage !== undefined) d.dealstage = changes.dealstage;
      log(actor, "hubspot.updateDeal", dealId, changes);
      return copy(d);
    },

    reassignDeal(actor: string, dealId: string, newOwnerId: string) {
      const d = deal(dealId);
      owner(newOwnerId);
      const from = d.hubspot_owner_id;
      if (from === newOwnerId) throw new SimError("conflict", `Deal ${dealId} is already owned by ${newOwnerId}.`);
      d.hubspot_owner_id = newOwnerId;
      log(actor, "hubspot.reassignDeal", dealId, { from, to: newOwnerId });
      return copy(d);
    },

    addNote(actor: string, input: { body: string; dealId?: string; contactId?: string }) {
      if (!input.body.trim()) throw new SimError("invalid", "A note needs some text.");
      if (!input.dealId === !input.contactId) throw new SimError("invalid", "Attach the note to a deal or a contact, one of the two.");
      if (input.dealId) deal(input.dealId);
      if (input.contactId) find(state.hubspot.contacts, input.contactId, "contact");
      const note: Note = {
        id: `n-${String(state.hubspot.notes.length + 1).padStart(3, "0")}`,
        hs_note_body: input.body,
        dealId: input.dealId ?? null,
        contactId: input.contactId ?? null,
      };
      state.hubspot.notes.push(note);
      log(actor, "hubspot.addNote", note.id, { dealId: note.dealId, contactId: note.contactId });
      return copy(note);
    },

    // ========================================================
    // For the benchmark
    // ========================================================

    /** A full copy of the company right now. The scorer compares this with what a task expected. */
    snapshot: (): CompanyState => copy(state),

    /** The audit log so far. */
    auditLog: () => copy(state.audit),

    /** Throw everything away and start again from the seed. Run between benchmark tasks. */
    reset() {
      state = seed();
    },
  };

  // Retire and wipe share everything except the state they leave behind.
  function endManagement(actor: string, deviceId: string, next: Device["managementState"], action: string) {
    const d = device(deviceId);
    if (d.managementState !== "managed") {
      throw new SimError("conflict", `Device ${deviceId} is already ${d.managementState}. Nothing more can be done to it.`);
    }
    d.managementState = next;
    log(actor, action, deviceId, { userId: d.userId });
    return copy(d);
  }
}

export type Simulator = ReturnType<typeof createSimulator>;
