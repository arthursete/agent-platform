// ============================================================
// What a tool looks like inside the harness.
//
// Lesson 3 showed the half the MODEL sees: name, description, input schema.
// This adds the half only OUR code sees:
//   requiresApproval  a risk flag the harness checks before running anything
//   run               the function that actually does the work
//
// The model never sees `requiresApproval` and never calls `run`. It can
// only ask. Whether the ask is carried out is decided here, in code.
// ============================================================

export interface ToolOutcome {
  text: string; // what the model reads back
  isError: boolean; // true = it failed. The model can read why and try again.
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema for the arguments
  requiresApproval: boolean;
  run(input: unknown): Promise<ToolOutcome>;
}

// One line of the run's history: what the model asked for and what happened.
export interface ToolCallRecord {
  name: string;
  input: unknown;
  outcome: ToolOutcome;
  blocked: boolean; // true = the harness refused to run it
}

// What the loop reports while it works, in the order things happen.
export type AgentEvent =
  | { type: "text"; delta: string } // the model wrote some more of its reply
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; name: string; blocked: boolean; failed: boolean; detail?: string };
