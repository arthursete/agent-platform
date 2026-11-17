// Start the web channel:  npm run web   then open http://localhost:3000
//
// This file is the wiring. It builds the simulated company, puts the
// Microsoft MCP server in front of it, hands those tools to one agent,
// and puts the web app in front of the agent.

import { serve } from "@hono/node-server";
import { loadMcpTools } from "@platform/core";
import { createMicrosoftServer, createSimulator } from "@platform/integrations";
import { createWebApp } from "./app.js";

const sim = createSimulator();
const tools = await loadMcpTools(createMicrosoftServer(sim));

const app = createWebApp({
  name: "it-agent",
  system:
    "You are the IT agent for Kestrel Freight. You manage staff accounts in Microsoft Entra and devices in Intune, using only the tools provided. " +
    "Look things up before you answer; never guess an id. Some actions need a person's approval: if a tool tells you so, say what you wanted to do and why, and stop. " +
    "Keep replies short. Use light Markdown: a table when listing several records, bold for the names that matter, no headings.",
  tools,
});

const port = Number(process.env.PORT ?? 3000);
// Listen on this machine only. There is no login yet, so it must not be reachable from the network.
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => console.log(`Web chat: http://localhost:${port}`));
