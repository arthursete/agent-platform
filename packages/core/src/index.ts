// @platform/core
// The harness every agent runs on: the tool loop, the tool contract, the
// approval gate, and the bridge to MCP servers.
export { runAgent } from "./agent.js";
export type { AgentConfig, AgentResult, CreateMessage } from "./agent.js";
export { loadMcpTools } from "./mcp.js";
export type { Tool, ToolOutcome, ToolCallRecord } from "./tool.js";
