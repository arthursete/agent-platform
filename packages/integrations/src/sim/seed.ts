// ============================================================
// Seed data: the fake company on day one.
//
// Kestrel Freight is a made-up 40-person logistics company. Everything
// here is written out or built by a fixed rule. Nothing is random, so
// buildSeed() returns exactly the same company every time it is called.
// A benchmark needs that: every run must start from the same place.
//
// Some records are messy on purpose. They give the agents something to find:
//   - Grace Lindqvist has left. Her account is disabled, but she is still in
//     her groups, still holds a licence, and still owns five open deals.
//   - Four devices are non-compliant. One has not checked in for weeks.
//   - Power BI Pro has no spare seats.
// ============================================================

import type { Company, CompanyState, Contact, Deal, DealStage, Device, Group, Owner, User } from "./types.js";

export const DOMAIN = "kestrelfreight.example"; // ".example" can never be a real domain

const id = (prefix: string, n: number) => `${prefix}-${String(n).padStart(3, "0")}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

// [first name, last name, department, job title, manager's row number]
// Row number 1 is the first row. null means nobody (the CEO).
const PEOPLE: [string, string, string, string, number | null][] = [
  ["Priya", "Raman", "Leadership", "Chief Executive Officer", null],
  ["Tom", "Okafor", "Leadership", "Chief Operating Officer", 1],
  ["Elena", "Marsh", "Leadership", "Chief Financial Officer", 1],
  ["Daniel", "Reyes", "Sales", "Head of Sales", 2],
  ["Sam", "Whitlock", "Sales", "Account Executive", 4],
  ["Aisha", "Karim", "Sales", "Account Executive", 4],
  ["Leo", "Tanaka", "Sales", "Account Executive", 4],
  ["Grace", "Lindqvist", "Sales", "Account Executive", 4],
  ["Marcus", "Bell", "Sales", "Sales Development Rep", 4],
  ["Nina", "Petrov", "Sales", "Sales Development Rep", 4],
  ["Owen", "Hart", "Sales", "Sales Operations Analyst", 4],
  ["Ruby", "Castillo", "Sales", "Account Manager", 4],
  ["Hannah", "Cole", "Customer Success", "Head of Customer Success", 2],
  ["Jamal", "Iqbal", "Customer Success", "Customer Success Manager", 13],
  ["Sofia", "Brandt", "Customer Success", "Customer Success Manager", 13],
  ["Ethan", "Moore", "Customer Success", "Support Specialist", 13],
  ["Mei", "Chen", "Customer Success", "Support Specialist", 13],
  ["Callum", "Fraser", "Customer Success", "Onboarding Specialist", 13],
  ["Ingrid", "Solberg", "Engineering", "Head of Engineering", 1],
  ["Ravi", "Menon", "Engineering", "Senior Engineer", 19],
  ["Chloe", "Dubois", "Engineering", "Senior Engineer", 19],
  ["Ben", "Adeyemi", "Engineering", "Engineer", 19],
  ["Yuki", "Sato", "Engineering", "Engineer", 19],
  ["Laura", "Novak", "Engineering", "Engineer", 19],
  ["Patrick", "Doyle", "Engineering", "Engineer", 19],
  ["Zara", "Hussain", "Engineering", "QA Engineer", 19],
  ["Felix", "Wagner", "Engineering", "DevOps Engineer", 19],
  ["Amara", "Nwosu", "Engineering", "Product Manager", 19],
  ["Victor", "Lang", "Operations", "Head of Operations", 2],
  ["Bianca", "Rossi", "Operations", "Dispatch Coordinator", 29],
  ["Kofi", "Mensah", "Operations", "Dispatch Coordinator", 29],
  ["Tessa", "Nguyen", "Operations", "Logistics Analyst", 29],
  ["Dylan", "Price", "Operations", "Office Manager", 29],
  ["Helen", "Park", "Finance", "Finance Manager", 3],
  ["Arjun", "Shah", "Finance", "Accountant", 34],
  ["Molly", "Evans", "Finance", "Payroll Officer", 34],
  ["Isaac", "Green", "Finance", "Financial Analyst", 34],
  ["Nadia", "Farouk", "IT", "IT Manager", 2],
  ["Joel", "Summers", "IT", "Systems Administrator", 38],
  ["Kira", "Volkov", "IT", "Service Desk Analyst", 38],
];

const GRACE = 8; // the leaver
const POWER_BI_USERS = [11, 34, 35, 36, 37]; // Owen in sales ops, plus all of Finance

export const SKU_M365 = "sku-m365-bp";
export const SKU_POWER_BI = "sku-pbi-pro";

function buildUsers(): User[] {
  return PEOPLE.map(([first, last, department, jobTitle, manager], i) => {
    const n = i + 1;
    const address = `${slug(first)}.${slug(last)}@${DOMAIN}`;
    const licences = [{ skuId: SKU_M365 }];
    if (POWER_BI_USERS.includes(n)) licences.push({ skuId: SKU_POWER_BI });
    return {
      id: id("u", n),
      displayName: `${first} ${last}`,
      userPrincipalName: address,
      mail: address,
      jobTitle,
      department,
      accountEnabled: n !== GRACE,
      managerId: manager === null ? null : id("u", manager),
      assignedLicenses: licences,
    };
  });
}

function buildGroups(users: User[]): Group[] {
  const departments = [...new Set(users.map((u) => u.department))];
  const groups: Group[] = departments.map((d) => ({
    id: `g-${d.toLowerCase().replace(/ /g, "-")}`,
    displayName: d,
    description: `Everyone in ${d}`,
    memberIds: users.filter((u) => u.department === d).map((u) => u.id),
  }));
  groups.push({
    id: "g-all-staff",
    displayName: "All Staff",
    description: "Every employee",
    memberIds: users.map((u) => u.id),
  });
  return groups;
}

// Devices that break the "everything is fine" default.
// key = device id, value = [compliance state, last check-in]
const DEVICE_PROBLEMS: Record<string, [Device["complianceState"], string]> = {
  "d-007-l": ["noncompliant", "2026-11-02T08:15:00Z"], // Leo's laptop
  "d-022-l": ["noncompliant", "2026-11-05T17:40:00Z"], // Ben's laptop
  "d-031-l": ["noncompliant", "2026-09-20T06:05:00Z"], // Kofi's laptop: seven weeks silent
  "d-009-p": ["noncompliant", "2026-10-28T12:30:00Z"], // Marcus's phone
  "d-016-l": ["inGracePeriod", "2026-11-10T09:00:00Z"], // Ethan's laptop
  "d-036-l": ["inGracePeriod", "2026-11-11T14:20:00Z"], // Molly's laptop
};
const HEALTHY_SYNC = "2026-11-12T22:00:00Z";

function buildDevices(users: User[]): Device[] {
  const devices: Device[] = [];
  const add = (deviceId: string, deviceName: string, userId: string, os: Device["operatingSystem"], osVersion: string) => {
    const [complianceState, lastSyncDateTime] = DEVICE_PROBLEMS[deviceId] ?? ["compliant", HEALTHY_SYNC];
    devices.push({
      id: deviceId,
      deviceName,
      userId,
      operatingSystem: os,
      osVersion,
      complianceState,
      lastSyncDateTime,
      managementState: "managed",
      locked: false,
    });
  };
  users.forEach((u, i) => {
    const n = i + 1;
    const num = String(n).padStart(3, "0");
    // Everyone has a laptop. Engineering and Leadership use Macs.
    const mac = u.department === "Engineering" || u.department === "Leadership";
    add(`d-${num}-l`, `KF-LT-${num}`, u.id, mac ? "macOS" : "Windows", mac ? "15.1" : "11 24H2");
    // Sales, Leadership and Operations also carry a work phone.
    if (["Sales", "Leadership", "Operations"].includes(u.department)) {
      const ios = n % 2 === 0;
      add(`d-${num}-p`, `KF-PH-${num}`, u.id, ios ? "iOS" : "Android", ios ? "18.1" : "15");
    }
  });
  return devices;
}

// The five people who own customers in HubSpot. Grace is one of them.
const OWNER_ROWS = [5, 6, 7, 8, 12];

function buildOwners(users: User[]): Owner[] {
  return OWNER_ROWS.map((row, i) => {
    const u = users[row - 1]!;
    const [firstName, lastName] = u.displayName.split(" ") as [string, string];
    return { id: `o-${i + 1}`, email: u.mail, firstName, lastName, archived: false };
  });
}

// [name, domain]. Company n is owned by owner ((n - 1) mod 5) + 1.
const COMPANIES: [string, string][] = [
  ["Harbourline Logistics", "harbourline.example"],
  ["Brightwater Foods", "brightwaterfoods.example"],
  ["Summit Building Supplies", "summitsupplies.example"],
  ["Coastal Pharma", "coastalpharma.example"],
  ["Ironbark Mining Services", "ironbarkmining.example"],
  ["Redgum Furniture", "redgumfurniture.example"],
  ["Pacific Cold Storage", "pacificcold.example"],
  ["Outback Auto Parts", "outbackauto.example"],
  ["Greenfield Organics", "greenfieldorganics.example"],
  ["Meridian Medical Devices", "meridianmedical.example"],
];

function buildCompanies(): Company[] {
  return COMPANIES.map(([name, domain], i) => ({
    id: id("c", i + 1),
    name,
    domain,
    hubspot_owner_id: `o-${(i % 5) + 1}`,
  }));
}

// Three contacts per company. Six first names and five last names give
// thirty different pairs, because 6 and 5 share no common factor.
const FIRST = ["Alex", "Jordan", "Riley", "Morgan", "Casey", "Taylor"];
const LAST = ["Bennett", "Osei", "Fitzgerald", "Yamamoto", "Kowalski"];

function buildContacts(companies: Company[]): Contact[] {
  const contacts: Contact[] = [];
  companies.forEach((company, c) => {
    for (let k = 0; k < 3; k++) {
      const n = c * 3 + k;
      const firstname = FIRST[n % 6]!;
      const lastname = LAST[n % 5]!;
      contacts.push({
        id: id("ct", n + 1),
        firstname,
        lastname,
        email: `${slug(firstname)}.${slug(lastname)}@${company.domain}`,
        companyId: company.id,
        hubspot_owner_id: company.hubspot_owner_id,
      });
    }
  });
  return contacts;
}

// [company number, deal name, amount, stage, owner number]
const DEALS: [number, string, number, DealStage, number][] = [
  [1, "Harbourline: interstate contract", 84000, "contractsent", 1],
  [1, "Harbourline: warehouse add-on", 12000, "qualifiedtobuy", 1],
  [2, "Brightwater: chilled freight", 46000, "presentationscheduled", 2],
  [2, "Brightwater: renewal 2027", 30000, "closedwon", 2],
  [3, "Summit: pallet network", 58000, "decisionmakerboughtin", 3],
  [3, "Summit: trial lane", 6500, "closedlost", 3],
  [4, "Coastal Pharma: cold chain", 120000, "contractsent", 4],
  [4, "Coastal Pharma: returns", 18000, "appointmentscheduled", 4],
  [5, "Ironbark: site deliveries", 95000, "presentationscheduled", 5],
  [5, "Ironbark: oversize loads", 40000, "qualifiedtobuy", 5],
  [6, "Redgum: showroom runs", 15000, "closedwon", 1],
  [6, "Redgum: national rollout", 67000, "decisionmakerboughtin", 1],
  [7, "Pacific Cold: overflow storage", 52000, "qualifiedtobuy", 2],
  [8, "Outback Auto: parts express", 28000, "appointmentscheduled", 3],
  [8, "Outback Auto: dealer network", 73000, "presentationscheduled", 3],
  [9, "Greenfield: farm pickups", 22000, "qualifiedtobuy", 4],
  [9, "Greenfield: market deliveries", 9000, "closedwon", 4],
  [10, "Meridian: device distribution", 88000, "decisionmakerboughtin", 4],
  [10, "Meridian: urgent courier", 14000, "appointmentscheduled", 5],
  [7, "Pacific Cold: renewal 2027", 35000, "contractsent", 4],
];

function buildDeals(): Deal[] {
  return DEALS.map(([company, dealname, amount, dealstage, owner], i) => ({
    id: id("dl", i + 1),
    dealname,
    amount,
    dealstage,
    companyId: id("c", company),
    hubspot_owner_id: `o-${owner}`,
  }));
}

export function buildSeed(): CompanyState {
  const users = buildUsers();
  const companies = buildCompanies();
  return {
    entra: {
      users,
      groups: buildGroups(users),
      licences: [
        { skuId: SKU_M365, skuPartNumber: "SPB", totalUnits: 42 }, // 40 used, 2 spare
        { skuId: SKU_POWER_BI, skuPartNumber: "POWER_BI_PRO", totalUnits: 5 }, // 5 used, none spare
      ],
    },
    intune: { devices: buildDevices(users) },
    hubspot: {
      owners: buildOwners(users),
      companies,
      contacts: buildContacts(companies),
      deals: buildDeals(),
      notes: [
        { id: "n-001", hs_note_body: "Legal reviewing the contract. Expect signature by end of November.", dealId: "dl-007", contactId: null },
        { id: "n-002", hs_note_body: "Prefers email over phone. Do not call before 10am.", dealId: null, contactId: "ct-013" },
      ],
    },
    audit: [],
  };
}
