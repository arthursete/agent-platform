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

import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { runAgent, type AgentConfig, type AgentEvent, type AgentResult } from "@platform/core";

// The page is a plain HTML file next to this one, read once at startup.
const PAGE = readFileSync(new URL("./page.html", import.meta.url), "utf8");

type History = AgentResult["messages"];

export function createWebApp(agent: AgentConfig) {
  const app = new Hono();

  // Memory, for now: one conversation history per id, lost on restart.
  const conversations = new Map<string, History>();
  // One request at a time per conversation, so two quick messages cannot
  // both build on the same history and lose each other's turn.
  const queues = new Map<string, Promise<unknown>>();

  app.get("/", (c) => c.html(PAGE));

  // Take one turn of one conversation, reporting progress as it happens.
  function takeTurn(id: string, message: string, onEvent: (e: AgentEvent) => void) {
    const turn = (queues.get(id) ?? Promise.resolve()).then(async () => {
      const result = await runAgent(agent, conversations.get(id) ?? [], message, onEvent);
      conversations.set(id, result.messages);
      return result;
    });
    queues.set(id, turn.catch(() => undefined));
    return turn;
  }

  const summary = (id: string, result: AgentResult) => ({
    conversationId: id,
    reply: result.text,
    toolCalls: result.toolCalls.map((t) => ({
      name: t.name,
      input: t.input,
      blocked: t.blocked,
      failed: t.outcome.isError && !t.blocked,
      // Only failures carry their text. Successful results can be large.
      ...(t.outcome.isError && !t.blocked ? { detail: t.outcome.text.slice(0, 300) } : {}),
    })),
  });

  app.post("/chat", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const { message, conversationId } = (body ?? {}) as { message?: unknown; conversationId?: unknown };
    if (typeof message !== "string" || message.trim() === "") {
      return c.json({ error: "Send JSON like { \"message\": \"...\" }." }, 400);
    }
    const id = typeof conversationId === "string" && conversations.has(conversationId) ? conversationId : crypto.randomUUID();

    // The page asks for a stream, so it can show each lookup and each word
    // as it happens. Anything else (curl, tests) gets one JSON answer.
    if (c.req.header("accept")?.includes("text/event-stream")) {
      return streamSSE(c, async (stream) => {
        // Events are sent one after another, in order, through this chain.
        let sending: Promise<unknown> = Promise.resolve();
        const send = (data: unknown) => {
          sending = sending.then(() => stream.writeSSE({ data: JSON.stringify(data) })).catch(() => undefined);
        };
        try {
          const result = await takeTurn(id, message.trim(), send);
          send({ type: "done", ...summary(id, result) });
        } catch (err) {
          console.error(err);
          send({ type: "error", message: "The agent could not answer. Check the server log." });
        }
        await sending;
      });
    }

    try {
      return c.json(summary(id, await takeTurn(id, message.trim(), () => {})));
    } catch (err) {
      console.error(err);
      return c.json({ error: "The agent could not answer. Check the server log." }, 502);
    }
  });

  return app;
}
