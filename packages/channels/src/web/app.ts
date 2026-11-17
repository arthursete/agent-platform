// ============================================================
// The web channel: the first way a person can reach an agent.
//
//   browser page  ->  POST /chat  ->  harness loop  ->  model
//                                          |
//                                   MCP tools  ->  simulator
//
// A channel's whole job is translation: turn "a message arrived" into a
// call to the harness, and turn the result into a reply. Slack and email
// will do the same thing later with different plumbing.
// ============================================================

import { Hono } from "hono";
import { runAgent, type AgentConfig, type AgentResult } from "@platform/core";
import { PAGE } from "./page.js";

type History = AgentResult["messages"];

export function createWebApp(agent: AgentConfig) {
  const app = new Hono();

  // Memory, for now: one conversation history per id, lost on restart.
  const conversations = new Map<string, History>();
  // One request at a time per conversation, so two quick messages cannot
  // both build on the same history and lose each other's turn.
  const queues = new Map<string, Promise<unknown>>();

  app.get("/", (c) => c.html(PAGE));

  app.post("/chat", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const { message, conversationId } = (body ?? {}) as { message?: unknown; conversationId?: unknown };
    if (typeof message !== "string" || message.trim() === "") {
      return c.json({ error: "Send JSON like { \"message\": \"...\" }." }, 400);
    }
    const id = typeof conversationId === "string" && conversations.has(conversationId) ? conversationId : crypto.randomUUID();

    const turn = (queues.get(id) ?? Promise.resolve()).then(async () => {
      const result = await runAgent(agent, conversations.get(id) ?? [], message.trim());
      conversations.set(id, result.messages);
      return result;
    });
    queues.set(id, turn.catch(() => undefined));

    try {
      const result = await turn;
      return c.json({
        conversationId: id,
        reply: result.text,
        // Shown under the reply, so you can see what the agent actually did.
        toolCalls: result.toolCalls.map((t) => ({
          name: t.name,
          input: t.input,
          blocked: t.blocked,
          failed: t.outcome.isError,
          // Only failures carry their text. Successful results can be large.
          ...(t.outcome.isError && !t.blocked ? { detail: t.outcome.text.slice(0, 300) } : {}),
        })),
      });
    } catch (err) {
      console.error(err);
      return c.json({ error: "The agent could not answer. Check the server log." }, 502);
    }
  });

  return app;
}
