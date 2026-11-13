// ============================================================
// The data model: every kind of thing the fake company contains.
//
// Field names are copied from the real APIs wherever possible, so the
// tools we write against the simulator look like tools written against
// the real thing.
//   Entra + Intune -> Microsoft Graph   (accountEnabled, complianceState ...)
//   HubSpot        -> HubSpot CRM v3    (dealname, hubspot_owner_id ...)
//
// Where the simulator simplifies, the comment says so.
// ============================================================

// ---------- Microsoft Entra: who works here ----------

export interface User {
  id: string; // real Graph ids are GUIDs. Ours are readable: "u-005".
  displayName: string;
  userPrincipalName: string; // the sign-in name, e.g. sam.whitlock@kestrelfreight.example
  mail: string;
  jobTitle: string;
  department: string;
  accountEnabled: boolean; // false = cannot sign in. This is what "disable" flips.
  managerId: string | null; // simplified: in Graph, manager is a separate relationship
  assignedLicenses: { skuId: string }[];
}

export interface Group {
  id: string;
  displayName: string;
  description: string;
  memberIds: string[]; // simplified: in Graph, members is a separate relationship
}

export interface Licence {
  skuId: string;
  skuPartNumber: string; // Microsoft's short product code, e.g. "SPB"
  totalUnits: number; // how many seats the company bought
}

// ---------- Microsoft Intune: the devices they use ----------

export type ComplianceState = "compliant" | "noncompliant" | "inGracePeriod";

// A subset of Graph's managementState values. "Issued" means the command
// has been sent to the device. It cannot be taken back.
export type ManagementState = "managed" | "retireIssued" | "wipeIssued";

export interface Device {
  id: string;
  deviceName: string;
  userId: string; // the Entra user this device belongs to
  operatingSystem: "Windows" | "macOS" | "iOS" | "Android";
  osVersion: string;
  complianceState: ComplianceState;
  lastSyncDateTime: string; // when the device last checked in
  managementState: ManagementState;
  locked: boolean; // simulator-only. Real Intune sends a lock command and stores nothing.
}

// ---------- HubSpot: customers and deals ----------

// An owner is a staff member inside HubSpot. They are matched to an Entra
// user by email, which is how offboarding finds a leaver's deals.
export interface Owner {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  archived: boolean;
}

export interface Company {
  id: string;
  name: string;
  domain: string;
  hubspot_owner_id: string;
}

export interface Contact {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  companyId: string; // simplified: HubSpot links these with "associations"
  hubspot_owner_id: string;
}

// HubSpot's default sales pipeline, in order. The last two are closed.
export const DEAL_STAGES = [
  "appointmentscheduled",
  "qualifiedtobuy",
  "presentationscheduled",
  "decisionmakerboughtin",
  "contractsent",
  "closedwon",
  "closedlost",
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export interface Deal {
  id: string;
  dealname: string;
  amount: number;
  dealstage: DealStage;
  companyId: string;
  hubspot_owner_id: string;
}

export interface Note {
  id: string;
  hs_note_body: string;
  dealId: string | null;
  contactId: string | null;
}

// ---------- The audit log ----------

// Every change is recorded here. `seq` is a counter, not a clock time, so
// two identical runs produce identical logs.
export interface AuditEntry {
  seq: number;
  actor: string; // who asked for it, e.g. "it-agent"
  action: string; // e.g. "entra.disableUser"
  target: string; // the id of the thing that changed
  details: Record<string, unknown>;
}

// ---------- Everything, in one object ----------

export interface CompanyState {
  entra: { users: User[]; groups: Group[]; licences: Licence[] };
  intune: { devices: Device[] };
  hubspot: { owners: Owner[]; companies: Company[]; contacts: Contact[]; deals: Deal[]; notes: Note[] };
  audit: AuditEntry[];
}
