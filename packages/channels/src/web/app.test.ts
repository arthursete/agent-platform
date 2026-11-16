// Hono apps can be called directly with app.request(), so these tests
// need no port and no browser. The model is faked, as in the harness tests.

import { describe, expect, it } from "vitest";
import type { CreateMessage } from "@platform/core";
import { createWebApp } from "./app.js";

type Reply = Awaited<ReturnType<CreateMessage>>;

function appThatSays(...texts: string[]) {
  const seen: number[] = []; // how many messages the model was sent each time
  const create: CreateMessage = async (params) => {
    seen.push(params.messages.length);
    return { stop_reason: "end_turn", content: [{ type: "text", text: texts.shift() ?? "?" }] } as unknown as Reply;
  };
  return { app: createWebApp({ name: "t", system: "t", tools: [], create }), seen };
}

const post = (app: ReturnType<typeof createWebApp>, body: unknown) =>
  app.request("/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("web channel", () => {
  it("serves the chat page", async () => {
    const res = await appThatSays().app.request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<form");
  });

  it("returns the agent's reply and a conversation id", async () => {
    const res = await post(appThatSays("Hello.").app, { message: "Hi" });
    expect(await res.json()).toEqual({ conversationId: expect.any(String), reply: "Hello.", toolCalls: [] });
  });

  it("remembers earlier turns when the same id is sent back", async () => {
    const { app, seen } = appThatSays("One.", "Two.");
    const first = (await (await post(app, { message: "a" })).json()) as { conversationId: string };
    await post(app, { message: "b", conversationId: first.conversationId });
    expect(seen).toEqual([1, 3]); // second call saw: a, One., b
  });

  it("starts a fresh conversation for an id it has never issued", async () => {
    const { app, seen } = appThatSays("One.", "Two.");
    await post(app, { message: "a" });
    await post(app, { message: "b", conversationId: "made-up" });
    expect(seen).toEqual([1, 1]);
  });

  it("rejects a missing or empty message", async () => {
    const { app } = appThatSays();
    expect((await post(app, {})).status).toBe(400);
    expect((await post(app, { message: "  " })).status).toBe(400);
    expect((await app.request("/chat", { method: "POST", body: "not json" })).status).toBe(400);
  });

  it("answers 502, not a crash, when the model call fails", async () => {
    const app = createWebApp({ name: "t", system: "t", tools: [], create: async () => { throw new Error("down"); } });
    const original = console.error;
    console.error = () => {};
    const res = await post(app, { message: "Hi" });
    console.error = original;
    expect(res.status).toBe(502);
  });
});
