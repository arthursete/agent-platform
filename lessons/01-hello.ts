// ============================================================
// Lesson 1: one request, one response.
//
// Goal: see exactly what goes over the wire and what comes back,
// before we add any cleverness.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";

// The "client" is a thin wrapper around a single HTTP endpoint:
//   POST https://api.anthropic.com/v1/messages
// It reads ANTHROPIC_API_KEY from the environment. The key never goes in code.
const client = new Anthropic();

// Which model answers. A plain string, nothing more.
const MODEL = "claude-opus-5-5";

const response = await client.messages.create({
  model: MODEL,

  // max_tokens is a CEILING on the reply length, not a target.
  // You pay only for tokens actually produced. If the model hits the
  // ceiling mid-sentence, stop_reason will say "max_tokens" (see below).
  max_tokens: 1024,

  // The conversation so far. Right now it is one message from the user.
  // The API is stateless: it remembers nothing between calls. Whatever
  // the model "knows" about this conversation is whatever is in this list.
  messages: [
    { role: "user", content: "Say hello in one sentence, then tell me what you are." },
  ],
});

// ------------------------------------------------------------
// The reply is NOT a string. It is a list of "content blocks".
// Each block has a .type. Today we only care about "text".
// In lesson 3 a new type, "tool_use", will show up in this same list,
// and that is the hook the whole agent hangs on.
// ------------------------------------------------------------
console.log("=== what the model said ===");
for (const block of response.content) {
  if (block.type === "text") {
    console.log(block.text);
  }
}

// stop_reason tells you WHY the model stopped. "end_turn" means it was done.
// Later, "tool_use" will mean "I want you to run something for me."
console.log("\n=== metadata ===");
console.log("stop_reason :", response.stop_reason);
console.log("input tokens:", response.usage.input_tokens);
console.log("output tokens:", response.usage.output_tokens);

// The raw shape, so nothing is hidden. Read this once, carefully.
console.log("\n=== raw response JSON ===");
console.log(JSON.stringify(response, null, 2));
