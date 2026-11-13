// @platform/integrations
// The simulated company, plus the Microsoft (Entra, Intune) and HubSpot MCP servers.
export * from "./sim/types.js";
export { buildSeed, DOMAIN, SKU_M365, SKU_POWER_BI } from "./sim/seed.js";
export { createSimulator, SimError } from "./sim/sim.js";
export type { Simulator, SimErrorCode } from "./sim/sim.js";
