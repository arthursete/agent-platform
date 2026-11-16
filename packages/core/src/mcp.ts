// ============================================================
// The bridge between an MCP server and the harness.
//
// An MCP server offers tools in a standard format. This file connects to
// one, asks "what tools do you have?", and wraps each answer as a harness
// Tool, so the loop in agent.ts never needs to know MCP exists.
//
// Server and harness run in the same process here, joined by an in-memory
// pipe. Swap the pipe for stdio or HTTP and the server could run anywhere.
// ============================================================

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "./tool.js";

// Anything with connect() will do, so core does not depend on the server class.
interface ConnectableServer {
  connect(transport: Transport): Promise<void>;
}

export async function loadMcpTools(server: ConnectableServer): Promise<Tool[]> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "platform-harness", version: "0.0.0" });
  await server.connect(serverSide);
  await client.connect(clientSide);

  const { tools } = await client.listTools();
  return tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: t.inputSchema,
    // Our own flag, carried in MCP's free-form `_meta` field.
    requiresApproval: t._meta?.requiresApproval === true,
    async run(input) {
      const result = await client.callTool({ name: t.name, arguments: input as Record<string, unknown> });
      const blocks = Array.isArray(result.content) ? result.content : [];
      const text = blocks
        .filter((b): b is { type: "text"; text: string } => b?.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { text, isError: result.isError === true };
    },
  }));
}
