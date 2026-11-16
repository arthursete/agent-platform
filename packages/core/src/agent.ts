// ============================================================
// Lesson 4, as real code: the tool loop.
//
// Lesson 3 stopped when the model ASKED for a tool. This file answers it:
//
//   1. send the conversation and the tool menu to the model
//   2. if it answers in plain text, we are done
//   3. if it asks for tools, run each one (or refuse it)
//   4. append the results to the conversation and go back to step 1
//
// That loop is what turns a chat model into an agent. Everything else in
// the platform (routers, skills, channels) is built around it.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import type { Tool, ToolCallRecord, ToolOutcome } from "./tool.js";

type Message = Anthropic.Beta.BetaMessageParam;

// The one model call the loop needs. Tests pass a fake here, so the loop
// can be tested without the network and without spending money.
export type CreateMessage = (
  params: Anthropic.Beta.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Beta.BetaMessage>;

export interface AgentConfig {
  name: string; // shows up in logs, e.g. "it-agent"
  system: string; // the agent's identity and limits
  tools: Tool[];
  model?: string;
  maxSteps?: number; // a hard stop, so a confused model cannot loop forever
  create?: CreateMessage;
}

export interface AgentResult {
  text: string; // the final answer
  messages: Message[]; // the full conversation. Pass it back in to continue.
  toolCalls: ToolCallRecord[];
  stopReason: string;
}

const DEFAULT_MODEL = "claude-opus-5-5";

let sharedClient: Anthropic | undefined;
const defaultCreate: CreateMessage = (params) => {
  sharedClient ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  return sharedClient.beta.messages.create(params);
};

export async function runAgent(config: AgentConfig, history: Message[], userText: string): Promise<AgentResult> {
  const create = config.create ?? defaultCreate;
  const maxSteps = config.maxSteps ?? 12;
  const messages: Message[] = [...history, { role: "user", content: userText }];
  const toolCalls: ToolCallRecord[] = [];

  // The menu. Only the three fields the model is allowed to see.
  const menu: Anthropic.Beta.BetaTool[] = config.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Beta.BetaTool["input_schema"],
  }));

  for (let step = 0; step < maxSteps; step++) {
    const response = await create({
      model: config.model ?? DEFAULT_MODEL,
      max_tokens: 16000,
      system: config.system,
      tools: menu,
      messages,
      // If a safety classifier declines the request, the server retries on
      // another model instead of failing. Same setting as the lessons.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    // Always append the WHOLE content, not only the text. The tool_use and
    // thinking blocks must go back exactly as they arrived.
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { text: text || fallbackText(response.stop_reason), messages, toolCalls, stopReason: response.stop_reason ?? "unknown" };
    }

    // The model asked for one or more tools. Answer EVERY request, in one
    // user message. Lesson 3 part B showed the API rejects anything else.
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const { outcome, blocked } = await runOne(config.tools, block.name, block.input);
      toolCalls.push({ name: block.name, input: block.input, outcome, blocked });
      results.push({ type: "tool_result", tool_use_id: block.id, content: outcome.text, is_error: outcome.isError });
    }
    messages.push({ role: "user", content: results });
  }

  return { text: `Stopped after ${maxSteps} steps without finishing.`, messages, toolCalls, stopReason: "max_steps" };
}

// Decide what happens to one tool request. This is where the rules live.
async function runOne(tools: Tool[], name: string, input: unknown): Promise<{ outcome: ToolOutcome; blocked: boolean }> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return { outcome: { text: `There is no tool called "${name}".`, isError: true }, blocked: false };
  }

  // THE APPROVAL GATE. For now it only refuses. In week 3 it will pause and
  // ask a person. Either way the check is code: no prompt can talk past it.
  if (tool.requiresApproval) {
    return {
      outcome: {
        text: `Not run: "${name}" needs a person's approval and approvals are not set up yet. Tell the user what you wanted to do and why.`,
        isError: true,
      },
      blocked: true,
    };
  }

  try {
    return { outcome: await tool.run(input), blocked: false };
  } catch (err) {
    // A crash in one tool must not end the run. Report it and carry on.
    const message = err instanceof Error ? err.message : String(err);
    return { outcome: { text: `The tool crashed: ${message}`, isError: true }, blocked: false };
  }
}

function fallbackText(stopReason: string | null): string {
  if (stopReason === "refusal") return "The model declined this request.";
  if (stopReason === "max_tokens") return "The reply was cut off because it got too long.";
  return "(no reply)";
}
