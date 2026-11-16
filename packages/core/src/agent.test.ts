// The loop is tested with a FAKE model: a list of scripted replies handed
// out one per call. No network, no cost, and the same result every time.

import { describe, expect, it } from "vitest";
import { runAgent, type CreateMessage } from "./agent.js";
import type { Tool } from "./tool.js";

type Reply = Awaited<ReturnType<CreateMessage>>;

const says = (text: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] }) as unknown as Reply;
const asks = (...calls: { name: string; input: unknown }[]) =>
  ({ stop_reason: "tool_use", content: calls.map((c, i) => ({ type: "tool_use", id: `call-${i}`, ...c })) }) as unknown as Reply;

// Returns the fake, plus a record of every request the loop sent to it.
function script(...replies: Reply[]) {
  const requests: Parameters<CreateMessage>[0][] = [];
  const create: CreateMessage = async (params) => {
    requests.push(structuredClone(params));
    const next = replies.shift();
    if (!next) throw new Error("the fake model ran out of replies");
    return next;
  };
  return { create, requests };
}

function tool(name: string, extra: Partial<Tool> = {}): Tool & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    name,
    description: name,
    inputSchema: { type: "object", properties: {} },
    requiresApproval: false,
    async run(input) {
      calls.push(input);
      return { text: `${name} done`, isError: false };
    },
    calls,
    ...extra,
  };
}

const agent = { name: "test-agent", system: "You are a test." };

describe("the tool loop", () => {
  it("returns the text when the model answers straight away", async () => {
    const { create } = script(says("Hello."));
    const result = await runAgent({ ...agent, tools: [], create }, [], "Hi");
    expect(result).toMatchObject({ text: "Hello.", toolCalls: [], stopReason: "end_turn" });
    expect(result.messages).toHaveLength(2);
  });

  it("runs a tool and sends the result back to the model", async () => {
    const lookup = tool("lookup");
    const { create, requests } = script(asks({ name: "lookup", input: { q: "sam" } }), says("Found Sam."));
    const result = await runAgent({ ...agent, tools: [lookup], create }, [], "Find Sam");
    expect(lookup.calls).toEqual([{ q: "sam" }]);
    expect(result.text).toBe("Found Sam.");
    // The second request ends with our tool result, tied to the request by id.
    expect(requests[1]?.messages.at(-1)).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "call-0", content: "lookup done", is_error: false }],
    });
  });

  it("only shows the model a tool's name, description and schema", async () => {
    const { create, requests } = script(says("ok"));
    await runAgent({ ...agent, tools: [tool("wipe", { requiresApproval: true })], create }, [], "Hi");
    expect(requests[0]?.tools).toEqual([{ name: "wipe", description: "wipe", input_schema: { type: "object", properties: {} } }]);
  });

  it("answers every tool request from one turn in a single message", async () => {
    const a = tool("a");
    const b = tool("b");
    const { create, requests } = script(asks({ name: "a", input: {} }, { name: "b", input: {} }), says("Both done."));
    await runAgent({ ...agent, tools: [a, b], create }, [], "Do both");
    expect(requests[1]?.messages.at(-1)?.content).toHaveLength(2);
  });

  it("refuses a tool that needs approval, and never runs it", async () => {
    const wipe = tool("wipe", { requiresApproval: true });
    const { create } = script(asks({ name: "wipe", input: { deviceId: "d-1" } }), says("I need approval."));
    const result = await runAgent({ ...agent, tools: [wipe], create }, [], "Wipe it");
    expect(wipe.calls).toEqual([]);
    expect(result.toolCalls[0]).toMatchObject({ name: "wipe", blocked: true, outcome: { isError: true } });
  });

  it("reports an unknown tool or a crashing tool instead of ending the run", async () => {
    const broken = tool("broken", { run: async () => { throw new Error("boom"); } });
    const { create } = script(asks({ name: "missing", input: {} }, { name: "broken", input: {} }), says("Sorry."));
    const result = await runAgent({ ...agent, tools: [broken], create }, [], "Go");
    expect(result.toolCalls.map((c) => c.outcome.text)).toEqual(['There is no tool called "missing".', "The tool crashed: boom"]);
    expect(result.text).toBe("Sorry.");
  });

  it("stops after maxSteps if the model never finishes", async () => {
    const again = () => asks({ name: "lookup", input: {} });
    const { create } = script(again(), again(), again());
    const result = await runAgent({ ...agent, tools: [tool("lookup")], create, maxSteps: 3 }, [], "Loop");
    expect(result.stopReason).toBe("max_steps");
  });

  it("keeps earlier turns, so a follow-up question has context", async () => {
    const first = await runAgent({ ...agent, tools: [], create: script(says("Sam is in Sales.")).create }, [], "Where is Sam?");
    const { create, requests } = script(says("Sam Whitlock."));
    await runAgent({ ...agent, tools: [], create }, first.messages, "Full name?");
    expect(requests[0]?.messages).toHaveLength(3);
  });
});
