// ============================================================
// Lesson 2: memory across turns (plus one lesson the API forced on us).
//
// Planned concept : the API remembers NOTHING. The harness owns the
//                   conversation, and "memory" is resending the list.
// Unplanned       : a reply can be a REFUSAL with empty content.
//                   Always check stop_reason before reading content,
//                   and enable the server-side fallback so a classifier
//                   false positive does not kill the conversation.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

// ------------------------------------------------------------
// PART A: the planned lesson.
// ------------------------------------------------------------

// THE central data structure of every harness: the conversation.
// A plain array. It is the agent's entire memory. Nothing else exists.
// We use the Beta types because the fallback feature lives on the beta
// endpoint. Rule from the SDK docs: do not mix beta and non-beta types
// inside one messages array.
const messages: Anthropic.Beta.BetaMessageParam[] = [];

const usageLog: { turn: number; input: number; output: number; historyLength: number }[] = [];

async function ask(userText: string): Promise<string> {
  // 1. Append the user's turn.
  messages.push({ role: "user", content: userText });

  // 2. Send the ENTIRE history. Every time. Not just the new message.
  const response = await client.beta.messages.create({
    model: MODEL,
    // Ceiling on output. Thinking tokens count toward it too, so do not
    // set this tight. If it is hit, stop_reason becomes "max_tokens".
    max_tokens: 4096,
    // Safety classifiers can decline a benign request (see Part B).
    // This asks the API to retry the same request on a fallback model
    // inside the same call, so the harness gets an answer instead of
    // empty content.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages,
  });

  // 3. Check WHY the model stopped before touching content.
  if (response.stop_reason === "refusal") {
    // Whole fallback chain declined. Content is empty. Surface it.
    const d = response.stop_details;
    return `[REFUSED: ${d?.category ?? "unknown"}] ${d?.explanation ?? ""}`;
  }
  if (response.stop_reason === "max_tokens") {
    console.warn("WARNING: reply was cut off by max_tokens");
  }

  // 4. Append the model's turn. The WHOLE content array, not the text we
  //    extracted. This keeps the thinking block (and its signature), any
  //    fallback block, and, from lesson 3 on, the tool_use blocks.
  //    Rule: append-only. Never edit or delete an earlier turn.
  messages.push({ role: "assistant", content: response.content });

  usageLog.push({
    turn: usageLog.length + 1,
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
    historyLength: messages.length,
  });

  // 5. Pull out just the text for display.
  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

const q1 = "My name is Arthur and I'm building an agent harness in TypeScript. Reply in one short sentence.";
console.log("USER:", q1);
console.log("CLAUDE:", await ask(q1));

const q2 = "What's my name and what am I building? One sentence.";
console.log("\nUSER:", q2);
console.log("CLAUDE:", await ask(q2));

// ------------------------------------------------------------
// PART B: control experiment. SAME question, EMPTY history, plain call.
// Expected: the model says it does not know. Observed: a refusal.
// ------------------------------------------------------------
console.log("\n--- PART B: same question, no history, no fallback ---");
const plain = await client.messages.create({
  model: MODEL,
  max_tokens: 4096,
  messages: [{ role: "user", content: q2 }],
});
console.log("stop_reason :", plain.stop_reason);
console.log("blocks      :", plain.content.length === 0 ? "(none)" : plain.content.map((b) => b.type).join(", "));
if (plain.stop_reason === "refusal") {
  console.log("category    :", plain.stop_details?.category);
}

// ------------------------------------------------------------
// PART C: same call, fallback enabled. The API re-runs the request on
// another model inside the same HTTP call and tells us it did so.
// ------------------------------------------------------------
console.log("\n--- PART C: same question, no history, WITH fallback ---");
const rescued = await client.beta.messages.create({
  model: MODEL,
  max_tokens: 4096,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  messages: [{ role: "user", content: q2 }],
});
console.log("stop_reason :", rescued.stop_reason);
console.log("served by   :", rescued.model);
for (const b of rescued.content) {
  if (b.type === "fallback") console.log("fallback    :", b.from.model, "declined ->", b.to.model, "continued");
  if (b.type === "text") console.log("CLAUDE      :", b.text);
}

// ------------------------------------------------------------
// PART D: what the conversation array looks like now.
// ------------------------------------------------------------
console.log("\n=== the conversation array (role + block types) ===");
for (const [i, m] of messages.entries()) {
  const shape =
    typeof m.content === "string"
      ? `"${m.content.slice(0, 50)}"`
      : m.content.map((b) => b.type).join(" + ");
  console.log(`${i}: ${m.role.padEnd(9)} ${shape}`);
}

console.log("\n=== tokens per turn ===");
console.table(usageLog);
