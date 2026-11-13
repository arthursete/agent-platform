// ============================================================
// Lesson 3: the first tool. Define it, offer it, watch the model ASK for it.
//
// We do NOT run the tool in this lesson. That is lesson 4. Today is about
// seeing exactly what the model sends back when it wants something done.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

// ------------------------------------------------------------
// A tool is a CONTRACT, not code. Three parts:
//   name          how the model refers to it
//   description   when and why to use it. The model reads this closely.
//                 Say WHEN to call it, not only what it does.
//   input_schema  JSON Schema for the arguments the model must produce
//
// Notice there is no function here. The model never runs anything.
// It can only emit a request matching this shape. Running it is our job.
// ------------------------------------------------------------
const listDirectory: Anthropic.Beta.BetaTool = {
  name: "list_directory",
  description:
    "List the files and folders directly inside a directory. Call this whenever " +
    "the user asks what files exist or what a folder contains, or before reading " +
    "a file whose exact name you are not sure of.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory path relative to the project root. Use '.' for the root.",
      },
    },
    required: ["path"],
  },
};

const messages: Anthropic.Beta.BetaMessageParam[] = [
  { role: "user", content: "What files are in the steps folder?" },
];

// Shared request settings so Part A and Part B send the same thing.
const base = {
  model: MODEL,
  max_tokens: 4096,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
  tools: [listDirectory], // the menu of tools the model MAY ask for
};

// ------------------------------------------------------------
// PART A: offer the tool and look at what comes back.
// ------------------------------------------------------------
const response = await client.beta.messages.create({ ...base, messages });

console.log("=== PART A: the model's reply ===");
console.log("stop_reason:", response.stop_reason);
console.log("blocks     :", response.content.map((b) => b.type).join(", "));

for (const block of response.content) {
  if (block.type === "text") {
    console.log("\nTEXT block:", block.text);
  }
  if (block.type === "tool_use") {
    console.log("\nTOOL_USE block:");
    console.log("  id   :", block.id);
    console.log("  name :", block.name);
    console.log("  input:", JSON.stringify(block.input));
    console.log("\n  raw  :", JSON.stringify(block, null, 2).split("\n").join("\n         "));
  }
}

// ------------------------------------------------------------
// PART B: the contract has teeth. The model asked for a tool. What if we
// ignore that and just send another plain user message?
// ------------------------------------------------------------
console.log("\n=== PART B: try to continue WITHOUT answering the tool request ===");
messages.push({ role: "assistant", content: response.content });
messages.push({ role: "user", content: "Never mind, just say hi." });

try {
  await client.beta.messages.create({ ...base, messages });
  console.log("Unexpected: the API accepted it.");
} catch (err) {
  // Typed SDK errors. Never string-match error text to decide what happened.
  if (err instanceof Anthropic.BadRequestError) {
    console.log("API rejected it with HTTP", err.status);
    console.log("message:", err.message);
  } else {
    throw err;
  }
}
